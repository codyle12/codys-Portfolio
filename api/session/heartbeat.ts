export const config = { runtime: "edge" };

import { Redis } from "@upstash/redis";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const { visitorId, sessionId } = await req.json().catch(() => ({}));
  if (!visitorId || !sessionId) return json(400, { error: "Missing ids" });

  const redis = Redis.fromEnv();
  const key = `visitor:${visitorId}:session`;
  const current = await redis.get<string>(key);

  if (current && current !== sessionId) {
    // another tab owns the lease
    return json(409, { takeover: true });
  }

  // extend TTL to keep this session active
  await redis.set(key, sessionId, { ex: 60 });
  return json(200, { ok: true });
}
