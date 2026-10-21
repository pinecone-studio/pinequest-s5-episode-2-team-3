import './schedule.css';
import { dayKey, type AppState } from './data';
import { number } from './format';

// Today's drinking schedule: the daily amount split evenly over waking hours (e.g. 07:00–22:00
// every 2 hours → 8 × 250 ml). A slot is done once today's total reaches everything due up to
// it. Reminders are smart: when a slot's time comes and the person is behind, one notification
// says how much to drink; if they are on track, nothing is sent.
const KEY = 'dusal-reminders-v1';
const SENT_KEY = 'dusal-reminders-sent-v1';
interface Settings { wake: string; sleep: string; every: number; on: boolean }
const DEFAULTS: Settings = { wake: '07:00', sleep: '22:00', every: 2, on: false };
const EVERY = [1, 1.5, 2, 3] as const;
const FACTS = [
  'Ус уух нь толгой өвдөхийг багасгадаг.',
  'Бага зэрэг шингэн дутагдал ч анхаарлыг сулруулдаг.',
  'Ус бөөрөнд чулуу үүсэхээс сэргийлдэг.',
  'Цангахаас өмнө уух нь хамгийн зөв.',
  'Ус биеийн температурыг тогтвортой барина.',
];

export function readSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Settings> | null;
    const time = (v: unknown, d: string) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : d;
    return {
      wake: time(s?.wake, DEFAULTS.wake),
      sleep: time(s?.sleep, DEFAULTS.sleep),
      every: EVERY.includes(s?.every as never) ? s!.every! : DEFAULTS.every,
      on: s?.on === true,
    };
  } catch { return { ...DEFAULTS }; }
}
function writeSettings(s: Settings): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* keeps defaults */ } }

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const clock = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

const drunkToday = (state: AppState) => { const today = dayKey(); return state.events.reduce((sum, e) => e.type === 'drink' && dayKey(new Date(e.at)) === today ? sum + e.amount : sum, 0); };
// What is due right now: everything scheduled up to the latest slot that has come, minus what was drunk.
const dueNow = (state: AppState, list: Slot[]) => {
  const behind = list.filter(x => x.state === 'now' || x.state === 'late');
  const last = behind[behind.length - 1];
  return last ? Math.max(last.ml, last.due - drunkToday(state)) : 0;
};

export interface Slot { at: number; time: string; ml: number; due: number; state: 'done' | 'now' | 'late' | 'later' }

export function slots(state: AppState, now = new Date()): Slot[] {
  const s = readSettings();
  const start = minutes(s.wake), end = minutes(s.sleep) > start ? minutes(s.sleep) : minutes(s.sleep) + 24 * 60;
  const step = Math.round(s.every * 60);
  const times: number[] = [];
  for (let t = start; t < end; t += step) times.push(t);
  if (!times.length) times.push(start);
  const per = Math.max(10, Math.round(state.goal / times.length / 10) * 10);
  const drunk = drunkToday(state);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return times.map((at, i) => {
    const due = Math.min(state.goal, per * (i + 1));
    let st: Slot['state'];
    if (drunk >= due) st = 'done';
    else if (at > nowMin) st = 'later';
    else if (at + step <= nowMin) st = 'late';
    else st = 'now';
    return { at, time: clock(at), ml: per, due, state: st };
  });
}

// One quiet line on the home: the next thing to drink, or that the plan is done.
export function scheduleChip(state: AppState): string {
  const list = slots(state);
  const open = list.find(x => x.state !== 'done');
  const need = dueNow(state, list);
  const text = !open ? '✓ Өнөөдрийн хуваарь биеллээ'
    : need ? `Одоо <b>${number(need)} мл</b> уух цаг`
    : `Дараагийн: <b>${open.time} · ${number(open.ml)} мл</b>`;
  const cls = !open ? 'done' : need ? 'due' : '';
  return `<button type="button" class="sched-chip ${cls}" id="sched-open" aria-label="Өнөөдрийн хуваарь, сануулга">
    <span aria-hidden="true">${readSettings().on ? '⏰' : '🕑'}</span><span>${text}</span><i aria-hidden="true">›</i></button>`;
}

