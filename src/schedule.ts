import './schedule.css';
import { dayKey, type AppState } from './data';
import { number } from './format';
import { mdIcon } from './components/Icon';
import { nativeReminders, allowed, askPermission, clearDelivered, scheduleNative, scheduleWeekend, type Face, type NativeReminder } from './native-reminders';
import { weekendFor } from './weekend-notice';
import { readProfile } from './plan';
import { readDialysis } from './progress-data';
import { streakNow } from './hydration';
import { readPetName } from './pet';

// Today's drinking schedule: the daily amount split evenly over waking hours (e.g. 07:00–22:00
// every 2 hours → 8 × 250 ml). Each drink fills the slot whose time it falls in, and any extra
// spills into the next slots; it never fills a slot whose time has already passed, so a missed
// slot stays missed. Reminders are smart: when a slot's time comes and the person is behind, one notification
// says how much to drink; if they are on track, nothing is sent. In the phone app the same slots
// are scheduled with the system for the next week (see native-reminders.ts), skipping ones already met.
const KEY = 'dusal-reminders-v1';
// Set once notifications were allowed and reminders turned on by the first launch (startReminders).
const ASKED_KEY = 'dusal-reminders-asked-v1';
const SENT_KEY = 'dusal-reminders-sent-v1';
// `times`: the doctor's own drinking times and amounts (doctor-card.ts); while set they replace the even split.
export interface DoctorTime { at: string; ml: number }
export interface Settings { wake: string; sleep: string; every: number; on: boolean; times?: DoctorTime[] }
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
      times: Array.isArray(s?.times) && s.times.every(t => /^\d{2}:\d{2}$/.test(t?.at) && Number.isInteger(t?.ml) && t.ml > 0) && s.times.length ? s.times : undefined,
    };
  } catch { return { ...DEFAULTS }; }
}
export function writeSettings(s: Settings): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* keeps defaults */ } }

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const clock = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

const drunkToday = (state: AppState) => { const today = dayKey(); return state.events.reduce((sum, e) => e.type === 'drink' && dayKey(new Date(e.at)) === today ? sum + e.amount : sum, 0); };
// What to drink right now: what is left of the latest slot that has come. Missed slots are not added up.
const dueNow = (state: AppState, list: Slot[]) => {
  const behind = list.filter(x => x.state === 'now' || x.state === 'late');
  return behind[behind.length - 1]?.left ?? 0;
};

export interface Slot { at: number; time: string; ml: number; left: number; state: 'done' | 'now' | 'late' | 'later' }

export function slots(state: AppState, now = new Date()): Slot[] {
  const s = readSettings();
  const start = minutes(s.wake), end = minutes(s.sleep) > start ? minutes(s.sleep) : minutes(s.sleep) + 24 * 60;
  const step = Math.round(s.every * 60);
  const custom = s.times ? [...s.times].sort((a, b) => minutes(a.at) - minutes(b.at)) : null;
  const times: number[] = custom ? custom.map(t => minutes(t.at)) : [];
  if (!custom) for (let t = start; t < end; t += step) times.push(t);
  if (!times.length) times.push(start);
  const even = Math.max(10, Math.round(state.goal / times.length / 10) * 10);
  const per = times.map((_, i) => custom ? custom[i].ml : even);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Pour today's drinks, in time order, into the slot each was drunk in (before the first slot counts
  // as the first), spilling forward only.
  const left = [...per];
  const today = dayKey(now);
  const drinks = state.events.filter(e => e.type === 'drink' && dayKey(new Date(e.at)) === today).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const e of drinks) {
    const d = new Date(e.at), min = d.getHours() * 60 + d.getMinutes();
    let i = Math.max(0, times.filter(at => at <= min).length - 1);
    for (let ml = e.amount; ml > 0 && i < times.length; i++) { const take = Math.min(ml, left[i]); left[i] -= take; ml -= take; }
  }
  return times.map((at, i) => {
    let st: Slot['state'];
    if (!left[i]) st = 'done';
    else if (at > nowMin) st = 'later';
    else if ((times[i + 1] ?? at + step) <= nowMin) st = 'late';
    else st = 'now';
    return { at, time: clock(at), ml: per[i], left: left[i], state: st };
  });
}

// One quiet line on the home: the next thing to drink, or that the plan is done.
export function scheduleChip(state: AppState): string {
  const list = slots(state);
  const open = list.find(x => x.state !== 'done');
  const need = dueNow(state, list);
  const text = !open ? `${mdIcon('check')} Өнөөдрийн хуваарь биеллээ`
    : need ? `Одоо <b>${number(need)} мл</b> уух цаг`
    : `Дараагийн: <b>${open.time} · ${number(open.ml)} мл</b>`;
  const cls = !open ? 'done' : need ? 'due' : '';
  return `<button type="button" class="sched-chip ${cls}" id="sched-open" aria-label="Өнөөдрийн хуваарь, сануулга">
    <span aria-hidden="true">${mdIcon(readSettings().on ? 'alarm' : 'schedule')}</span><span>${text}</span><i aria-hidden="true">›</i></button>`;
}

