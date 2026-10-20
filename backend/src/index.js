import { PlanError, suggestPlan } from './plan.js';

import { CONTRACT_VERSION, ContractError, validateId, validateSettings, validateEntry, validateEventPatch } from '../../shared/contracts.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
const fail = (status, error) => json({ error }, status);

function toEvent(row) {
  if (!row) return null;
  const { device_id, ...event } = row;
  if (device_id !== null && device_id !== undefined) event.deviceId = device_id;
  return validateEntry(event);
}

const EVENT_COLUMNS = 'id, amount, type, at, device_id';

async function readBody(request) {
  try { return await request.json(); } catch { throw new ContractError('JSON буруу байна.'); }
}

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

  if (pathname === '/api/plan' && method === 'POST') return json(await suggestPlan(await readBody(request), env));

  if (pathname === '/api/state' && method === 'GET') {
    const [settings, events] = await Promise.all([getSettings(db), listEvents(db)]);
    return json({ ...settings, events });
  }

  if (pathname === '/api/settings') {
    if (method === 'GET') return json(await getSettings(db));
    if (method === 'PUT') {
      const { goal, mode } = validateSettings(await readBody(request));
      await db.prepare('UPDATE settings SET goal = ?1, mode = ?2 WHERE id = 1').bind(goal, mode).run();
      return json({ goal, mode });
    }
  }

  if (pathname === '/api/events') {
    if (method === 'GET') {
      return json(await listEvents(db, searchParams.get('from'), searchParams.get('to')));
    }
    if (method === 'POST') {
      const body = await readBody(request);
      const event = validateEntry({ ...body, id: body?.id ?? crypto.randomUUID() });
      if (event.deviceId && !body?.id) throw new ContractError('Төхөөрөмжийн бүртгэл тогтмол ID-тай байх ёстой.');
      const payload = JSON.stringify(event);
      const [receiptInsert, , receipts, rows] = await db.batch([
        db.prepare('INSERT INTO event_receipts (id, payload) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING').bind(event.id, payload),
        db.prepare(`INSERT INTO events (id, amount, type, at, device_id)
          SELECT ?1, ?2, ?3, ?4, ?5 FROM event_receipts WHERE id = ?1 AND payload = ?6 AND deleted = 0
          ON CONFLICT(id) DO NOTHING`).bind(event.id, event.amount, event.type, event.at, event.deviceId ?? null, payload),
        db.prepare('SELECT payload, deleted FROM event_receipts WHERE id = ?1').bind(event.id),
        db.prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = ?1`).bind(event.id),
      ]);
      const receipt = receipts.results[0];
      if (receipt.payload !== payload) return fail(409, 'Энэ ID өөр анхны өгөгдөлтэй бүртгэгдсэн байна.');
      if (receipt.deleted) return new Response(null, { status: 204, headers: cors });
      return json(toEvent(rows.results[0]), receiptInsert.meta.changes ? 201 : 200);
    }
  }

  const match = pathname.match(/^\/api\/events\/([^/]+)$/);
  if (match) {
    let decoded;
    try { decoded = decodeURIComponent(match[1]); } catch { throw new ContractError('ID буруу байна.'); }
    const id = validateId(decoded);
    if (method === 'PATCH') {
      const changes = validateEventPatch(await readBody(request));
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
      if (err instanceof ContractError) return fail(400, err.message);
      if (err instanceof PlanError) return fail(err.status, err.message);
      console.error(err);
      return fail(500, 'Серверийн алдаа.');
    }
  }
};
