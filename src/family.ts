import type { Leaderboard } from '../shared/family';
import { API_URL } from './api';
import { readAvatar } from './avatars';
import { dayKey, type AppState } from './data';
import { readMember } from './member';
import { scale } from './scale';

// Family leaderboard (server side: backend/src/family.js). A family is everyone using one base, so
// the base this phone last connected to is its family. Each report sends today's own total and gets
// the whole board back; the board is kept so the home shows it straight away next time.
const FAMILY_KEY = 'dusal-family-v1';
const BOARD_KEY = 'dusal-family-board-v1';

export function readFamily(): string | null {
  try { return localStorage.getItem(FAMILY_KEY); } catch { return null; }
}
function writeFamily(baseId: string | null): void {
  try { if (baseId) localStorage.setItem(FAMILY_KEY, baseId); else localStorage.removeItem(FAMILY_KEY); } catch { /* joined again on the next connect */ }
}

let board: Leaderboard | null = (() => {
  try { return JSON.parse(localStorage.getItem(BOARD_KEY) ?? 'null') as Leaderboard | null; } catch { return null; }
})();
export const familyBoard = (): Leaderboard | null => (board && board.baseId === readFamily() && board.day === dayKey() ? board : null);

const changed = () => window.dispatchEvent(new Event('dusal-family'));

// Last report sent, so re-rendering the home does not call the server for nothing; a minute later
// the same numbers go again to pick up the rest of the family.
let sent = '';
let sentAt = 0;
export async function reportFamily(state: AppState, drunk: number): Promise<void> {
  const baseId = readFamily();
  const member = readMember();
  if (!baseId || !member || !navigator.onLine) return;
  const report = { name: member.name, avatar: readAvatar(), day: dayKey(), drinkMl: drunk, goalMl: state.goal, mode: state.mode };
  const key = JSON.stringify([baseId, member.id, report]);
  if (key === sent && Date.now() - sentAt < 60_000) return;
  sent = key;
  sentAt = Date.now();
  try {
    const response = await fetch(`${API_URL}/api/bases/${encodeURIComponent(baseId)}/members/${encodeURIComponent(member.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(String(response.status));
    board = await response.json() as Leaderboard;
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(board)); } catch { /* fetched again next time */ }
    changed();
  } catch {
    sent = '';
  }
}

// Leaves the family on the server too, so this phone's row disappears from everyone's board.
export async function leaveFamily(): Promise<void> {
  const baseId = readFamily();
  const member = readMember();
  if (baseId && member) {
    await fetch(`${API_URL}/api/bases/${encodeURIComponent(baseId)}/members/${encodeURIComponent(member.id)}`, { method: 'DELETE' }).catch(() => {});
  }
  writeFamily(null);
  board = null;
  try { localStorage.removeItem(BOARD_KEY); } catch { /* nothing kept */ }
  changed();
}

// Connecting to a base joins its family (or moves there from another one).
let watching = false;
export function startFamily(): void {
  if (watching) return;
  watching = true;
  window.addEventListener('dusal-scale', () => {
    if (scale.phase === 'connected' && scale.baseId && scale.baseId !== readFamily()) {
      writeFamily(scale.baseId);
      sent = '';
      changed();
    }
  });
}
