(function () {
  const root = document.documentElement;

  // ---------------- Theme (default dark, remember)
  const storedTheme = localStorage.getItem("theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    root.classList.toggle("dark", storedTheme === "dark");
  } else {
    root.classList.add("dark");
  }

  // ---------------- Elements
  const home        = document.getElementById("home");
  const appWindows  = Array.from(document.querySelectorAll(".app-window"));
  const launchers   = Array.from(document.querySelectorAll(".launch[data-app]"));
  const darkToggle  = document.getElementById("darkToggle");
  const soundToggle = document.getElementById("soundToggle");
  const darkIcon    = document.getElementById("darkIcon");
  const soundIcon   = document.getElementById("soundIcon");

  // ---------------- Audio / SFX
  const clickEl   = document.getElementById("sfxClick");
  const darkOnEl  = document.getElementById("sfxDarkOn");
  const darkOffEl = document.getElementById("sfxDarkOff");
  const failEl    = document.getElementById("sfxFail");

  // Respect prior setting; default ON
  let sfxOn = (localStorage.getItem("sfx") || "on") === "on";
  if (clickEl)   clickEl.volume   = 0.35;
  if (darkOnEl)  darkOnEl.volume  = 0.5;
  if (darkOffEl) darkOffEl.volume = 0.5;
  if (failEl)    failEl.volume    = 0.5;

  // WebAudio fallback beeps (if audio elements missing or blocked)
  let audioCtx = null;
  const FALLBACK_CLICK_GAIN = 0.035;
  const FALLBACK_NOTE_GAIN  = 0.045;

  function resumeAudioIfNeeded() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
  }
  function blip({ freq = 1400, duration = 0.05, type = "square", gain = FALLBACK_CLICK_GAIN } = {}) {
    if (!sfxOn) return;
    resumeAudioIfNeeded();
    const t0 = audioCtx.currentTime + 0.001;
    const osc = audioCtx.createOscillator();
    const g   = audioCtx.createGain();
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
      if (on) { if (playEl(darkOnEl)) return; }
      else    { if (playEl(darkOffEl)) return; }
      if (!sfxOn) return;
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
      if (!sfxOn) return;
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

  // ---------------- Theme + Sound toggles
  function setDarkIconByTheme() {
    const isDark = root.classList.contains("dark");
    if (darkIcon) darkIcon.src = isDark ? "assets/icons/moon.svg" : "assets/icons/sun.svg";
    if (darkToggle) {
      darkToggle.setAttribute("aria-pressed", String(isDark));
      darkToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    }
  }
  function setSoundToggleVisual() {
    if (!soundToggle) return;
    soundToggle.setAttribute("aria-pressed", String(!!sfxOn));
    if (soundIcon) soundIcon.src = sfxOn ? "assets/icons/sound-on.svg" : "assets/icons/sound-off.svg";
    soundToggle.title = sfxOn ? "UI sounds: on" : "UI sounds: off";
  }
  setDarkIconByTheme();
  setSoundToggleVisual();

  if (darkToggle) {
    darkToggle.addEventListener("click", () => {
      const nowDark = root.classList.toggle("dark");
      localStorage.setItem("theme", nowDark ? "dark" : "light");
      setDarkIconByTheme();
      SFX.darkToggle(nowDark);
    });
  }
  if (soundToggle) {
    soundToggle.addEventListener("click", () => {
      sfxOn = !sfxOn;
      localStorage.setItem("sfx", sfxOn ? "on" : "off");
      setSoundToggleVisual();
      if (sfxOn) SFX.click();
    });
  }

  // ---------------- Global click SFX for buttons (left mouse only)
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const btn = e.target.closest("button");
    if (!btn) return;
    // Don’t double-play for dark toggle itself
    if (btn.id === "darkToggle") return;
    // Don’t play if user just toggled sounds OFF
    if (btn.id === "soundToggle" && sfxOn === false) return;

    // Special case: if launching a window that’s already topmost, we’ll play fail later
    if (btn.classList.contains("launch") && btn.hasAttribute("data-app")) {
      const win = document.getElementById("win-" + btn.dataset.app);
      if (win && win.classList.contains("open") && isTopmostOpen(win)) return;
    }
    SFX.click();
  }, { capture: true });

  // ---------------- Windows
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
    win.classList.remove("opening"); void win.offsetWidth; // restart animation
    win.classList.add("opening");
    win.addEventListener("animationend", () => win.classList.remove("opening"), { once: true });
    bringToFront(win);
  }

  function cssNumber(varName, fallback) {
    const val = getComputedStyle(root).getPropertyValue(varName).trim();
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : fallback;
  }
  function limitsFor(win) {
    const tb = cssNumber("--titlebar-h", 48);
    const minTop = -(tb - 12);
    const minLeft = -(win.offsetWidth - 80);
    const maxLeft = window.innerWidth - 40;
    const maxTop  = window.innerHeight - 40;
    return { minTop, maxTop, minLeft, maxLeft };
  }
  function nudgeIntoView(win) {
    const rect = win.getBoundingClientRect();
    const { minTop, maxTop, minLeft, maxLeft } = limitsFor(win);
    const newLeft = clamp(rect.left, minLeft, Math.max(minLeft, maxLeft));
    const newTop  = clamp(rect.top,  minTop,  Math.max(minTop,  maxTop));
    win.style.left = newLeft + "px";
    win.style.top  = newTop + "px";
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

  // Launchers: open, bring-to-front, or fail (shake+sound) if already front
  launchers.forEach((btn, i) => btn.addEventListener("click", (e) => {
    const win = document.getElementById("win-" + btn.dataset.app);
    if (!win || !win.classList.contains("open")) return openApp(btn.dataset.app, i, e.clientX, e.clientY);
    if (!isTopmostOpen(win)) return growToFront(win, e.clientX, e.clientY);
    win.classList.remove("shake"); void win.offsetWidth; win.classList.add("shake");
    SFX.fail();
  }));

  // Close buttons
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

  // Drag windows
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
      const { minTop, maxTop, minLeft, maxLeft } = limitsFor(win);
      const left = clamp(e.clientX - dx, minLeft, maxLeft);
      const top  = clamp(e.clientY - dy, minTop,  maxTop);
      win.style.left = left + "px";
      win.style.top  = top + "px";
    }, { passive: false });

    window.addEventListener("pointerup", (e) => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("dragging");
      handle.releasePointerCapture?.(e.pointerId);
    });

    win.addEventListener("mousedown", () => bringToFront(win));
    window.addEventListener("resize", () => nudgeIntoView(win));
  });

  // ESC closes topmost open window
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const openWins = Array.from(document.querySelectorAll(".app-window.open"));
    if (!openWins.length) return;
    const topmost = openWins.reduce((a, b) =>
      (parseInt(getComputedStyle(a).zIndex || "0") > parseInt(getComputedStyle(b).zIndex || "0")) ? a : b
    );
    topmost.classList.remove("open");
    if (topmost.id === "win-sent") topmost.style.display = "none";
  });

  // Keep inputs visible on mobile keyboards
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (!el.matches("input, textarea, select")) return;
    const content = el.closest(".app-window .content");
    if (content) {
      setTimeout(() => { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }); }, 100);
    }
  });

  // ---------------- View More (projects)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".viewmore");
    if (!btn) return;
    const id = btn.getAttribute("data-target");
    const panel = document.getElementById(id);
    if (!panel) return;
    const isOpen = panel.classList.toggle("open");
    if (isOpen) {
      panel.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
      if (btn.textContent.trim().toLowerCase() === "view more") btn.textContent = "View less";
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      if (btn.textContent.trim().toLowerCase() === "view less") btn.textContent = "View more";
    }
  });

  // ---------------- Contact (mailto + tiny success)
  const form = document.getElementById("contactForm");
  const captchaQ = document.getElementById("captchaQuestion");
  const captchaA = document.getElementById("captchaAnswer");
  const successWin = document.getElementById("win-sent");

  function rand(n, m) { return Math.floor(Math.random() * (m - n + 1)) + n; }
  let captchaAnswer = null;
  function initCaptcha() {
    if (!captchaQ || !captchaA) return;
    const a = rand(2, 9);
    const b = rand(2, 9);
    captchaAnswer = a + b;
    captchaQ.textContent = `What is ${a} + ${b}?`;
    captchaA.value = "";
  }
  initCaptcha();

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = (document.getElementById("name").value || "").trim();
      const email = (document.getElementById("email").value || "").trim();
      const subject = (document.getElementById("subject").value || "").trim();
      const message = (document.getElementById("message").value || "").trim();
      const cap = (captchaA.value || "").trim();
      if (!name || !email || !subject || !message) { alert("Please fill out all fields."); return; }
      if (String(captchaAnswer) !== cap) { alert("CAPTCHA incorrect. Please try again."); initCaptcha(); return; }

      // Send directly to Formspree (no Outlook, no backend needed)