function sheet(state: AppState): string {
  const s = readSettings();
  const list = slots(state);
  const icon = { done: mdIcon('check'), now: mdIcon('alarm'), late: mdIcon('warning'), later: '' } as const;
  const word = { done: 'Уусан', now: 'Одоо', late: 'Хоцорсон', later: '' } as const;
  const support = nativeReminders || 'Notification' in window;
  return `<div class="cal-card sched-card">
    <div class="cal-top"><h2 id="sched-title">Өнөөдрийн хуваарь</h2><button type="button" class="cal-close" aria-label="Хаах">${mdIcon('close')}</button></div>
    <p class="sched-sum">${state.mode === 'limit' ? 'Хязгаар' : 'Зорилт'} ${number(state.goal)} мл · ${list.length} удаа · ${readSettings().times ? '<b>эмчийн заасан цагаар</b>' : `тус бүр <b>${number(list[0]?.ml ?? 0)} мл</b>`}</p>
    <ol class="sched-list">${list.map(x => `<li class="${x.state}"><span class="t">${x.time}</span><span class="ml">${number(x.ml)} мл</span><span class="st">${icon[x.state]} ${word[x.state]}</span></li>`).join('')}</ol>
    <form class="sched-form" id="sched-form">
      <label>Сэрэх<input type="time" id="sched-wake" value="${s.wake}"/></label>
      <label>Унтах<input type="time" id="sched-sleep" value="${s.sleep}"/></label>
      <label>Хэдэн цаг тутам<select id="sched-every">${EVERY.map(v => `<option value="${v}" ${v === s.every ? 'selected' : ''}>${String(v).replace('.', ',')} цаг</option>`).join('')}</select></label>
    </form>
    <label class="sched-toggle"><input type="checkbox" id="sched-on" ${s.on ? 'checked' : ''} ${support ? '' : 'disabled'}/>
      <span><b>Сануулга</b><small>${nativeReminders ? 'Хуваарийн цаг бүрт ирнэ, тэр хэмжээгээ уусан бол алгасна' : support ? 'Хуваариасаа хоцорсон үед л мэдэгдэл ирнэ' : 'Энэ хөтөч мэдэгдэл дэмждэггүй'}</small></span></label>
    <p class="sched-note" id="sched-note" role="status"></p>
  </div>`;
}

export function bindSchedule(state: () => AppState, redraw: () => void): void {
  document.querySelector('#sched-open')?.addEventListener('click', () => openSchedule(state, redraw));
}