function sheet(state: AppState): string {
  const s = readSettings();
  const list = slots(state);
  const icon = { done: '✓', now: '⏰', late: '⚠️', later: '' } as const;
  const word = { done: 'Уусан', now: 'Одоо', late: 'Хоцорсон', later: '' } as const;
  const support = 'Notification' in window;
  return `<div class="cal-card sched-card">
    <div class="cal-top"><h2 id="sched-title">Өнөөдрийн хуваарь</h2><button type="button" class="cal-close" aria-label="Хаах">✕</button></div>
    <p class="sched-sum">${state.mode === 'limit' ? 'Хязгаар' : 'Зорилт'} ${number(state.goal)} мл · ${list.length} удаа · тус бүр <b>${number(list[0]?.ml ?? 0)} мл</b></p>
    <ol class="sched-list">${list.map(x => `<li class="${x.state}"><span class="t">${x.time}</span><span class="ml">${number(x.ml)} мл</span><span class="st">${icon[x.state]} ${word[x.state]}</span></li>`).join('')}</ol>
    <form class="sched-form" id="sched-form">
      <label>Сэрэх<input type="time" id="sched-wake" value="${s.wake}"/></label>
      <label>Унтах<input type="time" id="sched-sleep" value="${s.sleep}"/></label>
      <label>Хэдэн цаг тутам<select id="sched-every">${EVERY.map(v => `<option value="${v}" ${v === s.every ? 'selected' : ''}>${String(v).replace('.', ',')} цаг</option>`).join('')}</select></label>
    </form>
    <label class="sched-toggle"><input type="checkbox" id="sched-on" ${s.on ? 'checked' : ''} ${support ? '' : 'disabled'}/>
      <span><b>Сануулга</b><small>${support ? 'Хуваариасаа хоцорсон үед л мэдэгдэл ирнэ' : 'Энэ хөтөч мэдэгдэл дэмждэггүй'}</small></span></label>
    <p class="sched-note" id="sched-note" role="status"></p>
  </div>`;
}

export function bindSchedule(state: () => AppState, redraw: () => void): void {
  document.querySelector('#sched-open')?.addEventListener('click', () => {
    const box = document.createElement('div');
    box.className = 'cal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'sched-title');
    document.body.append(box);
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); redraw(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    box.addEventListener('click', e => { if (e.target === box) close(); });
    const draw = (note = '') => {
      box.innerHTML = sheet(state());
      box.querySelector('#sched-note')!.textContent = note;
      box.querySelector('.cal-close')!.addEventListener('click', close);
      const save = () => {
        const s = readSettings();
        writeSettings({ ...s, wake: (box.querySelector('#sched-wake') as HTMLInputElement).value || s.wake, sleep: (box.querySelector('#sched-sleep') as HTMLInputElement).value || s.sleep, every: Number((box.querySelector('#sched-every') as HTMLSelectElement).value) });
        draw();
      };
      box.querySelectorAll('#sched-form input, #sched-form select').forEach(el => el.addEventListener('change', save));
      box.querySelector<HTMLInputElement>('#sched-on')!.addEventListener('change', async e => {
        const want = (e.target as HTMLInputElement).checked;
        if (want && Notification.permission !== 'granted') {
          const answer = await Notification.requestPermission();
          if (answer !== 'granted') { writeSettings({ ...readSettings(), on: false }); draw('Мэдэгдэл зөвшөөрөгдсөнгүй. Хөтчийн тохиргооноос зөвшөөрнө үү.'); return; }
        }
        writeSettings({ ...readSettings(), on: want });
        draw(want ? 'Сануулга асаалаа. Апп эсвэл таб нээлттэй үед ирнэ.' : 'Сануулга унтарлаа.');
      });
    };
    draw();
    box.querySelector<HTMLElement>('.cal-close')?.focus();
  });
}

// Checks once a minute; for the latest due slot the person is behind on, sends one notification.
let ticking = false;
export function startReminders(state: () => AppState): void {
  if (ticking) return;
  ticking = true;
  const tick = async () => {
    const s = readSettings();
    if (!s.on || !('Notification' in window) || Notification.permission !== 'granted') return;
    const list = slots(state());
    const due = list.filter(x => x.state === 'now' || x.state === 'late');
    const last = due[due.length - 1];
    if (!last) return;
    const key = `${dayKey()} ${last.time}`;
    let sent: string[] = [];
    try { sent = JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]'); } catch { /* empty */ }
    if (sent.includes(key)) return;
    try { localStorage.setItem(SENT_KEY, JSON.stringify([...sent.filter(k => k.startsWith(dayKey())), key])); } catch { /* may repeat */ }
    const st = state();
    const drunk = drunkToday(st), need = dueNow(st, list);
    const title = '💧 Ус уух цаг боллоо';
    const body = `${number(need)} мл уугаарай (өнөөдөр ${number(drunk)} / ${number(st.goal)} мл). ${FACTS[new Date().getHours() % FACTS.length]}`;
    const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
    if (reg) await reg.showNotification(title, { body, icon: '/icon-192.png', tag: 'dusal-reminder' });
    else new Notification(title, { body, icon: '/icon-192.png', tag: 'dusal-reminder' });
  };
  void tick();
  setInterval(() => void tick(), 60_000);
}
