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

  const { visitorId } = await req.json().catch(() => ({}));
  if (!visitorId) return json(400, { error: "Missing visitorId" });

  const redis = Redis.fromEnv();
  const sessionId = crypto.randomUUID();
  const key = `visitor:${visitorId}:session`;

  // set new session with TTL 60s
  await redis.set(key, sessionId, { ex: 60 });
  return json(200, { sessionId });
}

