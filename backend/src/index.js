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

async function readBody(request) {
  try { return await request.json(); } catch { throw new ValidationError('JSON буруу байна.'); }
}

async function getSettings(db) {
  return db.prepare('SELECT goal, mode FROM settings WHERE id = 1').first();
}

async function route(request, env) {
  const { pathname } = new URL(request.url);
  const db = env.DB;
  const method = request.method;

  if (pathname === '/api/health') return json({ ok: true });

  if (pathname === '/api/settings') {
    if (method === 'GET') return json(await getSettings(db));
    if (method === 'PUT') {
      const { goal, mode } = checkSettings(await readBody(request));
      await db.prepare('UPDATE settings SET goal = ?1, mode = ?2 WHERE id = 1').bind(goal, mode).run();
      return json({ goal, mode });
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
