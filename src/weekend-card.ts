import { dayKey, type AppState } from './data';
import { escape, number } from './format';
import { mdIcon } from './components/Icon';
import { sheet } from './home-limit';
import { streakNow } from './hydration';
import { weekendFor, type WeekendNotice } from './weekend-notice';

// The card the weekend notice opens (weekend-notice.ts): the days off with their amount, for dialysis a
// line from the evening the gap starts to the next session, the streak with a goal, and one tip from
// the person's own history. Without a notification (the web, reminders off) it shows once on the first
// visit inside the window; the window's first day is kept so it is not shown again.
const SEEN_KEY = 'dusal-weekend-seen-v1';
const seenKey = (n: WeekendNotice) => `${n.kind} ${dayKey(n.from)}`;
function markSeen(n: WeekendNotice): void { try { localStorage.setItem(SEEN_KEY, seenKey(n)); } catch { /* may show again */ } }

export function openWeekendCard(n: WeekendNotice): void {
  markSeen(n);
  const c = n.card;
  const line = c.timeline ? `<ol class="wk-line" aria-label="Диализ хоорондын өдрүүд">${c.timeline.map((p, i) =>
    `<li class="${p.done ? 'done' : ''}${i === c.timeline!.length - 1 ? ' end' : ''}"><i aria-hidden="true"></i><span>${escape(p.label)}</span></li>`).join('')}</ol>` : '';
  const { close, box } = sheet('wk-sheet', `
      <div class="wk-head"><img class="wk-face" src="/notif/${n.face}.png" alt="" width="56" height="56"><div><h2>${escape(c.heading)}</h2><p>${escape(c.note)}</p></div></div>
      ${line}
      <ul class="wk-days">${c.days.map(d => `<li><span>${escape(d.label)}</span><b>${number(d.ml)} мл</b><small>${c.word}</small></li>`).join('')}</ul>
      ${c.streak > 0 ? `<p class="wk-streak">${mdIcon('local_fire_department')} <b>${number(c.streak)} өдрийн streak</b> — амралтын өдрүүдэд ч үргэлжлүүлээрэй</p>` : ''}
      <p class="wk-tip">${escape(c.tip)}</p>
      <button type="button" class="hx-blue hl-wide" data-ok data-focus>Ойлголоо</button>`, c.heading);
  box.querySelector('[data-ok]')!.addEventListener('click', close);
}

const noticeFor = (state: AppState, now: Date) => weekendFor(state, streakNow(state.events, state.goal, state.mode), now);

// From a tap on the notification: the card for this window, or the coming one.
export function showWeekendCard(state: AppState, now = new Date()): void {
  const n = noticeFor(state, now);
  if (n) openWeekendCard(n);
}

// On opening the app: once per window, while it runs.
export function weekendIfDue(state: AppState, now = new Date()): void {
  const n = noticeFor(state, now);
  if (!n || now < n.from || now >= n.until) return;
  let seen = '';
  try { seen = localStorage.getItem(SEEN_KEY) ?? ''; } catch { /* show it */ }
  if (seen !== seenKey(n)) openWeekendCard(n);
}
