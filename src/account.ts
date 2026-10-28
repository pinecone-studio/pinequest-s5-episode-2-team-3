import type { AppState } from './data';
import { escape, number } from './format';
import { chooseSheet, confirmSheet, openAmountSheet, pickTime } from './hx-edit';
import { WEEKDAY_SHORT, readDialysis, writeDialysis } from './progress-data';
import { RULES, readRules, writeRules, type Rule } from './drink-flags';
import { planWeekend, setWeekendOn, weekendOn } from './weekend';
import { readSettings, writeSettings } from './schedule';
import { ACTIVITIES, readProfile, writeProfile, type Activity } from './plan';
import { readMember } from './member';
import { about, analytics, applyTheme, linked, look, prefs, reminder, security, type PayMethod } from './prefs';
import { notify } from './components/Toast';
import { bindCalibrate, calibrateBody } from './cup-calibrate';
import { bindWidgets, widgetsBody } from './widgets-view';

// Account sub-screens, Hydrify layout (kit 52–84). Each is a #hash view: a title, the parent it goes
// back to, an optional header button and a bottom button. Payments, sign-in options and languages
// are demo only: nothing is charged or sent, and the app stays in Mongolian.
export interface View { title: string; back: string; right?: string; body: () => string; foot?: string; bind?: (root: HTMLElement) => void }
export interface Ctx {
  state: () => AppState;
  goalSection: () => string;
  backupSection: () => string;
  devices: () => string;
  profilePanel: () => string;
  restart: () => void;
  logout: () => void;
  redraw: () => void;
}

const go = (hash: string) => { location.hash = hash; };
const chevron = '<i aria-hidden="true">›</i>';
const toggle = (key: string, on: boolean, label: string) =>
  `<input type="checkbox" role="switch" class="ac-switch" data-toggle="${key}" ${on ? 'checked' : ''} aria-label="${escape(label)}"/>`;

type Row = { label: string; value?: string; href?: string; act?: string; sw?: [string, boolean]; desc?: string; danger?: boolean };
function rows(list: Row[], cls = ''): string {
  return `<section class="hx-card ac-menu ${cls}"><ul>${list.map(r => {
    const inner = `<span class="ac-label${r.danger ? ' danger' : ''}">${r.label}${r.desc ? `<small>${r.desc}</small>` : ''}</span>${r.value !== undefined ? `<em>${escape(r.value)}</em>` : ''}`;
    if (r.sw) return `<li><label class="ac-row">${inner}${toggle(r.sw[0], r.sw[1], r.label)}</label></li>`;
    if (r.href) return `<li><a class="ac-row" href="${r.href}">${inner}${chevron}</a></li>`;
    return `<li><button type="button" class="ac-row" data-act="${r.act ?? ''}">${inner}${chevron}</button></li>`;
  }).join('')}</ul></section>`;
}
const card = (title: string, html: string) => `<section class="hx-card ac-menu"><h2 class="ac-card-title">${title}</h2>${html}</section>`;

// Delegated handlers for one view: [data-act] buttons and [data-toggle] switches.
function on(root: HTMLElement, acts: Record<string, (el: HTMLElement) => void>, toggles: Record<string, (on: boolean) => void> = {}): void {
  root.addEventListener('click', e => {
    const el = (e.target as Element).closest<HTMLElement>('[data-act]');
    if (el && acts[el.dataset.act!]) acts[el.dataset.act!](el);
  });
  root.addEventListener('change', e => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.toggle && toggles[el.dataset.toggle]) toggles[el.dataset.toggle](el.checked);
  });
}

