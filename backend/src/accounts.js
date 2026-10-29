import { ContractError } from '../../shared/contracts.ts';
import { readJson, BodyError } from './body.js';

// Accounts: sign up with email and password, sign in again with them, or use a Google account. A
// signed-in phone keeps a random token (only its hash is stored) and saves its whole state as one
// snapshot, which a sign-in on another or reset phone gets back, so onboarding is not asked twice.
export class AuthError extends ContractError {
  constructor(message, status = 401) { super(message); this.status = status; }
}

const ITERATIONS = 100_000; // the most PBKDF2 rounds Workers allow
const SESSION_DAYS = 180;
const DATA_LIMIT = 2_000_000;
// The public web client ID the app signs in with (src/google-signin.ts); a Google ID token must be for it.
const GOOGLE_CLIENT_ID = '253911522297-p7ulev5jt6lo8qv674m50j6h5776gr3h.apps.googleusercontent.com';

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const random = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: ITERATIONS }, key, 256);
  return hex(bits);
}
// Compares without stopping at the first difference.
function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cleanEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ContractError('Имэйл хаяг буруу байна.');
  return email;
}
function cleanName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > 24) throw new ContractError('Нэр 1–24 тэмдэгт байна.');
  return name;
}
function cleanPassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw new ContractError('Нууц үг 8–128 тэмдэгт байна.');
  return value;
}

const view = row => ({ id: row.id, email: row.email, name: row.name, google: Boolean(row.google_sub), password: Boolean(row.password_hash) });

async function readData(db, accountId) {
  const row = await db.prepare('SELECT data, updated_at FROM account_data WHERE account_id = ?1').bind(accountId).first();
  return row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : { data: null, updatedAt: null };
}

async function openSession(db, row) {
  const token = random(32);
  const now = new Date();
  await db.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256(token), row.id, now.toISOString(), new Date(now.getTime() + SESSION_DAYS * 864e5).toISOString()).run();
  return { token, account: view(row), ...(await readData(db, row.id)) };
}

export async function signUp(request, db) {
  const body = await readJson(request, 4096);
  const email = cleanEmail(body?.email), name = cleanName(body?.name), password = cleanPassword(body?.password);
  if (await db.prepare('SELECT 1 FROM accounts WHERE email = ?1').bind(email).first()) throw new AuthError('Энэ имэйлээр бүртгэл аль хэдийн байна. Нэвтэрнэ үү.', 409);
  const salt = random(16);
  const row = { id: crypto.randomUUID(), email, name, password_hash: await hashPassword(password, salt), password_salt: salt, google_sub: null };
  await db.prepare('INSERT INTO accounts (id, email, name, password_hash, password_salt, google_sub, created_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)')
    .bind(row.id, email, name, row.password_hash, salt, new Date().toISOString()).run();
  return openSession(db, row);
}

export async function signIn(request, db) {
  const body = await readJson(request, 4096);
  const email = cleanEmail(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
  const row = await db.prepare('SELECT * FROM accounts WHERE email = ?1').bind(email).first();
  // The same answer for an unknown email and a wrong password, so neither can be probed.
  const wrong = new AuthError('Имэйл эсвэл нууц үг буруу байна.');
  if (!row) throw wrong;
  if (!row.password_hash) throw new AuthError('Энэ бүртгэл Google-ээр нээгдсэн. «Google-ээр нэвтрэх»-ийг дарна уу.');
  if (!same(await hashPassword(password, row.password_salt), row.password_hash)) throw wrong;
  return openSession(db, row);
}

// Google's tokeninfo checks the signature and expiry; here the token must be for our client and verified.
async function googleTokenInfo(idToken) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw new AuthError('Google-ийн нэвтрэлт хүчингүй байна. Дахин оролдоно уу.');
  return response.json();
}

export async function googleSignIn(request, db, env = {}) {
  const body = await readJson(request, 8192);
  if (typeof body?.idToken !== 'string' || body.idToken.length > 4096) throw new ContractError('Google-ийн token алга.');
  const info = await (env.verifyGoogle ?? googleTokenInfo)(body.idToken);
  if (info.aud !== (env.GOOGLE_CLIENT_ID ?? GOOGLE_CLIENT_ID) || String(info.email_verified) !== 'true' || !info.sub) {
    throw new AuthError('Google-ийн нэвтрэлт хүчингүй байна. Дахин оролдоно уу.');
  }
  const email = cleanEmail(info.email);
  let row = await db.prepare('SELECT * FROM accounts WHERE google_sub = ?1').bind(info.sub).first()
    ?? await db.prepare('SELECT * FROM accounts WHERE email = ?1').bind(email).first();
  if (row && !row.google_sub) {
    // Signed up with a password earlier: Google has verified the same email, so the two join.
    await db.prepare('UPDATE accounts SET google_sub = ?1 WHERE id = ?2').bind(info.sub, row.id).run();
    row = { ...row, google_sub: info.sub };
  }
  if (!row) {
    row = { id: crypto.randomUUID(), email, name: cleanName(info.given_name || info.name || email.split('@')[0]), password_hash: null, google_sub: info.sub };
    await db.prepare('INSERT INTO accounts (id, email, name, password_hash, password_salt, google_sub, created_at) VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?5)')
      .bind(row.id, email, row.name, info.sub, new Date().toISOString()).run();
  }
  return openSession(db, row);
}

// The account behind `Authorization: Bearer <token>`, or a 401.
async function sessionAccount(request, db) {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!/^[0-9a-f]{64}$/.test(token)) throw new AuthError('Нэвтрээгүй байна.');
  const row = await db.prepare(`SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = ?1 AND s.expires_at > ?2`).bind(await sha256(token), new Date().toISOString()).first();
  if (!row) throw new AuthError('Нэвтрэлтийн хугацаа дууссан. Дахин нэвтэрнэ үү.');
  return { row, token };
}

export async function signOut(request, db) {
  const { token } = await sessionAccount(request, db);
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(token)).run();
}

export async function getAccount(request, db) {
  const { row } = await sessionAccount(request, db);
  return { account: view(row), ...(await readData(db, row.id)) };
}

// The phone's snapshot replaces the stored one; `updatedAt` comes back so the phone can tell it was kept.
export async function putData(request, db) {
  const { row } = await sessionAccount(request, db);
  const body = await readJson(request, DATA_LIMIT);
  if (!body || typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) throw new ContractError('Өгөгдлийн бүтэц буруу байна.');
  const text = JSON.stringify(body.data);
  if (text.length > DATA_LIMIT) throw new BodyError('Хүсэлтийн өгөгдөл зөвшөөрсөн хэмжээнээс их байна.', 413);
  const updatedAt = new Date().toISOString();
  await db.prepare(`INSERT INTO account_data (account_id, data, updated_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(account_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`).bind(row.id, text, updatedAt).run();
  return { updatedAt };
}
