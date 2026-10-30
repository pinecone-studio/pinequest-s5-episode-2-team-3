import { afterEach, expect, test } from 'bun:test';
import { LocalD1 } from './test-db';
import worker from './src/index.js';

const databases: LocalD1[] = [];
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));

// Google's tokeninfo stands in for a test double: a token "ok-<sub>-<email>" is valid for our client.
const CLIENT = '253911522297-p7ulev5jt6lo8qv674m50j6h5776gr3h.apps.googleusercontent.com';
const verifyGoogle = async (token: string) => {
  const [, sub, email, aud = CLIENT] = token.split('|');
  if (!token.startsWith('ok|')) throw Object.assign(new Error('bad'), { status: 401 });
  return { aud, sub, email, email_verified: 'true', given_name: 'Сараа' };
};

function setup() {
  const db = new LocalD1(); databases.push(db);
  const call = (method: string, path: string, body?: unknown, token?: string) => worker.fetch(new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { DB: db, verifyGoogle });
  return { db, call };
}
const SNAPSHOT = { state: { goal: 1500, mode: 'limit', events: [{ id: 'e1', amount: 250, type: 'drink', at: '2026-10-29T08:00:00.000Z' }] }, local: { 'dusal-profile-v1': '{"condition":"kidney"}' } };

test('sign up, save the snapshot, and get it back when signing in on another phone', async () => {
  const s = setup();
  const up = await s.call('POST', '/api/auth/signup', { email: ' Saraa@Mail.com ', name: 'Сараа', password: 'secret-123' });
  expect(up.status).toBe(200);
  const first = await up.json() as { token: string; account: { email: string; password: boolean }; data: unknown };
  expect(first.account.email).toBe('saraa@mail.com');
  expect(first.account.password).toBe(true);
  expect(first.data).toBeNull();
  expect((await s.call('PUT', '/api/account', { data: SNAPSHOT }, first.token)).status).toBe(200);

  const again = await s.call('POST', '/api/auth/login', { email: 'saraa@mail.com', password: 'secret-123' });
  expect(again.status).toBe(200);
  const second = await again.json() as { token: string; data: unknown };
  expect(second.token).not.toBe(first.token);
  expect(second.data).toEqual(SNAPSHOT);
});