// ---- Linked accounts: brand marks ----
const tick = '<svg class="ac-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const BRAND: Record<string, string> = {
  paypal: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#fff"/><path d="M15 10h8a6 6 0 0 1 0 12h-4l-1.5 8H13z" fill="#253b80"/><path d="M18 14h6a5 5 0 0 1 0 10h-3l-1.2 6h-3.6z" fill="#179bd7"/></svg>',
  google: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#fff"/><path d="M29 20.3c0-.7 0-1.3-.2-1.9H20v3.6h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 29 20.3z" fill="#4285f4"/><path d="M20 29a8.9 8.9 0 0 0 6.1-2.2l-3-2.3a5.5 5.5 0 0 1-8.2-2.9h-3.1v2.4A9 9 0 0 0 20 29z" fill="#34a853"/><path d="M14.9 21.6a5.4 5.4 0 0 1 0-3.4v-2.4h-3.1a9 9 0 0 0 0 8.2z" fill="#fbbc05"/><path d="M20 14.6a4.9 4.9 0 0 1 3.4 1.3l2.6-2.6A8.7 8.7 0 0 0 20 11a9 9 0 0 0-8.2 4.8l3.1 2.4A5.4 5.4 0 0 1 20 14.6z" fill="#ea4335"/></svg>',
  apple: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#fff"/><path d="M24.5 20.7c0-2.5 2-3.6 2.1-3.7a4.5 4.5 0 0 0-3.6-1.9c-1.5-.2-2.9.9-3.7.9s-1.9-.9-3.2-.8a4.7 4.7 0 0 0-4 2.4c-1.7 2.9-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4s1.7-.8 3.1-.8 1.9.8 3.2.8 2.1-1.2 2.9-2.4a10 10 0 0 0 1.3-2.7 4.2 4.2 0 0 1-2.3-3.9zM22.1 13.4a4.2 4.2 0 0 0 1-3.1 4.4 4.4 0 0 0-2.9 1.5 4 4 0 0 0-1 3 3.6 3.6 0 0 0 2.9-1.4z"/></svg>',
  mastercard: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#111"/><circle cx="16" cy="20" r="7" fill="#eb001b"/><circle cx="24" cy="20" r="7" fill="#f79e1b" opacity=".9"/></svg>',
  visa: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#1a1f71"/><text x="20" y="24" text-anchor="middle" font-size="11" font-weight="900" font-style="italic" fill="#fff">VISA</text></svg>',
  amex: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#2e77bc"/><text x="20" y="23.5" text-anchor="middle" font-size="7.5" font-weight="900" fill="#fff">AMEX</text></svg>',
  card: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#369fff"/><rect x="11" y="14" width="18" height="12" rx="2" fill="#fff"/><path d="M11 18h18" stroke="#369fff" stroke-width="2"/></svg>',
};
const brand = (m: PayMethod) => `<span class="ac-brand" aria-hidden="true">${BRAND[m.brand] ?? BRAND.card}</span>`;
const method = (m: PayMethod, right: string) => `<span class="ac-pay">${brand(m)}<span class="ac-label">${escape(m.name)}<small>${escape(m.detail)}</small></span>${right}</span>`;

// ---- Reminders (kit 63–66) ----
const minutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const MODE_LABEL = { static: 'Тогтмол цаг', interval: 'Давтамжтай', level: 'Усны түвшнээр' } as const;
const asDate = (t: string) => { const d = new Date(); const [h, m] = t.split(':').map(Number); d.setHours(h, m, 0, 0); return d; };
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// ---- Help (kit 79–83) ----
const FAQ: Record<string, [string, string][]> = {
  'Ерөнхий': [
    ['Дусал гэж юу вэ?', 'Дусал бол өдөр тутмын усаа хянаж, зөв хэмжээгээр уухад тань туслах апп. Ухаалаг суурь саваа тавихад уусан усыг автоматаар бүртгэнэ.'],
    ['Дусал хэрхэн ажилладаг вэ?', 'Таны жин, нас, хөдөлгөөнөөс өдрийн зорилтыг тооцоод, уусан усыг тань гараар эсвэл ухаалаг суурьаар бүртгэнэ.'],
    ['Бүртгэл хэр нарийвчлалтай вэ?', 'Ухаалаг суурь жингийн мэдрэгчээр ±5 мл нарийвчлалтай хэмжинэ. Гараар нэмэхэд таны сонгосон аяганы хэмжээ орно.'],
  ],
  'Бүртгэл': [
    ['Дусал үнэгүй юу?', 'Тийм. Апп бүрэн үнэгүй, сарын төлбөргүй. Зөвхөн ухаалаг суурийг нэг удаа худалдаж авна.'],
    ['Өгөгдөл маань аюулгүй юу?', 'Бүртгэл таны утсанд хадгалагдаж, зөвхөн таны төхөөрөмжүүдийн хооронд синк хийгдэнэ.'],
  ],
  'Үйлчилгээ': [['Өгөгдлөө экспортлож болох уу?', 'Тийм. Өгөгдөл ба шинжилгээ → Өгөгдлөө татах хэсгээс JSON файл болгон татна.']],
  'Ус': [
    ['Эмч хязгаар тогтоосон бол яах вэ?', 'Биеийн онцлог дээр бөөр эсвэл зүрхний дутагдлыг сонгоход апп зорилт биш, эмчийн хязгаарыг дагана.'],
    ['Цай, кофе тоологдох уу?', 'Тийм, ундааг аяга солих хэсгээс сонгож бүртгэнэ.'],
  ],
};
let faqTab = 'Ерөнхий';
let faqQuery = '';

