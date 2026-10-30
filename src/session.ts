import { API_URL } from './api';
import { validateState, type AppState } from './data';
import { load, save } from './storage';

// The signed-in account (backend/src/accounts.js). A phone signs up or in with email and password or a
// Google account and then keeps its whole state on the server as one snapshot: the water log and every
// `dusal-` setting except the ones that only make sense on this phone. Signing in on a new or reset
// phone puts that snapshot back, so onboarding is not asked again. Without an account (Demo) nothing
// leaves the phone.
export interface Account { id: string; email: string; name: string; google: boolean; password: boolean }
interface Session { token: string; account: Account }
export interface Snapshot { version: 1; savedAt: string; state: AppState; local: Record<string, string> }

const SESSION_KEY = 'dusal-session-v1';
// This phone's own: caches, the device it is paired with, what it already showed or sent, demo mode.
const LOCAL_ONLY = new Set(['dusal-session-v1', 'dusal-snapshot-v1', 'dusal-scale-v1', 'dusal-weather-v1', 'dusal-insight-v1',
  'dusal-health-v1', 'dusal-family-board-v1', 'dusal-reminders-sent-v1', 'dusal-weekend-seen-v1', 'dusal-tab-v2',
  'dusal-demo-v1', 'dusal-exact-alarm-asked-v1', 'dusal-data-v2', 'dusal-app-v2', 'dusal-family-alerts-v1']);
const synced = (key: string) => key.startsWith('dusal-') && !LOCAL_ONLY.has(key);

export function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return s && /^[0-9a-f]{64}$/.test(s.token) && s.account?.email ? s : null;
  } catch { return null; }
}
export const signedIn = (): Account | null => readSession()?.account ?? null;

async function request<T>(path: string, init: RequestInit = {}, token = readSession()?.token): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new Error('Сервертэй холбогдож чадсангүй. Интернэтээ шалгана уу.'); }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw Object.assign(new Error(body.error || 'Алдаа гарлаа. Дахин оролдоно уу.'), { status: response.status });
  return body as T;
}

interface Signed { token: string; account: Account; data: Snapshot | null }
async function signIn(path: string, body: unknown): Promise<{ account: Account; data: Snapshot | null }> {
  const r = await request<Signed>(path, { method: 'POST', body: JSON.stringify(body) }, undefined);
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token: r.token, account: r.account })); } catch { /* signed in for this run only */ }
  return { account: r.account, data: r.data };
}
export const signUpEmail = (name: string, email: string, password: string) => signIn('/api/auth/signup', { name, email, password });
export const signInEmail = (email: string, password: string) => signIn('/api/auth/login', { email, password });
export const signInGoogle = (idToken: string) => signIn('/api/auth/google', { idToken });

export async function signOutAccount(): Promise<void> {
  const session = readSession();
  try { localStorage.removeItem(SESSION_KEY); } catch { /* gone with the page */ }
  if (session) await request('/api/auth/logout', { method: 'POST' }, session.token).catch(() => {});
}

// A new password (the current one too when the account has one); the server signs out every other phone.
export async function changePassword(current: string, password: string): Promise<Account> {
  const { account } = await request<{ account: Account }>('/api/account/password', { method: 'POST', body: JSON.stringify({ current, password }) });
  const session = readSession();
  if (session) try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, account })); } catch { /* shown again on the next sign-in */ }
  return account;
}

// Deletes the account and everything saved with it on the server; this phone is cleared by the caller.
export async function deleteAccount(): Promise<void> {
  await request('/api/account', { method: 'DELETE' });
  try { localStorage.removeItem(SESSION_KEY); } catch { /* the token no longer works anyway */ }
}

export async function collectSnapshot(): Promise<Snapshot> {
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && synced(key)) local[key] = localStorage.getItem(key) ?? '';
  }
  return { version: 1, savedAt: new Date().toISOString(), state: (await load()).state, local };
}

// Puts a snapshot back on this phone: its settings first, then the water log over whatever is here.
export async function restoreSnapshot(snapshot: Snapshot): Promise<boolean> {
  let state: AppState;
  try { state = validateState(snapshot.state); } catch { return false; }
  for (const [key, value] of Object.entries(snapshot.local ?? {})) {
    if (synced(key) && typeof value === 'string') try { localStorage.setItem(key, value); } catch { /* the rest still restores */ }
  }
  try { localStorage.setItem('dusal-onboarded-v1', '1'); } catch { /* asked again, then */ }
  return (await save(state, true)) === 'saved';
}

// While signed in, the snapshot goes up a few seconds after a change (a drink, a setting) and as the app
// leaves the screen; the same snapshot twice is not sent again.
let sent = '';
let timer: ReturnType<typeof setTimeout> | undefined;
// True once the account holds what this phone has.
export async function pushSnapshot(): Promise<boolean> {
  if (!readSession() || !navigator.onLine) return false;
  const snapshot = await collectSnapshot();
  const key = JSON.stringify({ state: snapshot.state, local: snapshot.local });
  if (key === sent) return true;
  try {
    await request('/api/account', { method: 'PUT', body: JSON.stringify({ data: snapshot }) });
    sent = key;
    return true;
  } catch (e) {
    // A session the server no longer knows: sign out here too, so the phone stops trying.
    if ((e as { status?: number }).status === 401) try { localStorage.removeItem(SESSION_KEY); } catch { /* tried again later */ }
    return false;
  }
}
const soon = () => { clearTimeout(timer); timer = setTimeout(() => void pushSnapshot(), 3000); };
let started = false;
export function startAccountSync(): void {
  if (started) return;
  started = true;
  window.addEventListener('dusal-local-save', soon);
  window.addEventListener('online', soon);
  document.addEventListener('visibilitychange', () => { if (document.hidden) void pushSnapshot(); });
  // Settings saved straight to localStorage (profile, reminders, cups) raise no event: a light check.
  setInterval(() => void pushSnapshot(), 60_000);
  soon();
}