test('the password is stored only as a salted hash, the token only as its SHA-256', async () => {
  const s = setup();
  const { token } = await (await s.call('POST', '/api/auth/signup', { email: 'a@b.mn', name: 'А', password: 'secret-123' })).json() as { token: string };
  const row = s.db.sqlite.query('SELECT password_hash, password_salt FROM accounts').get() as { password_hash: string; password_salt: string };
  expect(row.password_hash).not.toContain('secret');
  expect(row.password_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(row.password_salt).toMatch(/^[0-9a-f]{32}$/);
  const session = s.db.sqlite.query('SELECT token_hash FROM sessions').get() as { token_hash: string };
  expect(session.token_hash).not.toBe(token);
});

test('a wrong password and an unknown email give the same answer', async () => {
  const s = setup();
  await s.call('POST', '/api/auth/signup', { email: 'a@b.mn', name: 'А', password: 'secret-123' });
  const wrong = await s.call('POST', '/api/auth/login', { email: 'a@b.mn', password: 'nope-nope' });
  const unknown = await s.call('POST', '/api/auth/login', { email: 'x@b.mn', password: 'nope-nope' });
  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(await wrong.json()).toEqual(await unknown.json());
});

test('signing up twice with one email is refused', async () => {
  const s = setup();
  await s.call('POST', '/api/auth/signup', { email: 'a@b.mn', name: 'А', password: 'secret-123' });
  expect((await s.call('POST', '/api/auth/signup', { email: 'A@B.mn', name: 'Б', password: 'other-123' })).status).toBe(409);
});

test('short passwords and bad emails are refused', async () => {
  const s = setup();
  expect((await s.call('POST', '/api/auth/signup', { email: 'a@b.mn', name: 'А', password: 'short' })).status).toBe(400);
  expect((await s.call('POST', '/api/auth/signup', { email: 'not-an-email', name: 'А', password: 'secret-123' })).status).toBe(400);
});

test('Google: the first sign-in opens an account, the next one finds it and its data', async () => {
  const s = setup();
  const first = await (await s.call('POST', '/api/auth/google', { idToken: 'ok|sub-1|saraa@gmail.com' })).json() as { token: string; account: { name: string; google: boolean } };
  expect(first.account).toMatchObject({ name: 'Сараа', google: true });
  await s.call('PUT', '/api/account', { data: SNAPSHOT }, first.token);
  const next = await (await s.call('POST', '/api/auth/google', { idToken: 'ok|sub-1|saraa@gmail.com' })).json() as { data: unknown };
  expect(next.data).toEqual(SNAPSHOT);
});

test('Google joins an account first opened with a password for the same email', async () => {
  const s = setup();
  const up = await (await s.call('POST', '/api/auth/signup', { email: 'saraa@gmail.com', name: 'Сараа', password: 'secret-123' })).json() as { token: string };
  await s.call('PUT', '/api/account', { data: SNAPSHOT }, up.token);
  const google = await (await s.call('POST', '/api/auth/google', { idToken: 'ok|sub-9|saraa@gmail.com' })).json() as { account: { google: boolean; password: boolean }; data: unknown };
  expect(google.account).toMatchObject({ google: true, password: true });
  expect(google.data).toEqual(SNAPSHOT);
  expect((s.db.sqlite.query('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n).toBe(1);
});

test('a Google token for another app is refused', async () => {
  const s = setup();
  expect((await s.call('POST', '/api/auth/google', { idToken: 'ok|sub-1|a@gmail.com|someone-else' })).status).toBe(401);
});

test('a Google account without a password gets told to use Google', async () => {
  const s = setup();
  await s.call('POST', '/api/auth/google', { idToken: 'ok|sub-1|a@gmail.com' });
  const r = await s.call('POST', '/api/auth/login', { email: 'a@gmail.com', password: 'secret-123' });
  expect(r.status).toBe(401);
  expect(((await r.json()) as { error: string }).error).toContain('Google');
});

test('data needs a live session; signing out ends it', async () => {
  const s = setup();
  expect((await s.call('GET', '/api/account')).status).toBe(401);
  const { token } = await (await s.call('POST', '/api/auth/signup', { email: 'a@b.mn', name: 'А', password: 'secret-123' })).json() as { token: string };
  expect((await s.call('GET', '/api/account', undefined, token)).status).toBe(200);
  expect((await s.call('POST', '/api/auth/logout', undefined, token)).status).toBe(204);
  expect((await s.call('GET', '/api/account', undefined, token)).status).toBe(401);
});

test('changing the password needs the current one and signs every other phone out', async () => {
  const s = setup();
  const { token } = await (await s.call('POST', '/api/auth/signup', { email: 'a@b.mn', name: 'А', password: 'secret-123' })).json() as { token: string };
  const other = await (await s.call('POST', '/api/auth/login', { email: 'a@b.mn', password: 'secret-123' })).json() as { token: string };
  expect((await s.call('POST', '/api/account/password', { current: 'wrong-pass', password: 'better-456' }, token)).status).toBe(403);
  expect((await s.call('POST', '/api/account/password', { current: 'secret-123', password: 'short' }, token)).status).toBe(400);
  expect((await s.call('POST', '/api/account/password', { current: 'secret-123', password: 'better-456' }, token)).status).toBe(200);
  expect((await s.call('GET', '/api/account', undefined, token)).status).toBe(200);
  expect((await s.call('GET', '/api/account', undefined, other.token)).status).toBe(401);
  expect((await s.call('POST', '/api/auth/login', { email: 'a@b.mn', password: 'secret-123' })).status).toBe(401);
  expect((await s.call('POST', '/api/auth/login', { email: 'a@b.mn', password: 'better-456' })).status).toBe(200);
});

test('a Google-only account can set its first password', async () => {
  const s = setup();
  const { token } = await (await s.call('POST', '/api/auth/google', { idToken: 'ok|sub-1|a@gmail.com' })).json() as { token: string };
  const r = await (await s.call('POST', '/api/account/password', { password: 'secret-123' }, token)).json() as { account: { password: boolean; google: boolean } };
  expect(r.account).toMatchObject({ password: true, google: true });
  expect((await s.call('POST', '/api/auth/login', { email: 'a@gmail.com', password: 'secret-123' })).status).toBe(200);
});

test('deleting the account removes it, its data and its sessions', async () => {
  const s = setup();
  const { token } = await (await s.call('POST', '/api/auth/signup', { email: 'a@b.mn', name: 'А', password: 'secret-123' })).json() as { token: string };
  await s.call('PUT', '/api/account', { data: SNAPSHOT }, token);
  expect((await s.call('DELETE', '/api/account', undefined, token)).status).toBe(204);
  expect((await s.call('GET', '/api/account', undefined, token)).status).toBe(401);
  for (const table of ['accounts', 'sessions', 'account_data']) {
    expect((s.db.sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n).toBe(0);
  }
  // The email is free again.
  expect((await s.call('POST', '/api/auth/signup', { email: 'a@b.mn', name: 'А', password: 'secret-123' })).status).toBe(200);
});