// Today's schedule and the reminder switch, over the page; closing redraws the page.
export function openSchedule(state: () => AppState, redraw: () => void): void {
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
      writeSettings({ ...s, times: undefined, wake: (box.querySelector('#sched-wake') as HTMLInputElement).value || s.wake, sleep: (box.querySelector('#sched-sleep') as HTMLInputElement).value || s.sleep, every: Number((box.querySelector('#sched-every') as HTMLSelectElement).value) });
      void planNative(state());
      draw();
    };
    box.querySelectorAll('#sched-form input, #sched-form select').forEach(el => el.addEventListener('change', save));
    box.querySelector<HTMLInputElement>('#sched-on')!.addEventListener('change', async e => {
      const want = (e.target as HTMLInputElement).checked;
      if (nativeReminders) {
        const allowed = !want || await askPermission();
        writeSettings({ ...readSettings(), on: want && allowed });
        await planNative(state());
        draw(!allowed ? 'Мэдэгдэл зөвшөөрөгдсөнгүй. Утасны тохиргоо → Апп → Дусал → Мэдэгдэл хэсгээс зөвшөөрнө үү.' : want ? 'Сануулга асаалаа. Апп хаалттай байсан ч ирнэ.' : 'Сануулга унтарлаа.');
        return;
      }
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
}

// What a reminder says and which face it shows, Duolingo style. A reminder only fires when its slot
// is still unmet (drinking re-plans and drops met ones), so it always means "behind": early in the
// day the drop is cheerful, later it worries, the evening's last one warns the streak is at risk,
// the morning after a missed day it cries, and after days away it misses you. Under a doctor's
// limit there is no streak to lose and more water is not the aim: it spreads the allowance through the
// day, saying how much in total is fine by now and never to go past the limit.
interface Tone { face: Face; title: string; body?: string }
function tone(state: AppState, day: number, slot: number, count: number, ml: number): Tone {
  const late = slot >= count / 2 ? { face: 'worried' as const, title: 'Ус уух цаг өнгөрч байна' } : { face: 'happy' as const, title: 'Ус уух цаг боллоо' };
  if (state.mode === 'limit') {
    const upTo = Math.min(state.goal, slots(state).slice(0, slot + 1).reduce((sum, x) => sum + x.ml, 0));
    return { face: 'happy', title: 'Шингэнээ жигд хуваарилаарай', body: `Одоогоор нийт ${number(upTo)} мл хүртэл уухад болно · эмчийн хязгаар ${number(state.goal)} мл. Хязгаараа хэтрүүлэхгүй, бага бага балгаарай.` };
  }
  const met = drunkToday(state) >= state.goal;
  // Days in a row up to today; tomorrow it is only alive if today is met.
  const streak = streakNow(state.events, state.goal, state.mode);
  const alive = day === 0 ? streak : day === 1 && met ? streak : 0;
  if (slot === count - 1 && alive > 0) return { face: 'sad', title: `${alive} өдрийн streak алдагдах гэж байна!`, body: `${readPetName()} цангаж байна 💧 ${number(ml)} мл уугаад streak-ээ авраарай.` };
  if (slot === 0 && day === 1 && !met && streak > 0) return { face: 'crying', title: 'Streak тасарлаа…', body: `Өчигдөр зорилтдоо хүрсэнгүй. Өнөөдөр шинээр эхэлье: ${number(ml)} мл уугаарай.` };
  if (slot === 0 && day >= 2) return { face: 'sad', title: 'Дусал чамайг санаж байна', body: `Хэд хоног ус бүртгээгүй байна. ${number(ml)} мл-ээс эхэлье.` };
  return late;
}

// Phone app: the coming week's slots as system notifications. Today's passed or already-met
// slots are left out, so drinking ahead quietly cancels the reminders it covers.
let planned = '';
async function planNative(state: AppState): Promise<void> {
  if (!nativeReminders) return;
  const s = readSettings();
  const today = slots(state);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const items: NativeReminder[] = [];
  if (s.on) {
    for (let day = 0; day < 7; day++) {
      today.forEach((x, slot) => {
        if (day === 0 && (x.state === 'done' || x.at <= nowMin)) return;
        const at = new Date(now);
        at.setDate(at.getDate() + day);
        at.setHours(Math.floor(x.at / 60), x.at % 60, 0, 0);
        const { face, title, body } = tone(state, day, slot, today.length, x.ml);
        items.push({ at, face, title, body: body ?? `${number(x.ml)} мл уугаарай · өдрийн ${state.mode === 'limit' ? 'хязгаар' : 'зорилт'} ${number(state.goal)} мл. ${FACTS[(day * today.length + slot) % FACTS.length]}` });
      });
    }
  }
  planned = planKey(state);
  try { await scheduleNative(items); } catch { /* the in-app schedule still works */ }
  // The weekend notice, apart from the reminders: only with reminders on and notifications allowed;
  // without them the card still shows in the app (weekend-card.ts).
  try {
    const notice = s.on && await allowed() ? weekendFor(state, streakNow(state.events, state.goal, state.mode)) : null;
    await scheduleWeekend(notice && { at: notice.at, title: notice.title, body: notice.body, face: notice.face });
  } catch { /* the card still shows in the app */ }
}
// What the plan depends on: settings, the goal, the day, the met slots, and for the weekend notice the
// diagnosis and dialysis days (set on other tabs).
const planKey = (st: AppState) => JSON.stringify([readSettings(), st.goal, st.mode, dayKey(), slots(st).map(x => x.state === 'done'), readProfile().condition, readDialysis()]);

// Checks once a minute; for the latest due slot the person is behind on, sends one notification.
let ticking = false;
export function startReminders(state: () => AppState): void {
  if (ticking) return;
  ticking = true;
  if (nativeReminders) {
    // First launch of the phone app: reminders are on by default once notifications are allowed. Kept apart
    // from the settings, which onboarding writes too (its wake and sleep times) before or after this runs;
    // a "no" asks again next launch.
    const first = (() => { try { return localStorage.getItem(ASKED_KEY) === null; } catch { return false; } })();
    void (async () => {
      if (first && await askPermission().catch(() => false)) {
        writeSettings({ ...readSettings(), on: true });
        try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* asks again */ }
      }
      await clearDelivered().catch(() => {});
      await planNative(state());
    })();
    // Coming back to the app clears the badge, so the pending reminders count from 1 again.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      void clearDelivered().catch(() => {}).then(() => planNative(state()));
    });
    // Re-plan only when something that changes the plan does (a drink, the goal, the day, settings).
    setInterval(() => {
      const st = state();
      if (planKey(st) !== planned) void planNative(st);
    }, 30_000);
    return;
  }
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
    const t = tone(st, 0, list.indexOf(last), list.length, need);
    const title = t.title;
    const body = t.body ?? `${number(need)} мл уугаарай (өнөөдөр ${number(drunk)} / ${number(st.goal)} мл). ${FACTS[new Date().getHours() % FACTS.length]}`;
    const icon = `/notif/${t.face}.png`;
    const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
    if (reg) await reg.showNotification(title, { body, icon, tag: 'dusal-reminder' });
    else new Notification(title, { body, icon, tag: 'dusal-reminder' });
  };
  void tick();
  setInterval(() => void tick(), 60_000);
}
