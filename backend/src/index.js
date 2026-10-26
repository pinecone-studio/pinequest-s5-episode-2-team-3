import { readJson, BodyError } from './body.js';
import { ingestDeviceEvent, ingestReading, listDevices } from './devices.js';
import { deleteMember, getLeaderboard, putMember } from './family.js';
import { EVENT_COLUMNS, insertEvent, toEvent } from './events.js';
import { readSnapshot, applySnapshot } from './sync.js';
import { PlanError, suggestPlan } from './plan.js';
import { suggestInsight } from './insight.js';

import { CONTRACT_VERSION, ContractError, validateId, validateSettings, validateEntry, validateEventPatch } from '../../shared/contracts.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
const fail = (status, error) => json({ error }, status);
const respond = ({ status, body }) => status === 204 ? new Response(null, { status, headers: cors }) : json(body, status);

async function getSettings(db) {
  return db.prepare('SELECT goal, mode FROM settings WHERE id = 1').first();
}

async function listEvents(db, from, to) {
  const { results } = await db
    .prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE at >= ?1 AND at < ?2 ORDER BY at DESC`)
    .bind(from ?? '0000', to ?? '9999')
    .all();
  return results.map(toEvent);
}

async function route(request, env) {
  const { pathname, searchParams } = new URL(request.url);
  const db = env.DB;
  const method = request.method;

  if (pathname === '/api/health') return json({ ok: true, ai: Boolean(env.ANTHROPIC_API_KEY), contractVersion: CONTRACT_VERSION });

  if (pathname === '/api/plan' && method === 'POST') return json(await suggestPlan(await readJson(request), env));
  if (pathname === '/api/insight' && method === 'POST') return json(await suggestInsight(await readJson(request), env));

  if (pathname === '/api/devices' && method === 'GET') return json(await listDevices(db));
  const readingPath = pathname.match(/^\/api\/devices\/([a-zA-Z0-9-]{1,64})\/readings$/);
  if (readingPath && method === 'POST') return respond(await ingestReading(request, env, readingPath[1]));
  const deviceEventPath = pathname.match(/^\/api\/devices\/([a-zA-Z0-9-]{1,64})\/events$/);
  if (deviceEventPath && method === 'POST') return respond(await ingestDeviceEvent(request, env, deviceEventPath[1]));

  // Family leaderboard: everyone using one base (see shared/family.ts).
  const boardPath = pathname.match(/^\/api\/bases\/([^/]+)\/leaderboard$/);
  if (boardPath && method === 'GET') return json(await getLeaderboard(db, boardPath[1], searchParams));
  const memberPath = pathname.match(/^\/api\/bases\/([^/]+)\/members\/([^/]+)$/);
  if (memberPath && method === 'PUT') return json(await putMember(request, db, memberPath[1], memberPath[2]));
  if (memberPath && method === 'DELETE') {
    return (await deleteMember(db, memberPath[1], memberPath[2])) ? new Response(null, { status: 204, headers: cors }) : fail(404, 'Гишүүн олдсонгүй.');
  }

  if (pathname === '/api/sync') {
    if (method === 'GET') return json(await readSnapshot(db));
    if (method === 'POST') { const result = await applySnapshot(request, db); return json(result.body, result.status); }
  }

  if (pathname === '/api/state' && method === 'GET') {
    const [settings, events] = await Promise.all([getSettings(db), listEvents(db)]);
    return json({ ...settings, events });
  }

  if (pathname === '/api/settings') {
    if (method === 'GET') return json(await getSettings(db));
    if (method === 'PUT') {
      const { goal, mode } = validateSettings(await readJson(request));
      await db.prepare('UPDATE settings SET goal = ?1, mode = ?2 WHERE id = 1').bind(goal, mode).run();
      return json({ goal, mode });
    }
  }

  if (pathname === '/api/events') {
    if (method === 'GET') {
      return json(await listEvents(db, searchParams.get('from'), searchParams.get('to')));
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const event = validateEntry({ ...body, id: body?.id ?? crypto.randomUUID() });
      if (event.deviceId && !body?.id) throw new ContractError('Төхөөрөмжийн бүртгэл тогтмол ID-тай байх ёстой.');
      return respond(await insertEvent(db, event));
    }
  }

  const match = pathname.match(/^\/api\/events\/([^/]+)$/);
  if (match) {
    let decoded;
    try { decoded = decodeURIComponent(match[1]); } catch { throw new ContractError('ID буруу байна.'); }
    const id = validateId(decoded);
    if (method === 'PATCH') {
      const changes = validateEventPatch(await readJson(request));
      const keys = Object.keys(changes);
      if (keys.length) {
        const sets = keys.map((key, i) => `${key} = ?${i + 2}`).join(', ');
        await db.prepare(`UPDATE events SET ${sets} WHERE id = ?1`).bind(id, ...keys.map(k => changes[k])).run();
      }
      const event = await db.prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = ?1`).bind(id).first();
      return event ? json(toEvent(event)) : fail(404, 'Бүртгэл олдсонгүй.');
    }
    if (method === 'DELETE') {
      const [, { meta }] = await db.batch([
        db.prepare('UPDATE event_receipts SET deleted = 1 WHERE id = ?1').bind(id),
        db.prepare('DELETE FROM events WHERE id = ?1').bind(id),
      ]);
      return meta.changes ? new Response(null, { status: 204, headers: cors }) : fail(404, 'Бүртгэл олдсонгүй.');
    }
  }

  return fail(404, 'Олдсонгүй.');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      return await route(request, env);
    } catch (err) {
      if (err instanceof BodyError) return fail(err.status, err.message);
      if (err instanceof ContractError) return fail(400, err.message);
      if (err instanceof PlanError) return fail(err.status, err.message);
      console.error(err);
      return fail(500, 'Серверийн алдаа.');
    }
  }
};