fetch(form.action, {
  method: "POST",
  headers: { "Accept": "application/json" },
  body: new FormData(form) // sends name, email, subject, message
})
.then(async (r) => {
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.errors?.[0]?.message || "Failed to send");
  }

  // Show your tiny success window (keeps your current UI)
  if (successWin) {
    successWin.style.display = "block";
    successWin.classList.add("open");
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
})
.catch((e) => {
  alert("Sorry, your message could not be sent right now.\n\n" + e.message);
});

    });
  }

  // ---------------- Buddy (GIF + music; start paused)
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
})();

document.querySelectorAll(".dock .icon.launch[data-app]").forEach(btn => {
  const app = btn.dataset.app?.toLowerCase();
  const existingImg = btn.querySelector("img");
  if (existingImg) return; // already has icon, skip

  let iconSrc = "";
  switch (app) {
    case "about":
      iconSrc = "assets/icons/A.svg";
      break;
    case "projects":
      iconSrc = "assets/icons/P.svg";
      break;
    case "contact":
      iconSrc = "assets/icons/C.svg";
      break;
    case "links":
      iconSrc = "assets/icons/L.svg";
      break;
  }

  if (iconSrc) {
    const img = document.createElement("img");
    img.src = iconSrc;
    img.alt = `${app} icon`;
    img.classList.add("dock-icon");
    btn.textContent = "";
    btn.appendChild(img);
  }
});