const POLICY = `<h3>Хүчинтэй огноо: 2026 оны 10-р сарын 1</h3>
  <p>Дусал («бид») таны хувийн мэдээллийг хамгаалахыг эрхэмлэнэ. Энэхүү бодлого нь апп-ыг ашиглахад бид ямар мэдээлэл цуглуулж, хэрхэн ашиглахыг тайлбарлана.</p>
  <h3>1. Бидний цуглуулах мэдээлэл</h3>
  <ul><li>Хувийн мэдээлэл: нэр, нас, жин, өндөр зэрэг таны оруулсан мэдээлэл.</li><li>Хэрэглээний мэдээлэл: уусан усны хэмжээ, цаг.</li><li>Төхөөрөмжийн мэдээлэл: ухаалаг суурийн дугаар, синкийн төлөв.</li></ul>
  <h3>2. Мэдээллийг хэрхэн ашиглах</h3>
  <ul><li>Апп-ын үйлчилгээг үзүүлэх, сайжруулах.</li><li>Таны усны төлөвлөгөөг тооцох, сануулга илгээх.</li></ul>
  <p><a class="ac-link" href="/privacypolicy.html">Бүтэн бодлогыг унших</a></p>`;
const TERMS = `<h3>Хүчинтэй огноо: 2026 оны 10-р сарын 1</h3>
  <p>Энэхүү нөхцөл нь Дусал апп-ыг ашиглахтай холбоотой харилцааг зохицуулна. Апп-ыг ашигласнаар та эдгээр нөхцөлийг зөвшөөрч байна.</p>
  <h3>1. Апп-ын хэрэглээ</h3>
  <ul><li>Апп-ыг өөрийн хариуцлагаар ашиглана.</li><li>Апп нь эмчийн зөвлөгөөг орлохгүй.</li><li>Апп-ыг хууль бус зорилгоор ашиглахгүй.</li></ul>
  <h3>2. Агуулга</h3><p>Таны оруулсан бүртгэл танд хамаарна. Бид түүнийг зөвхөн үйлчилгээ үзүүлэхэд ашиглана.</p>`;

