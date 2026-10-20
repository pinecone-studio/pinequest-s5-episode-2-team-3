const TYPES = ['drink', 'spill', 'pending'];
const ID_RE = /^[a-zA-Z0-9-]{1,64}$/;

class ValidationError extends Error {}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
const fail = (status, error) => json({ error }, status);

function checkSettings(body) {
  if (!body || !Number.isInteger(body.goal) || body.goal < 50 || body.goal > 10000 || !['goal', 'limit'].includes(body.mode)) {
    throw new ValidationError('Өдрийн тохиргоо буруу байна.');
  }
  return { goal: body.goal, mode: body.mode };
}

function checkEvent(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Бүртгэл буруу байна.');
  const out = {};
  if (!Number.isInteger(body.amount) || body.amount < 1 || body.amount > 5000) throw new ValidationError('Хэмжээ 1-5000 мл байх ёстой.');
  out.amount = body.amount;
  if (!TYPES.includes(body.type)) throw new ValidationError('Бүртгэлийн төрөл буруу байна.');
  out.type = body.type;
  if (typeof body.at !== 'string' || !Number.isFinite(Date.parse(body.at))) throw new ValidationError('Огноо буруу байна.');
  out.at = new Date(body.at).toISOString();
  return out;
}

async function readBody(request) {
  try { return await request.json(); } catch { throw new ValidationError('JSON буруу байна.'); }
}

async function getSettings(db) {
  return db.prepare('SELECT goal, mode FROM settings WHERE id = 1').first();
}

async function listEvents(db, from, to) {
  const { results } = await db
    .prepare('SELECT id, amount, type, at FROM events WHERE at >= ?1 AND at < ?2 ORDER BY at DESC')
    .bind(from ?? '0000', to ?? '9999')
    .all();
  return results;
}

async function route(request, env) {
  const { pathname, searchParams } = new URL(request.url);
  const db = env.DB;
  const method = request.method;

  if (pathname === '/api/health') return json({ ok: true });

  if (pathname === '/api/state' && method === 'GET') {
    const [settings, events] = await Promise.all([getSettings(db), listEvents(db)]);
    return json({ ...settings, events });
  }

  if (pathname === '/api/settings') {
    if (method === 'GET') return json(await getSettings(db));
    if (method === 'PUT') {
      const { goal, mode } = checkSettings(await readBody(request));
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
      const event = checkEvent(body);
      const id = body.id ?? crypto.randomUUID();
      if (typeof id !== 'string' || !ID_RE.test(id)) throw new ValidationError('id буруу байна.');
      try {
        await db.prepare('INSERT INTO events (id, amount, type, at) VALUES (?1, ?2, ?3, ?4)')
          .bind(id, event.amount, event.type, event.at).run();
      } catch (err) {
        if (String(err).includes('UNIQUE')) return fail(409, 'Энэ id-тай бүртгэл байна.');
        throw err;
      }
      return json({ id, ...event }, 201);
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
      if (err instanceof ValidationError) return fail(400, err.message);
      console.error(err);
      return fail(500, 'Серверийн алдаа.');
    }
  }
};
