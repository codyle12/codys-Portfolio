(function () {
  const root = document.documentElement;

  // ---------------- Config: volumes (quieter UI sounds) ----------------
  const HTML_AUDIO_VOLUME = 0.2;
  const FALLBACK_CLICK_GAIN = 0.03;
  const FALLBACK_NOTE_GAIN  = 0.035;

  // ---------------- Optional external SFX ----------------
  const clickEl   = document.getElementById("sfxClick");
  const darkOnEl  = document.getElementById("sfxDarkOn");
  const darkOffEl = document.getElementById("sfxDarkOff");
  const failEl    = document.getElementById("sfxFail");
  [clickEl, darkOnEl, darkOffEl, failEl].forEach(el => el && (el.volume = HTML_AUDIO_VOLUME));

  // ---------------- WebAudio fallback ----------------
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = AudioCtx ? new AudioCtx() : null;

  function sfxPref() { return localStorage.getItem("sfx") !== "off"; }
  let sfxOn = sfxPref();

  function resumeAudioIfNeeded() {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }

  function blip({ freq = 1600, duration = 0.04, type = "square", gain = FALLBACK_CLICK_GAIN }) {
    if (!audioCtx || !sfxOn) return;
    resumeAudioIfNeeded();
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + duration);
  }

  function playEl(el) {
    if (!el || !sfxOn) return false;
    try { el.currentTime = 0; el.play().catch(() => {}); return true; } catch { return false; }
  }

  const SFX = {
    click() { if (playEl(clickEl)) return; blip({ freq: 1900, duration: 0.03 }); },
    darkToggle(on) {
      if (on) { if (playEl(darkOnEl)) return; } else { if (playEl(darkOffEl)) return; }
      if (!audioCtx || !sfxOn) return;
      resumeAudioIfNeeded();
      const t0 = audioCtx.currentTime + 0.001;
      const note = (f, s, d = 0.06, g = FALLBACK_NOTE_GAIN) => {
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.type = "triangle"; o.frequency.setValueAtTime(f, s);
        gn.gain.setValueAtTime(g, s);
        gn.gain.exponentialRampToValueAtTime(0.0001, s + d);
        o.connect(gn).connect(audioCtx.destination);
        o.start(s); o.stop(s + d);
      };
      on ? (note(520, t0), note(880, t0 + 0.06)) : note(340, t0);
    },
    fail() {
      if (playEl(failEl)) return;
      if (!audioCtx || !sfxOn) return;
      resumeAudioIfNeeded();
      const t0 = audioCtx.currentTime + 0.001;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(300, t0);
      o.frequency.exponentialRampToValueAtTime(160, t0 + 0.18);
      g.gain.setValueAtTime(FALLBACK_CLICK_GAIN * 1.6, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.2);
    }
  };

  // ---------------- Theme ----------------
  const stored = localStorage.getItem("theme");
  if (stored) root.classList.toggle("dark", stored === "dark"); else root.classList.add("dark");

  const home = document.getElementById("home");
  const appWindows = Array.from(document.querySelectorAll(".app-window"));
  const darkToggle = document.getElementById("darkToggle");
  const soundToggle = document.getElementById("soundToggle");
  const launchers = Array.from(document.querySelectorAll(".launch[data-app]"));

  // Icon elements (SVGs)
  const darkIcon = document.getElementById("darkIcon");
  const soundIcon = document.getElementById("soundIcon");

  function setDarkIconByTheme() {
    const isDark = root.classList.contains("dark");
    if (darkIcon) {
      darkIcon.src = isDark ? "assets/icons/moon.svg" : "assets/icons/sun.svg";
      darkToggle?.setAttribute("aria-pressed", String(isDark));
      darkToggle?.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");
    }
  }

  // ---------------- Sound toggle UI ----------------
  function setSoundToggleVisual() {
    if (!soundToggle) return;
    soundToggle.setAttribute("aria-pressed", String(!!sfxOn));
    if (soundIcon) soundIcon.src = sfxOn ? "assets/icons/sound-on.svg" : "assets/icons/sound-off.svg";
    soundToggle.title = sfxOn ? "UI sounds: on" : "UI sounds: off";
  }

  setDarkIconByTheme();
  setSoundToggleVisual();

  if (soundToggle) {
    soundToggle.addEventListener("click", () => {
      sfxOn = !sfxOn;
      localStorage.setItem("sfx", sfxOn ? "on" : "off");
      setSoundToggleVisual();
      if (sfxOn) SFX.click();
    });
  }

  if (darkToggle) {
    darkToggle.addEventListener("click", () => {
      const nowDark = root.classList.toggle("dark");
      localStorage.setItem("theme", nowDark ? "dark" : "light");
      setDarkIconByTheme();
      SFX.darkToggle(nowDark);
    });
  }

  // ---------------- Global click SFX ----------------
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.classList.contains("launch") && btn.hasAttribute("data-app")) {
      const win = document.getElementById("win-" + btn.dataset.app);
      if (win && win.classList.contains("open") && isTopmostOpen(win)) return;
    }
    if (btn.id === "darkToggle") return;
    if (btn.id === "soundToggle" && sfxOn === false) return;
    SFX.click();
  }, { capture: true });

  // ---------------- Windows helpers ----------------
  let z = 300;
  function bringToFront(el) { z += 1; el.style.zIndex = String(z); }
  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  function isTopmostOpen(win) {
    if (!win || !win.classList.contains("open")) return false;
    const openWins = Array.from(document.querySelectorAll(".app-window.open"));
    if (!openWins.length) return false;
    const maxZ = Math.max(...openWins.map(w => parseInt(getComputedStyle(w).zIndex || "0") || 0));
    const zc = parseInt(getComputedStyle(win).zIndex || "0") || 0;
    return zc >= maxZ;
  }

  function setTransformOriginFromPoint(win, x, y) {
    const rect = win.getBoundingClientRect();
    const ox = Math.min(Math.max(x - rect.left, 0), rect.width);
    const oy = Math.min(Math.max(y - rect.top, 0), rect.height);
    win.style.transformOrigin = `${ox}px ${oy}px`;
  }

  function growToFront(win, fromX, fromY) {
    if (Number.isFinite(fromX) && Number.isFinite(fromY)) setTransformOriginFromPoint(win, fromX, fromY);
    win.classList.remove("opening"); void win.offsetWidth;
    win.classList.add("opening");
    win.addEventListener("animationend", () => win.classList.remove("opening"), { once: true });
    bringToFront(win);
  }

  function placeBelowHome(win, offsetIndex) {
    if (!home) return;
    const pad = 12;
    const h = home.getBoundingClientRect();
    const showTemp = !win.classList.contains("open");
    const prev = win.style.display;
    if (showTemp) { win.style.visibility = "hidden"; win.style.display = "block"; }
    const w = win.getBoundingClientRect();
    const top  = Math.min(window.innerHeight - w.height - pad, h.bottom + pad);
    const left = Math.min(Math.max(pad, h.left + (h.width - w.width) / 2 + (offsetIndex || 0) * 24), window.innerWidth - w.width - pad);
    win.style.top = top + "px";
    win.style.left = left + "px";
    if (showTemp) { win.style.display = prev; win.style.visibility = ""; }
  }

  function openApp(app, offsetIndex, fromX, fromY) {
    const win = document.getElementById("win-" + app);
    if (!win) return;
    win.classList.add("open");
    if (!win.dataset.posInit) { placeBelowHome(win, offsetIndex); win.dataset.posInit = "1"; }
    growToFront(win, fromX, fromY);
    if (app === "contact") initCaptcha();
  }

  // Launchers: open, bring-to-front, or fail
  launchers.forEach((btn, i) => btn.addEventListener("click", (e) => {
    const win = document.getElementById("win-" + btn.dataset.app);
    if (!win || !win.classList.contains("open")) return openApp(btn.dataset.app, i, e.clientX, e.clientY);
    if (!isTopmostOpen(win)) return growToFront(win, e.clientX, e.clientY);
    win.classList.remove("shake"); void win.offsetWidth; win.classList.add("shake");
    SFX.fail();
  }));

  // Wire close buttons
  function wireCloseButtons(scope = document) {
    scope.querySelectorAll(".close").forEach((btn) => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const win = btn.closest(".app-window, .window");
        if (!win || win.id === "home") return;
        win.classList.remove("open");
        if (win.id === "win-sent") win.style.display = "none";
      });
    });
  }
  wireCloseButtons();

  // Dragging
  Array.from(document.querySelectorAll(".app-window")).forEach((win) => {
    const handle = win.querySelector(".drag-handle");
    if (!handle) return;
    let dragging = false, dx = 0, dy = 0;

    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".controls") || e.target.closest(".close")) return;
      if (!win.classList.contains("open")) return;
      dragging = true;
      document.body.classList.add("dragging");
      bringToFront(win);
      const rect = win.getBoundingClientRect();
      dx = e.clientX - rect.left; dy = e.clientY - rect.top;
      handle.setPointerCapture?.(e.pointerId);
    });

    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      e.preventDefault();
      const left = Math.min(Math.max(e.clientX - dx, -(win.offsetWidth - 80)), window.innerWidth - 40);
      const top  = Math.min(Math.max(e.clientY - dy, -(parseFloat(getComputedStyle(root).getPropertyValue('--titlebar-h')) - 12)), window.innerHeight - 40);
      win.style.left = left + "px"; win.style.top = top + "px";
    }, { passive: false });

    window.addEventListener("pointerup", (e) => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("dragging");
      handle.releasePointerCapture?.(e.pointerId);
    });

    win.addEventListener("mousedown", () => bringToFront(win));
    window.addEventListener("resize", () => {
      if (!win.classList.contains("open")) return;
      const rect = win.getBoundingClientRect();
      const left = Math.min(Math.max(rect.left, -(win.offsetWidth - 80)), window.innerWidth - 40);
      const top  = Math.min(Math.max(rect.top, -(parseFloat(getComputedStyle(root).getPropertyValue('--titlebar-h')) - 12)), window.innerHeight - 40);
      win.style.left = left + "px"; win.style.top = top + "px";
    });
  });

  // ---------------- Contact: CAPTCHA + send to backend ----------------
  const form = document.getElementById("contactForm");
  const captchaQ = document.getElementById("captchaQuestion");
  const captchaA = document.getElementById("captchaAnswer");
  const successWin = document.getElementById("win-sent");

  function rand(n, m) { return Math.floor(Math.random() * (m - n + 1)) + n; }
  function initCaptcha() {
    if (!captchaQ || !captchaA) return;
    const a = rand(2, 9);
    const b = rand(2, 9);
    initCaptcha.answer = a + b;
    captchaQ.textContent = `What is ${a} + ${b}?`;
    captchaA.value = "";
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = (document.getElementById("name").value || "").trim();
      const email = (document.getElementById("email").value || "").trim();
      const subject = (document.getElementById("subject").value || "").trim();
      const message = (document.getElementById("message").value || "").trim();
      const cap = (captchaA.value || "").trim();
      if (!name || !email || !subject || !message) { alert("Please fill out all fields."); return; }
      if (String(initCaptcha.answer) !== cap) { alert("CAPTCHA incorrect. Please try again."); initCaptcha(); return; }

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message })
      }).then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          alert(data.error ? `Send failed: ${data.error}` : "Send failed. Please try again later.");
          return;
        }
        if (successWin) {
          successWin.style.display = "block";
          successWin.classList.add("open");
          // center tiny success window
          const pad = 12;
          successWin.style.visibility = "hidden"; successWin.style.display = "block";
          const rr = successWin.getBoundingClientRect();
          const left = Math.max(pad, (window.innerWidth - rr.width) / 2);
          const top  = Math.max(pad, (window.innerHeight - rr.height) / 2);
          successWin.style.left = left + "px"; successWin.style.top  = top + "px";
          successWin.style.visibility = "";
        }
        form.reset();
        initCaptcha();
      }).catch(() => {
        alert("Network error. Please try again later.");
      });
    });
  }

  // ---------------- Buddy (GIF only) ----------------
  const buddy = document.getElementById("buddy");
  const buddyAudio = document.getElementById("buddyAudio");
  if (buddy && buddyAudio) {
    buddyAudio.volume = 0.25;
    buddy.setAttribute("aria-pressed", "false");
    function toggleBuddy() {
      const isPlaying = buddy.getAttribute("aria-pressed") === "true";
      buddy.setAttribute("aria-pressed", String(!isPlaying));
      if (isPlaying) { buddyAudio.pause(); buddyAudio.currentTime = 0; }
      else { buddyAudio.play().catch(() => {}); }
    }
    buddy.addEventListener("click", toggleBuddy);
    buddy.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleBuddy(); }
    });
  }

  // ---------------- Backend: Single-active-tab per visitor ----------------
  const HEARTBEAT_MS = 10000; // 10s

  function getVisitorId() {
    let v = localStorage.getItem("visitor_id");
    if (!v) { v = (self.crypto?.randomUUID?.() || String(Math.random())).replace(/[^a-z0-9-]/gi, ""); localStorage.setItem("visitor_id", v); }
    return v;
  }

  let sessionId = null;
  let hb = null;

  function standbyOverlay() {
    const tpl = document.getElementById("standbyTemplate"); if (!tpl) return;
    const overlay = tpl.content.firstElementChild.cloneNode(true);
    overlay.querySelector(".standby-btn").addEventListener("click", () => { window.location.href = "/replaced.html"; });
    document.body.appendChild(overlay);
    try { buddyAudio?.pause(); } catch {}
  }

  async function claimSession() {
    const visitorId = getVisitorId();
    const res = await fetch("/api/session/claim", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ visitorId }) });
    if (!res.ok) return;
    const data = await res.json();
    sessionId = data.sessionId;
  }

  async function sendHeartbeat() {
    if (!sessionId) return;
    const visitorId = getVisitorId();
    const res = await fetch("/api/session/heartbeat", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ visitorId, sessionId }) });
    if (res.status === 409) { clearInterval(hb); standbyOverlay(); return; }
  }

  (async function initSingleton() {
    try {
      await claimSession();
      await sendHeartbeat();
      hb = setInterval(sendHeartbeat, HEARTBEAT_MS);
      window.addEventListener("beforeunload", () => { clearInterval(hb); });
    } catch {}
  })();

})();
