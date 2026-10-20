class ValidationError extends Error {}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
const fail = (status, error) => json({ error }, status);

async function route(request) {
  const { pathname } = new URL(request.url);

  if (pathname === '/api/health') return json({ ok: true });

  return fail(404, 'Олдсонгүй.');
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      return await route(request);
    } catch (err) {
      if (err instanceof ValidationError) return fail(400, err.message);
      console.error(err);
      return fail(500, 'Серверийн алдаа.');
    }
  }
};
