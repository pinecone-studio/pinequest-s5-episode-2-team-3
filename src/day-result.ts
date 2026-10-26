import { dayKey, type AppState } from './data';
import { dayCounter } from './hydration';
import { readMember } from './member';

// "Баяр хүргэе!" / "Өө!" screen, "Drops" style: the buddy, a trophy and a few words. Shown when
// today's goal is reached, and once the next morning about yesterday. Under a doctor's limit it is
// about keeping the limit, never about drinking more.
const SEEN_KEY = 'dusal-day-result-v1';

const TROPHY = `<svg class="dr-trophy" viewBox="0 0 64 72" aria-hidden="true"><path d="M18 6h28v14a14 14 0 0 1-28 0z" fill="#e0a23c"/><path d="M18 10H8v4a10 10 0 0 0 10 10M46 10h10v4a10 10 0 0 1-10 10" fill="none" stroke="#e0a23c" stroke-width="4"/><path d="M28 34h8v14h-8z" fill="#c98a2a"/><path d="M18 48h28l3 10H15z" fill="#e0a23c"/><path d="M14 58h36v8H14z" fill="#8a5a1a"/><path d="M24 12v8" stroke="#fff3d6" stroke-width="3" stroke-linecap="round"/></svg>`;

const CONFETTI = Array.from({ length: 26 }, (_, i) => {
  const colors = ['#369fff', '#f97316', '#facc15', '#22c55e', '#ec4899', '#38bdf8'];
  return `<i style="left: ${(i * 37) % 100}%; top: ${(i * 53) % 34}%; background: ${colors[i % colors.length]}; transform: rotate(${(i * 47) % 180}deg)"></i>`;
}).join('');

// Hydrify's "Daily Goal Achieved!": confetti, a big trophy, two lines, "back home" and "share".
function show(good: boolean, title: string, text: string, _day: Date): void {
  if (document.querySelector('.day-result')) return;
  const box = document.createElement('div');
  box.className = `day-result ${good ? 'good' : 'bad'}`;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'dr-title');
  box.innerHTML = `<div class="dr-confetti" aria-hidden="true">${good ? CONFETTI : ''}</div>
    <div class="dr-card">
      ${TROPHY}
      <h2 id="dr-title">${title}</h2>
      <p>${text}</p>
      <hr/>
      <p class="dr-share-line">${good ? 'Амжилтаа найзуудтайгаа хуваалцаарай' : 'Маргааш дахин хичээгээрэй'}</p>
    </div>
    <div class="dr-actions"><button type="button" class="dr-home">Нүүр рүү</button>${good ? '<button type="button" class="dr-share">Хуваалцах</button>' : ''}</div>`;
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  box.querySelector<HTMLButtonElement>('.dr-home')!.addEventListener('click', close);
  box.querySelector<HTMLButtonElement>('.dr-share')?.addEventListener('click', () => {
    const name = readMember()?.name;
    const msg = `${name ? `${name} ` : ''}өнөөдрийн усны зорилтоо Дусал апп-аар биелүүллээ! 💧`;
    if (navigator.share) void navigator.share({ text: msg }).catch(() => {});
    else void navigator.clipboard?.writeText(msg).catch(() => {});
  });
  box.querySelector<HTMLButtonElement>('.dr-home')!.focus();
}

// Called after a drink is added: celebrates the moment today's goal is reached (once a day).
export function celebrateIfReached(state: AppState, before: number, after: number): void {
  if (state.mode !== 'goal' || before >= state.goal || after < state.goal) return;
  const today = dayKey();
  try { if (localStorage.getItem(`${SEEN_KEY}-today`) === today) return; localStorage.setItem(`${SEEN_KEY}-today`, today); } catch { /* shown again next time */ }
  show(true, 'Өдрийн зорилт биеллээ!', 'Өдөр бүрийн усны зорилтоо биелүүлэх бүрт энэ шагналыг авна!', new Date());
}

// Called when the home opens: yesterday's result, once. Skipped until there is history before today.
export function showYesterday(state: AppState, now = new Date()): void {
  const today = dayKey(now);
  if (!state.events.some(e => dayKey(new Date(e.at)) < today)) return;
  try { if (localStorage.getItem(SEEN_KEY) === today) return; localStorage.setItem(SEEN_KEY, today); } catch { return; }
  const y = new Date(now); y.setHours(12, 0, 0, 0); y.setDate(y.getDate() - 1);
  const met = dayCounter(state.events, state.goal, state.mode)(dayKey(y));
  if (state.mode === 'limit') {
    if (met) show(true, 'Баяр хүргэе!', 'Өчигдөр эмчийн хязгаартаа зөв ууллаа. Өнөөдөр ч ингэж хуваарилаарай.', y);
    else show(false, 'Өө!', 'Өчигдөр хязгаарт тохирсонгүй. Өнөөдөр усаа өдрийн турш жигд хуваарилаарай.', y);
  } else if (met) show(true, 'Баяр хүргэе!', 'Өчигдөр зорилтоо биелүүлсэн. Streak-ээ үргэлжлүүлээрэй!', y);
  else show(false, 'Өө!', 'Өчигдөр зорилтод хүрсэнгүй. Бүтэлгүйтэл бол төгсгөл биш. Өнөөдөр дахин эхэлье!', y);
}
