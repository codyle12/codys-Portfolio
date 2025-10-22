export const config = { runtime: "edge" };

import { Redis } from "@upstash/redis";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sanitize(s: unknown, max = 5000) {
  if (typeof s !== "string") return "";
  return s.replace(/[\u0000-\u001F]/g, "").slice(0, max).trim();
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const { name, email, subject, message } = await req.json().catch(() => ({}));
  const n = sanitize(name, 120);
  const e = sanitize(email, 200);
  const sub = sanitize(subject, 200);
  const msg = sanitize(message, 8000);
  if (!n || !e || !sub || !msg) return json(400, { error: "Missing fields" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return json(400, { error: "Invalid email" });

  // Optional naive rate-limit: 5/min per IP
  try {
    const redis = Redis.fromEnv();
    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
    const key = `contact:ip:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    if (count > 5) return json(429, { error: "Too many requests. Please try again later." });
  } catch {}

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const CONTACT_TO = process.env.CONTACT_TO || "codyle129@gmail.com";
  const CONTACT_FROM = process.env.CONTACT_FROM || "Portfolio <onboarding@resend.dev>";
  if (!RESEND_API_KEY) return json(500, { error: "Email service not configured" });

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <h2 style="margin:0 0 12px">New portfolio message</h2>
    <p><strong>From:</strong> ${escapeHtml(n)} &lt;${escapeHtml(e)}&gt;</p>
    <p><strong>Subject:</strong> ${escapeHtml(sub)}</p>
    <hr/>
    <pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace">${escapeHtml(msg)}</pre>
  </div>`;
  const text = `New portfolio message

From: ${n} <${e}>
Subject: ${sub}

${msg}
`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: CONTACT_FROM,
      to: [CONTACT_TO],
      reply_to: e,
      subject: `[Portfolio] ${sub} — from ${n}`,
      html, text
    })
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    return json(502, { error: "Failed to send email", details: errText.slice(0, 500) });
  }

  return json(200, { ok: true });
}

function escapeHtml(str: string) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
