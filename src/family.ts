import { API_URL } from './api';
import { dayKey, type AppState } from './data';
import type { Leaderboard, MemberReport } from '../shared/family';

// This phone as a family member: a random member ID it keeps to itself, the name others see, and
// the family (= the base's device ID) it joined. Kept in localStorage; the server keeps the board.
const KEY = 'dusal-family-v1';
export interface Membership { memberId: string; name: string; baseId: string | null }

export function readMembership(): Membership {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Membership> | null;
    if (raw && typeof raw.memberId === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(raw.memberId)) {
      return { memberId: raw.memberId, name: typeof raw.name === 'string' ? raw.name : '', baseId: typeof raw.baseId === 'string' ? raw.baseId : null };
    }
  } catch { /* a fresh identity below */ }
  const fresh = { memberId: crypto.randomUUID(), name: '', baseId: null };
  writeMembership(fresh);
  return fresh;
}
export function writeMembership(m: Membership): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private mode: asks again next visit */ }
}

// Today's own numbers as the server expects them; only drinks count, like the home.
export function todayReport(state: AppState, name: string, avatar: string, now = new Date()): MemberReport {
  const day = dayKey(now);
  const drinkMl = state.events.reduce((sum, e) => (e.type === 'drink' && dayKey(new Date(e.at)) === day ? sum + e.amount : sum), 0);
  return { name, avatar, day, drinkMl: Math.min(drinkMl, 20_000), goalMl: state.goal, mode: state.mode };
}

export class FamilyError extends Error {}

export class FamilyClient {
  constructor(private request: typeof fetch = (...args) => fetch(...args), private base = API_URL) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try { response = await this.request(`${this.base}${path}`, init); } catch { throw new FamilyError('Интернэт холболтоо шалгаад дахин оролдоно уу.'); }
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new FamilyError(data.error ?? 'Гэр бүлийн мэдээллийг авч чадсангүй.');
    return data as T;
  }
  // Joining and reporting are one call: the server keeps the latest total for the day.
  report(baseId: string, memberId: string, body: MemberReport): Promise<Leaderboard> {
    return this.call(`/api/bases/${encodeURIComponent(baseId)}/members/${encodeURIComponent(memberId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  }
  board(baseId: string, memberId: string, day: string): Promise<Leaderboard> {
    return this.call(`/api/bases/${encodeURIComponent(baseId)}/leaderboard?day=${day}&me=${encodeURIComponent(memberId)}`);
  }
  leave(baseId: string, memberId: string): Promise<void> {
    return this.call(`/api/bases/${encodeURIComponent(baseId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' });
  }
}

export const family = new FamilyClient();

// The home reports after every change: one request at a time, always ending with the latest numbers,
// and nothing sent when they did not move.
let lastSent = '';
let queued: { state: AppState; avatar: string } | null = null;
let flushing = false;
export function reportToday(state: AppState, avatar: string): void {
  queued = { state, avatar };
  if (!flushing) void flush();
}
async function flush(): Promise<void> {
  flushing = true;
  while (queued) {
    const { state, avatar } = queued;
    queued = null;
    const m = readMembership();
    if (!m.baseId || !m.name) continue;
    const body = todayReport(state, m.name, avatar);
    const key = `${m.baseId}|${JSON.stringify(body)}`;
    if (key === lastSent) continue;
    try { await family.report(m.baseId, m.memberId, body); lastSent = key; } catch { /* offline: the next change or visit sends it */ }
  }
  flushing = false;
}
