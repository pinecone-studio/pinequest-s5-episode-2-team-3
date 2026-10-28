import { PlanError } from './plan.js';

// The AI endpoints cost money per call: each caller (a hash of the IP) gets LIMIT calls per route per hour.
export const LIMIT = 30;

async function callerOf(request) {
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ?? 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dusal:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function rateLimit(db, request, route, now = new Date()) {
  if (!db) return;
  const hour = now.toISOString().slice(0, 13);
  const caller = await callerOf(request);
  await db.prepare('DELETE FROM rate_limits WHERE hour < ?1').bind(new Date(now.getTime() - 3600e3).toISOString().slice(0, 13)).run();
  const row = await db.prepare('INSERT INTO rate_limits (caller, route, hour, count) VALUES (?1, ?2, ?3, 1) ON CONFLICT(caller, route, hour) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(caller, route, hour).first();
  if ((row?.count ?? 0) > LIMIT) throw new PlanError(429, 'Хэт олон удаа асуулаа. Нэг цагийн дараа дахин оролдоно уу.');
}