const LANGUAGES: [string, string][] = [['mn', 'Монгол'], ['en', 'English'], ['ru', 'Русский'], ['zh', '中文'], ['ko', '한국어'], ['ja', '日本語'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español']];

let goalBack = 'preferences';
export function accountViews(ctx: Ctx): (key: string) => View | undefined {
  const reminderBody = (): string => {
    const s = readSettings(), r = reminder.read(), goal = ctx.state().goal;
    const head = rows([{ label: 'Сануулга', sw: ['on', s.on] }, { label: 'Сануулгын горим', value: MODE_LABEL[r.mode], act: 'mode' }]);
    const general = rows([
      { label: 'Давтах', value: r.repeat, act: 'repeat' }, { label: 'Сануулгын мессеж', act: 'messages' },
      { label: 'Дуу', value: r.sound, act: 'sound' }, { label: 'Ухаалаг алгасах', value: r.skip, act: 'skip' },
      { label: '100% хүрвэл зогсох', sw: ['stopFull', r.stopFull] },
    ]);
    let body = '';
    if (r.mode === 'static') {
      body = `<section class="hx-card ac-menu"><div class="ac-card-head"><h2 class="ac-card-title">Сануулах цаг</h2><button type="button" class="ac-plus" data-act="add-time" aria-label="Цаг нэмэх">+</button></div><ul>${r.times.map((t, i) => `<li><label class="ac-row"><span class="ac-label">${t.t}</span>${toggle(`time-${i}`, t.on, t.t)}</label></li>`).join('')}</ul></section>`;
    } else {
      const settings = rows([{ label: 'Өдөр эхлэх', value: s.wake, act: 'wake' }, { label: 'Өдөр дуусах', value: s.sleep, act: 'sleep' },
        ...(r.mode === 'interval' ? [{ label: 'Давтамж', value: `${String(s.every).replace('.', ',')} цаг`, act: 'every' }] : [])]);
      body = settings.replace('<ul>', '<h2 class="ac-card-title">Сануулгын тохиргоо</h2><ul>');
      if (r.mode === 'level') {
        const a = minutes(s.wake), b = minutes(s.sleep) > a ? minutes(s.sleep) : minutes(s.sleep) + 1440;
        body += card('Цагаар уух хэмжээ', `<ul class="ac-level">${Array.from({ length: 10 }, (_, i) => `<li><span>${(i + 1) * 10}% (${number(Math.round((goal * (i + 1)) / 10))} мл)</span><em>${clock(a + ((b - a) * (i + 1)) / 10)}</em></li>`).join('')}</ul>`);
      }
    }
    const note = r.mode === 'interval' ? '' : '<p class="ac-small center">Demo: мэдэгдэл одоогоор «Давтамжтай» горимоор ирнэ.</p>';
    return head + general + body + note;
  };

  const personalBody = (): string => {
    const p = readProfile(), s = readSettings(), a = about.read();
    const SEX = { male: 'Эрэгтэй', female: 'Эмэгтэй', none: 'Бусад' } as const;
    const CLIMATE = { hot: 'Халуун', mild: 'Дунд зэрэг', cold: 'Хүйтэн' } as const;
    return rows([
      { label: 'Нэр', value: readMember()?.name ?? '—', href: '#profile' },
      { label: 'Хүйс', value: SEX[a.sex], act: 'sex' }, { label: 'Өндөр', value: `${p.height} см`, act: 'height' },
      { label: 'Жин', value: `${p.weight} кг`, act: 'weight' }, { label: 'Нас', value: `${p.age} нас`, act: 'age' },
      { label: 'Сэрэх цаг', value: s.wake, act: 'wake' }, { label: 'Унтах цаг', value: s.sleep, act: 'sleep' },
      { label: 'Хөдөлгөөн', value: ACTIVITIES[p.activity].label, act: 'activity' }, { label: 'Уур амьсгал', value: CLIMATE[a.climate], act: 'climate' },
    ]) + rows([{ label: 'Биеийн онцлог, төлөвлөгөө', desc: 'Онош, эмчийн хязгаар, AI тооцоо', href: '#profile' }]);
  };
  const saveProfile = (patch: Partial<ReturnType<typeof readProfile>>) => {
    if (writeProfile({ ...readProfile(), ...patch })) notify('Хадгаллаа. Төлөвлөгөөг «Биеийн онцлог» хэсгээс дахин тооцоолж болно.');
    ctx.redraw();
  };
  const setTime = (key: 'wake' | 'sleep', title: string) => pickTime(asDate(readSettings()[key]), d => { writeSettings({ ...readSettings(), times: undefined, [key]: hhmm(d) }); ctx.redraw(); }, title);

  const p = () => prefs.read();
  const choose = (title: string, opts: string[], key: keyof ReturnType<typeof prefs.read>) =>
    chooseSheet(title, opts.map(o => [o, o]), String(p()[key]), v => { prefs.write({ [key]: v }); ctx.redraw(); });

  const VIEWS: Record<string, View> = {
    // «Миний савнууд»: measure a cup on the base, the saved cups and the main one (cup-calibrate.ts).
    cups: { title: 'Аягаа хэмжүүлэх', back: '', body: calibrateBody, bind: root => bindCalibrate(root, ctx.redraw) },
    reminder: {
      title: 'Уух сануулга', back: '', body: reminderBody,
      bind: root => on(root, {
        mode: () => chooseSheet('Сануулгын горим', Object.entries(MODE_LABEL), reminder.read().mode, v => { reminder.write({ mode: v as 'static' | 'interval' | 'level' }); ctx.redraw(); }),
        repeat: () => chooseSheet('Давтах', [['Өдөр бүр', 'Өдөр бүр'], ['Ажлын өдөр', 'Ажлын өдөр'], ['Амралтын өдөр', 'Амралтын өдөр']], reminder.read().repeat, v => { reminder.write({ repeat: v }); ctx.redraw(); }),
        sound: () => chooseSheet('Дуу', [['Усны дусал', 'Усны дусал'], ['Хонх', 'Хонх'], ['Чимээгүй', 'Чимээгүй']], reminder.read().sound, v => { reminder.write({ sound: v }); ctx.redraw(); }),
        skip: () => chooseSheet('Ухаалаг алгасах', [['Унтраалттай', 'Унтраалттай'], ['10 мин', 'Сүүлд уусанаас 10 мин дотор'], ['30 мин', 'Сүүлд уусанаас 30 мин дотор']], reminder.read().skip, v => { reminder.write({ skip: v }); ctx.redraw(); }),
        messages: () => notify('Сануулга бүрд усны тухай нэг баримт санамсаргүй гарна.'),
        wake: () => setTime('wake', 'Өдөр эхлэх'),
        sleep: () => setTime('sleep', 'Өдөр дуусах'),
        every: () => chooseSheet('Давтамж', [['1', '1 цаг'], ['1.5', '1,5 цаг'], ['2', '2 цаг'], ['3', '3 цаг']], String(readSettings().every), v => { writeSettings({ ...readSettings(), times: undefined, every: Number(v) }); ctx.redraw(); }),
        'add-time': () => pickTime(asDate('09:00'), d => { const r = reminder.read(); const t = hhmm(d); if (!r.times.some(x => x.t === t)) reminder.write({ times: [...r.times, { t, on: true }].sort((a, b) => a.t.localeCompare(b.t)) }); ctx.redraw(); }, 'Цаг нэмэх'),
      }, new Proxy({} as Record<string, (on: boolean) => void>, {
        get: (_, key: string) => (value: boolean) => {
          if (key === 'on') {
            writeSettings({ ...readSettings(), on: value });
            if (value && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
          } else if (key === 'stopFull') reminder.write({ stopFull: value });
          else if (key.startsWith('time-')) { const r = reminder.read(); r.times[Number(key.slice(5))].on = value; reminder.write({ times: r.times }); }
        },
      })),
    },
    personal: {
      title: 'Хувийн мэдээлэл', back: '', body: personalBody,
      bind: root => on(root, {
        sex: () => chooseSheet('Хүйс', [['male', 'Эрэгтэй'], ['female', 'Эмэгтэй'], ['none', 'Бусад']], about.read().sex, v => { about.write({ sex: v as 'male' | 'female' | 'none' }); ctx.redraw(); }),
        climate: () => chooseSheet('Уур амьсгал', [['hot', 'Халуун'], ['mild', 'Дунд зэрэг'], ['cold', 'Хүйтэн']], about.read().climate, v => { about.write({ climate: v as 'hot' | 'mild' | 'cold' }); ctx.redraw(); }),
        height: () => openAmountSheet('Өндөр', '📏', readProfile().height, v => (v >= 90 ? saveProfile({ height: v }) : notify('Өндөр 90–230 см байна.')), 'см', 230),
        weight: () => openAmountSheet('Жин', '⚖️', readProfile().weight, v => (v >= 10 ? saveProfile({ weight: v }) : notify('Жин 10–250 кг байна.')), 'кг', 250),
        age: () => openAmountSheet('Нас', '🎂', readProfile().age, v => (v >= 4 ? saveProfile({ age: v }) : notify('Нас 4–110 байна.')), 'нас', 110),
        wake: () => setTime('wake', 'Сэрэх цаг'),
        sleep: () => setTime('sleep', 'Унтах цаг'),
        activity: () => chooseSheet('Хөдөлгөөн', (Object.keys(ACTIVITIES) as Activity[]).map(a => [a, `${ACTIVITIES[a].label} · ${ACTIVITIES[a].hint}`]), readProfile().activity, v => saveProfile({ activity: v as Activity })),
      }),
    },
    profile: { title: 'Биеийн онцлог', back: 'personal', body: ctx.profilePanel },
    // «Эмчийн зөвлөмж»: the doctor's daily limit (changed only through «Засах», never by the AI), what the
    // doctor ruled out, and the dialysis days and time (home card, «Явц», the nurse's report).
    doctor: {
      title: 'Эмчийн зөвлөмж', back: '',
      body: () => {
        const s = ctx.state(), d = readDialysis();
        const chip = (n: number) => `<button type="button" class="dr-chip" data-dday="${n}" aria-pressed="${d.days.includes(n)}">${WEEKDAY_SHORT[n % 7]}</button>`;
        return `<section class="hx-card dr-limit">
            <span class="dr-lock" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg></span>
            <div><small>${s.mode === 'limit' ? 'Өдрийн шингэний хязгаар' : 'Өдрийн зорилт'}</small><b>${number(s.goal)} мл</b><small>Эмчийн тогтоосноор · AI өөрчлөхгүй</small></div>
            <a href="#goal">Засах</a>
          </section>
          <section class="hx-card dr-rules" aria-labelledby="dr-rules-title">
            <h2 id="dr-rules-title">Эмч хориглосон</h2>
            <p>Тэмдэглэсэн ундаа сонгох үед улаан «Эмч хориглосон» гэж харагдана.</p>
            <ul>${RULES.map(r => `<li><label class="dr-rule"><input type="checkbox" data-rule="${r.id}" ${readRules().includes(r.id) ? 'checked' : ''}/><span><b>${r.name}</b><small>${r.sub}</small></span></label></li>`).join('')}</ul>
          </section>
          <section class="hx-card dr-days" aria-labelledby="dr-days-title">
            <h2 id="dr-days-title">Диализын өдрүүд</h2><small>Тайлан, жингийн тооцоонд ашиглана</small>
            <div class="dr-chips" role="group" aria-labelledby="dr-days-title">${[1, 2, 3, 4, 5, 6, 7].map(chip).join('')}</div>
            <button type="button" class="dr-time" data-act="dtime"><span>Эхлэх цаг</span><b>${d.time}</b></button>
            ${s.mode === 'limit' ? `<label class="dr-switch"><span><b>Амралтын өмнөх сануулга</b><small>Хамгийн урт завсрын өмнөх орой 19:00-д</small></span>${toggle('weekend', weekendOn(), 'Амралтын өмнөх сануулга')}</label>` : ''}
          </section>`;
      },
      foot: '<p class="dr-foot">Эмчийнхээ хэлснээр тэмдэглээрэй. Дусал эмчилгээний шийдвэр гаргахгүй.</p>',
      bind: root => {
        root.querySelectorAll<HTMLButtonElement>('[data-dday]').forEach(b => b.addEventListener('click', () => {
          const d = readDialysis(), n = Number(b.dataset.dday);
          writeDialysis({ ...d, days: d.days.includes(n) ? d.days.filter(x => x !== n) : [...d.days, n] });
          void planWeekend(ctx.state(), true);
          ctx.redraw();
          document.querySelector<HTMLButtonElement>(`[data-dday="${n}"]`)?.focus();
        }));
        root.querySelector('a[href="#goal"]')!.addEventListener('click', () => { goalBack = 'doctor'; });
        root.querySelectorAll<HTMLInputElement>('[data-rule]').forEach(i => i.addEventListener('change', () => {
          const rules = readRules().filter(r => r !== i.dataset.rule);
          writeRules(i.checked ? [...rules, i.dataset.rule as Rule] : rules);
        }));
        on(root, { dtime: () => pickTime(asDate(readDialysis().time), t => { writeDialysis({ ...readDialysis(), time: hhmm(t) }); void planWeekend(ctx.state(), true); ctx.redraw(); }, 'Диализ эхлэх цаг') },
          { weekend: v => { setWeekendOn(v); void planWeekend(ctx.state(), v); } });
      },
    },
    widgets: { title: 'Нүүр дэлгэцийн widget', back: '', body: widgetsBody, bind: bindWidgets },
    preferences: {
      title: 'Тохиргоо', back: '',
      body: () => {
        goalBack = 'preferences';
        const v = p(), st = ctx.state();
        return rows([
          { label: st.mode === 'limit' ? 'Өдрийн хязгаар' : 'Өдрийн зорилт', value: `${number(st.goal)} мл`, href: '#goal' },
          { label: 'Усны нэгж', value: v.cupUnit, act: 'cupUnit' }, { label: 'Жингийн нэгж', value: v.weightUnit, act: 'weightUnit' }, { label: 'Өндрийн нэгж', value: v.heightUnit, act: 'heightUnit' },
        ]) + rows([{ label: '7 хоногийн эхний өдөр', value: v.weekStart, act: 'weekStart' }, { label: 'Цагийн формат', value: v.timeFormat, act: 'timeFormat' }, { label: 'Өдөр шинэчлэгдэх цаг', value: v.dayReset, act: 'dayReset' }])
          + rows([{ label: 'Амжилт', sw: ['achievements', v.achievements] }, { label: 'Чичиргээ', sw: ['haptics', v.haptics] }])
          + rows([{ label: 'Кэш цэвэрлэх', value: '0.4 MB', act: 'cache' }, { label: 'Бүх бүртгэлийг шинээр эхлүүлэх', act: 'restart', danger: true }])
          + '<p class="ac-small center">Demo: нэгж, формат одоогоор зөвхөн энд хадгалагдана.</p>';
      },
      bind: root => on(root, {
        cupUnit: () => choose('Усны нэгж', ['мл', 'л', 'US oz', 'UK oz'], 'cupUnit'),
        weightUnit: () => choose('Жингийн нэгж', ['кг', 'lb'], 'weightUnit'),
        heightUnit: () => choose('Өндрийн нэгж', ['см', 'фут'], 'heightUnit'),
        weekStart: () => choose('7 хоногийн эхний өдөр', ['Даваа', 'Ням', 'Бямба'], 'weekStart'),
        timeFormat: () => choose('Цагийн формат', ['Системийн', '24 цаг', '12 цаг'], 'timeFormat'),
        dayReset: () => pickTime(asDate(p().dayReset), d => { prefs.write({ dayReset: hhmm(d) }); ctx.redraw(); }, 'Өдөр шинэчлэгдэх цаг'),
        cache: () => notify('Кэш цэвэрлэгдлээ.'),
        restart: () => confirmSheet('Шинээр эхлүүлэх', 'Бүх усны бүртгэл устна. Үргэлжлүүлэх үү?', 'Тийм, устгах', ctx.restart),
      }, { achievements: v => prefs.write({ achievements: v }), haptics: v => prefs.write({ haptics: v }) }),
    },
    // Opened from «Тохиргоо» or from «Эмчийн зөвлөмж» › Засах; back goes where it came from.
    goal: { title: 'Өдрийн зорилт', get back() { return goalBack; }, body: ctx.goalSection },
    security: {
      title: 'Бүртгэл ба аюулгүй байдал', back: '',
      body: () => { const s = security.read(); return rows([
        { label: 'Хурууны хээ', sw: ['biometric', s.biometric] }, { label: 'Face ID', sw: ['faceId', s.faceId] },
        { label: 'SMS баталгаажуулалт', sw: ['sms', s.sms] }, { label: 'Google Authenticator', sw: ['google', s.google] },
        { label: 'Нууц үг солих', act: 'password' },
        { label: 'Төхөөрөмжийн удирдлага', desc: 'Бүртгэлдээ холбосон төхөөрөмжүүдээ удирдах', href: '#linked' },
        { label: 'Бүртгэлээ түр хаах', desc: 'Түр хаагаад, хүссэн үедээ буцааж нээнэ', act: 'deactivate' },
        { label: 'Бүртгэл устгах', desc: 'Бүртгэл, өгөгдлөө бүрмөсөн устгана. Болгоомжтой!', act: 'delete', danger: true },
      ]); },
      bind: root => on(root, {
        password: () => notify('Demo: нууц үг одоогоор утсан дээрх профайлд хэрэглэгдэхгүй.'),
        deactivate: () => confirmSheet('Түр хаах', 'Бүртгэлээ түр хаах уу?', 'Тийм', () => notify('Бүртгэлийг түр хаалаа (demo).')),
        delete: () => confirmSheet('Бүртгэл устгах', 'Профайл, нэр энэ утаснаас устна. Үргэлжлүүлэх үү?', 'Тийм, устгах', ctx.logout),
      }, Object.fromEntries((['biometric', 'faceId', 'sms', 'google'] as const).map(k => [k, (v: boolean) => { security.write({ [k]: v }); }]))),
    },
    linked: {
      title: 'Холбосон бүртгэл', back: '',
      body: () => { const l = linked.read(); const acc = (k: keyof typeof l, name: string, b: string) => `<div class="hx-card ac-pay-opt">${method({ id: k, name, detail: '', brand: b }, `<button type="button" class="ac-connect${l[k] ? ' on' : ''}" data-act="link" data-k="${k}">${l[k] ? 'Холбогдсон' : 'Холбох'}</button>`)}</div>`;
        return `<div class="ac-pay-list">${acc('google', 'Google', 'google')}${acc('apple', 'Apple', 'apple')}${acc('facebook', 'Facebook', 'card')}${acc('twitter', 'X (Twitter)', 'card')}</div><h2 class="ac-sub">Төхөөрөмж</h2>${ctx.devices()}`; },
      bind: root => on(root, { link: el => { const k = el.dataset.k as 'google'; linked.write({ [k]: !linked.read()[k] }); ctx.redraw(); } }),
    },
    data: {
      title: 'Өгөгдөл ба шинжилгээ', back: '',
      body: () => { const a = analytics.read(); return rows([
        { label: 'Өгөгдлийн хэрэглээ', desc: 'Апп-ыг сайжруулахад нэргүй хэрэглээний мэдээлэл илгээх', sw: ['usage', a.usage] },
        { label: 'Зар сурталчилгааны тохиргоо', desc: 'Танд тохирсон зар харуулах', sw: ['ads', a.ads] },
        { label: 'Өгөгдлөө татах', desc: 'Бүх бүртгэл, тохиргоогоо файл болгон татах, сэргээх', href: '#backup' },
      ]); },
      bind: root => on(root, {}, { usage: v => analytics.write({ usage: v }), ads: v => analytics.write({ ads: v }) }),
    },
    backup: { title: 'Өгөгдлөө татах', back: 'data', body: ctx.backupSection },
    appearance: {
      title: 'Харагдах байдал', back: '',
      body: () => { const l = look.read(); return rows([{ label: 'Загвар', value: { system: 'Системийн', light: 'Цайвар', dark: 'Бараан' }[l.theme], act: 'theme' }, { label: 'Апп-ын хэл', value: LANGUAGES.find(([k]) => k === l.language)![1], href: '#language' }]); },
      bind: root => on(root, { theme: () => chooseSheet('Загвар сонгох', [['system', 'Системийн'], ['light', 'Цайвар'], ['dark', 'Бараан']], look.read().theme, v => { look.write({ theme: v as 'system' | 'light' | 'dark' }); applyTheme(); ctx.redraw(); }) }),
    },
    language: {
      title: 'Апп-ын хэл', back: 'appearance',
      body: () => `<section class="hx-card ac-menu"><ul>${LANGUAGES.map(([k, l]) => `<li><button type="button" class="ac-row" data-act="lang" data-k="${k}" aria-pressed="${look.read().language === k}"><span class="ac-label">${l}</span>${look.read().language === k ? tick : ''}</button></li>`).join('')}</ul></section>`,
      bind: root => on(root, { lang: el => { if (el.dataset.k !== 'mn') { notify('Demo: апп одоогоор зөвхөн Монгол хэлтэй.'); return; } look.write({ language: 'mn' }); ctx.redraw(); } }),
    },
    help: {
      title: 'Тусламж', back: '',
      body: () => rows([
        { label: 'Түгээмэл асуулт', href: '#faq' }, { label: 'Холбоо барих', href: '#contact' }, { label: 'Нууцлалын бодлого', href: '#privacy' }, { label: 'Үйлчилгээний нөхцөл', href: '#terms' },
        { label: 'Хамтрагч', act: 'soon' }, { label: 'Ажлын байр', act: 'soon' }, { label: 'Хүртээмж', act: 'soon' }, { label: 'Санал хүсэлт', href: 'mailto:hello@dusal.mn?subject=Санал' },
        { label: 'Бидний тухай', act: 'about' }, { label: 'Үнэлгээ өгөх', act: 'soon' }, { label: 'Вэб сайт', href: '/' }, { label: 'Сошиал хаяг', href: '#contact' },
      ]),
      bind: root => on(root, { soon: () => notify('Удахгүй нэмэгдэнэ.'), about: () => notify('Дусал — PineQuest S5, 3-р баг.') }),
    },
    faq: {
      title: 'Түгээмэл асуулт', back: 'help',
      body: () => {
        const q = faqQuery.toLowerCase();
        const list = q ? Object.values(FAQ).flat().filter(([a, b]) => (a + b).toLowerCase().includes(q)) : FAQ[faqTab];
        return `<label class="ac-search"><span aria-hidden="true">⌕</span><span class="visually-hidden">Хайх</span><input type="search" id="faq-search" placeholder="Хайх" value="${escape(faqQuery)}"/></label>
          <div class="ac-chips" role="tablist" aria-label="Ангилал">${Object.keys(FAQ).map(t => `<button type="button" role="tab" aria-selected="${!q && t === faqTab}" data-act="tab" data-t="${t}">${t}</button>`).join('')}</div>
          <div class="ac-faq">${list.map(([a, b], i) => `<details class="hx-card" ${i === 0 ? 'open' : ''}><summary>${a}</summary><p>${b}</p></details>`).join('') || '<p class="hx-empty">Олдсонгүй.</p>'}</div>`;
      },
      bind: root => {
        on(root, { tab: el => { faqTab = el.dataset.t!; faqQuery = ''; ctx.redraw(); } });
        const input = root.querySelector<HTMLInputElement>('#faq-search')!;
        input.addEventListener('change', () => { faqQuery = input.value.trim(); ctx.redraw(); document.querySelector<HTMLInputElement>('#faq-search')?.focus(); });
      },
    },
    contact: {
      title: 'Холбоо барих', back: 'help',
      body: () => `<div class="ac-contact">${([['🎧', 'Хэрэглэгчийн туслах', 'mailto:hello@dusal.mn'], ['🌐', 'Вэб сайт', '/'], ['💬', 'WhatsApp', 'https://wa.me/'], ['📘', 'Facebook', 'https://facebook.com/'], ['𝕏', 'X (Twitter)', 'https://x.com/'], ['📸', 'Instagram', 'https://instagram.com/']] as const).map(([i, l, h]) => `<a class="hx-card ac-row" href="${h}" ${h.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}><span class="ac-label"><span aria-hidden="true">${i}</span> ${l}</span>${chevron}</a>`).join('')}</div>`,
    },
    privacy: { title: 'Нууцлалын бодлого', back: 'help', body: () => `<article class="ac-doc">${POLICY}</article>` },
    terms: { title: 'Үйлчилгээний нөхцөл', back: 'help', body: () => `<article class="ac-doc">${TERMS}</article>` },
  };

  return key => VIEWS[key];
}
