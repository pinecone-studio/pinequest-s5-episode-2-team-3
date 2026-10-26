import './onboarding.css';
import { escape, number } from './format';
import { mdIcon } from './components/Icon';
import { ACTIVITIES, CONDITIONS, PROFILE_KEY, calcPlan, readProfile, writeProfile, type Activity, type Condition, type Plan, type Profile } from './plan';
import { saveMember, readMember } from './member';
import { readSettings, writeSettings } from './schedule';
import { openAmountSheet } from './hx-edit';
import { about } from './prefs';
import { climateOf, fetchWeather } from './weather';

// First visit, Hydrify layout (demo): three walkthrough slides, a sign-up form (name kept on this
// phone; email and password are not sent anywhere), nine one-question steps with a progress bar
// (sex, height, weight, age, wake-up, bedtime, activity, climate, condition), a "making your plan"
// ring, then the daily amount from calcPlan (+500 мл in a hot climate), shown in the unit picked.
const SEEN_KEY = 'dusal-onboarded-v1';

export function needsOnboarding(): boolean {
  try { return !localStorage.getItem(SEEN_KEY) && !localStorage.getItem(PROFILE_KEY); } catch { return false; }
}
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: ask again next time */ } };

type Sex = 'male' | 'female' | 'none';
type Screen = 'walk' | 'signup' | 'step' | 'making' | 'ready';
const QUESTIONS = 9;
type Climate = 'hot' | 'mild' | 'cold';
const CLIMATES: Record<Climate, { label: string; icon: string; extra: number }> = {
  hot: { label: 'Халуун', icon: '<circle cx="16" cy="16" r="6.5" fill="#ffb300"/><g stroke="#ffb300" stroke-width="2.4" stroke-linecap="round"><path d="M16 2.5v4M16 25.5v4M2.5 16h4M25.5 16h4M6.5 6.5l2.8 2.8M22.7 22.7l2.8 2.8M6.5 25.5l2.8-2.8M22.7 9.3l2.8-2.8"/></g>', extra: 500 },
  mild: { label: 'Дунд зэрэг', icon: '<circle cx="12" cy="12" r="5.5" fill="#ffb300"/><g stroke="#ffb300" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v3M2 12h3M4.9 4.9l2.1 2.1M19.1 4.9 17 7"/></g><path d="M10 27a5 5 0 0 1 .6-10A7 7 0 0 1 24 15.5a5.8 5.8 0 0 1 .5 11.5z" fill="#cfe6fd" stroke="#9fd0fb" stroke-width="1.2"/>', extra: 0 },
  cold: { label: 'Хүйтэн', icon: '<g stroke="#369fff" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13"/><path d="M12.5 5.5 16 8.5l3.5-3M12.5 26.5 16 23.5l3.5 3M4.5 14l4.4-1-1.3-4.4M27.5 18l-4.4 1 1.3 4.4M4.5 18l4.4 1-1.3 4.4M27.5 14l-4.4-1 1.3-4.4"/></g>', extra: 0 },
};
// The result in the unit picked on the last screen (kit 19).
const UNITS = { ml: { label: 'мл', per: 1, digits: 0 }, l: { label: 'л', per: 1000, digits: 2 }, us: { label: 'US oz', per: 29.5735, digits: 0 }, uk: { label: 'UK oz', per: 28.4131, digits: 0 } } as const;
type Unit = keyof typeof UNITS;

// The figure on the height and weight steps (kit 10–12), drawn from the numbers so it changes as
// the wheel turns: BMI widens the shoulders, chest, waist (a belly from about BMI 25), hips, arms
// and legs; height scales the whole figure from the feet up. Women get narrower shoulders, wider
// hips and a top. Height 175 cm and BMI 22 is the drawing's base size.
function body(sex: Sex | null, weight: number, height: number): string {
  const bmi = weight / (height / 100) ** 2;
  const w = Math.max(0.72, Math.min(1.9, bmi / 22));
  const belly = Math.max(0, Math.min(1.3, (bmi - 24) / 9));
  const f = sex === 'female';
  const s = Math.max(0.78, Math.min(1.12, height / 175));
  const S = (f ? 25 : 30) * (0.8 + 0.2 * w), C = (f ? 21 : 24) * w, W = (f ? 17 : 21) * w + belly * 9;
  const H = (f ? 26 : 22) * w + belly * 3, limb = 0.85 + 0.5 * (w - 1);
  const X = (dx: number) => (80 + dx).toFixed(1);
  const torso = `M${X(-S)} 60 Q${X(-S - 3)} 66 ${X(-C)} 78 Q${X(-W - 4 * belly)} 112 ${X(-W)} 126 Q${X(-H)} 138 ${X(-H)} 150 L${X(H)} 150 Q${X(H)} 138 ${X(W)} 126 Q${X(W + 4 * belly)} 112 ${X(C)} 78 Q${X(S + 3)} 66 ${X(S)} 60 Q80 52 ${X(-S)} 60Z`;
  const handX = Math.max(S + 6, W + 4 * belly + 9, H + 7);
  const arm = (d: 1 | -1) => `M${X(d * (S - 3))} 64 Q${X(d * (S + 6 + 3 * belly))} 104 ${X(d * handX)} 168`;
  const knee = H * 0.55, foot = 13 + 2 * w;
  const leg = (d: 1 | -1) => `M${X(d * H * 0.5)} 158 Q${X(d * knee)} 222 ${X(d * foot)} 282`;
  const skin = '#f2b48c', shade = '#e39f76';
  return `<svg class="ob-body" viewBox="0 -36 160 336" role="img" aria-label="${height} см, ${weight} кг">
    <ellipse cx="80" cy="292" rx="${(34 * w).toFixed(1)}" ry="5" fill="#e9e9e9"/>
    <g transform="translate(80 292) scale(${s.toFixed(3)}) translate(-80 -292)">
      <path d="${leg(-1)}" stroke="${skin}" stroke-width="${(17 * limb).toFixed(1)}" stroke-linecap="round" fill="none"/>
      <path d="${leg(1)}" stroke="${skin}" stroke-width="${(17 * limb).toFixed(1)}" stroke-linecap="round" fill="none"/>
      <ellipse cx="${X(-foot - 3)}" cy="287" rx="9" ry="4.5" fill="${shade}"/><ellipse cx="${X(foot + 3)}" cy="287" rx="9" ry="4.5" fill="${shade}"/>
      <path d="${arm(-1)}" stroke="${shade}" stroke-width="${(11 * limb).toFixed(1)}" stroke-linecap="round" fill="none"/>
      <path d="${arm(1)}" stroke="${shade}" stroke-width="${(11 * limb).toFixed(1)}" stroke-linecap="round" fill="none"/>
      <circle cx="${X(-handX)}" cy="171" r="${(5.5 * limb).toFixed(1)}" fill="${skin}"/><circle cx="${X(handX)}" cy="171" r="${(5.5 * limb).toFixed(1)}" fill="${skin}"/>
      <rect x="${(80 - 7 * limb).toFixed(1)}" y="40" width="${(14 * limb).toFixed(1)}" height="16" rx="4" fill="${shade}"/>
      <path d="${torso}" fill="${skin}"/>
      ${f ? `<path d="M${X(-C + 1)} 80 Q80 88 ${X(C - 1)} 80 L${X(C - 2)} 96 Q80 102 ${X(-C + 2)} 96Z" fill="#212121"/>`
        : `<path d="M${X(-C * 0.75)} 90 q${(C * 0.35).toFixed(1)} 6 ${(C * 0.7).toFixed(1)} 0 M${X(C * 0.05)} 90 q${(C * 0.35).toFixed(1)} 6 ${(C * 0.7).toFixed(1)} 0" stroke="${shade}" stroke-width="1.6" fill="none"/>`}
      ${belly > 0.05 ? `<ellipse cx="80" cy="${(120 + 4 * belly).toFixed(1)}" rx="${(W * 0.7).toFixed(1)}" ry="${(10 + 9 * belly).toFixed(1)}" fill="${shade}" opacity=".35"/>` : ''}
      <circle cx="80" cy="${(126 + 3 * belly).toFixed(1)}" r="1.4" fill="${shade}"/>
      <path d="M${X(-H - 1)} 146 L${X(H + 1)} 146 L${X(H + 2)} 182 L${X(4)} 182 L80 166 L${X(-4)} 182 L${X(-H - 2)} 182Z" fill="#212121"/>
      <circle cx="80" cy="24" r="16" fill="${skin}"/>
      <ellipse cx="64" cy="26" rx="3" ry="5" fill="${shade}"/><ellipse cx="96" cy="26" rx="3" ry="5" fill="${shade}"/>
      ${f ? '<path d="M62 26c-4-24 40-24 36 0 3 10 2 22-2 30l-4-16c-3-8-6-12-12-14-6 2-10 7-13 14l-4 16c-4-8-4-20-1-30z" fill="#3b2a20"/>'
        : '<path d="M63 22c0-16 34-18 34 0-4-6-10-8-17-8s-13 2-17 8z" fill="#3b2a20"/>'}
    </g>
  </svg>`;
}
const FOR_ALL: Condition[] = ['none', 'stones', 'kidney', 'heart', 'other'];
const FOR_WOMEN: Condition[] = ['pregnant', 'breastfeeding'];
const ACT_ICONS = { low: 'weekend', medium: 'directions_walk', high: 'directions_run' } as const satisfies Record<Activity, string>;

const SLIDES = [
  { title: 'Дусал – таны усны туслах!', text: 'Эрүүл байж, усны зорилтоо биелүүлээрэй. Уусан усаа бүртгэж, сануулга тавьж, амжилтаа нээгээрэй.' },
  { title: 'Ус дутвал бие тань мэдэрнэ', text: 'Биеийн жингийн 1–2%-ийн ус алдахад л ядаргаа, толгой өвдөлт эхэлдэг. Цангах мэдрэмж хоцорч ирдэг.' },
  { title: 'Ухаалаг суурь өөрөө тоолно', text: 'Саваа суурин дээр тавихад уусан усыг тань автоматаар бүртгэнэ. Эмч хязгаар тогтоосон бол тэр хязгаарыг дагана.' },
];

// The phone mockup on the walkthrough: the home gauge, drawn small.
const MOCK = `<svg class="ob-mock" viewBox="0 0 220 300" aria-hidden="true">
  <rect x="6" y="6" width="208" height="320" rx="34" fill="#1f2a37"/><rect x="14" y="14" width="192" height="306" rx="28" fill="#f5f5f5"/>
  <rect x="80" y="20" width="60" height="14" rx="7" fill="#1f2a37"/>
  <text x="110" y="62" text-anchor="middle" font-size="12" font-weight="700" fill="#212121">Нүүр</text>
  <rect x="24" y="76" width="172" height="190" rx="12" fill="#fff"/>
  <path d="M60 210 A62 62 0 1 1 160 210" fill="none" stroke="#eeeeee" stroke-width="12" stroke-linecap="round"/>
  <path d="M60 210 A62 62 0 0 1 150 112" fill="none" stroke="#369fff" stroke-width="12" stroke-linecap="round"/>
  <path d="M110 120c-14 18-22 28-22 40a22 22 0 0 0 44 0c0-12-8-22-22-40z" fill="#f5f5f5"/>
  <path d="M90 162a20 20 0 0 0 40 0c0-4-1-7-2-10-12 4-24 4-38 10z" fill="#197fff"/>
  <text x="110" y="208" text-anchor="middle" font-size="20" font-weight="800" fill="#212121">1650</text>
  <rect x="64" y="228" width="72" height="22" rx="11" fill="#369fff"/><text x="100" y="243" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">Уух (300 мл)</text>
  <circle cx="152" cy="239" r="11" fill="#fff" stroke="#eeeeee"/>
</svg>`;

export function showOnboarding(onDone: (plan: Plan) => void): void {
  const p: Profile = { ...readProfile() };
  const times = readSettings();
  let sex: Sex | null = null;
  let climate: Climate = 'mild';
  let weather = ''; // the line under the climate cards: where the choice came from
  let hUnit: 'cm' | 'ft' = 'cm';
  let wUnit: 'kg' | 'lb' = 'kg';
  let unit: Unit = 'ml';
  let custom: number | null = null; // "Тохируулах" on the result
  let screen: Screen = 'walk';
  let slide = 0;
  let step = 1;
  let name = readMember()?.name ?? '';
  let agreed = false;
  const box = document.createElement('div');
  box.className = 'onb ob';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'onb-title');
  document.body.append(box);

  const finish = (plan: Plan | null) => {
    if (plan) { writeProfile(p); writeSettings(times); about.write({ sex: sex ?? 'none', climate }); }
    markSeen();
    box.remove();
    if (plan) onDone(plan);
  };

  // A scroll-snap wheel of values; the one in the middle band is chosen (read on "continue").
  const wheel = (id: string, values: (string | number)[], current: string | number, unit = '', label: (v: string | number) => string = String) =>
    `<div class="ob-wheel" id="${id}" tabindex="0" role="listbox" aria-label="${unit || 'Сонголт'}">${values.map(v => `<div role="option" class="ob-wheel-item${v === current ? ' on' : ''}" aria-selected="${v === current}" data-v="${v}">${label(v)}${unit ? `<small>${unit}</small>` : ''}</div>`).join('')}</div>`;
  const toggle = (name: string, current: string, opts: [string, string][]) =>
    `<div class="ob-units" role="radiogroup" aria-label="Нэгж">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === current}" class="${v === current ? 'on' : ''}" data-${name}="${v}">${l}</button>`).join('')}</div>`;
  const inches = (cm: number) => Math.round(cm / 2.54);
  const pounds = (kg: number) => Math.round(kg / 0.4536);
  const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const HOURS = range(0, 23).map(h => String(h).padStart(2, '0'));
  const MINS = range(0, 59).map(m => String(m).padStart(2, '0'));
  const timePicker = (id: string, value: string) => {
    const [h, m] = value.split(':');
    return `<div class="ob-time">${wheel(`${id}-h`, HOURS, h)}<b>:</b>${wheel(`${id}-m`, MINS, MINS.includes(m) ? m : '00')}</div>`;
  };

  const stepHead = () => `<div class="ob-step-top">
      <button type="button" class="ob-back" aria-label="Буцах">←</button>
      <div class="ob-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${QUESTIONS}" aria-valuenow="${step}"><span style="width: ${(step / QUESTIONS) * 100}%"></span></div>
      <span class="ob-count">${step} / ${QUESTIONS}</span></div>`;
  const question = (title: string, text: string, body: string) => `${stepHead()}
    <h2 id="onb-title">${title}</h2><p class="ob-lead">${text}</p>${body}`;

  function stepBody(): string {
    switch (step) {
      case 1: return question('Таны хүйс?', 'Дусал таны усны төлөвлөгөөг тохируулна. Өөрийнхөө тухай бага зэрэг хэлээрэй.',
        `<div class="ob-sex">${(['male', 'female'] as const).map(s => `<button type="button" class="ob-sex-opt${sex === s ? ' on' : ''}" data-sex="${s}" aria-pressed="${sex === s}"><span aria-hidden="true">${s === 'male' ? '♂' : '♀'}</span>${s === 'male' ? 'Эрэгтэй' : 'Эмэгтэй'}</button>`).join('')}</div>
        <button type="button" class="ob-sex-skip${sex === 'none' ? ' on' : ''}" data-sex="none" aria-pressed="${sex === 'none'}">Хэлэхгүй</button>`);
      case 2: return question('Таны өндөр?', 'Өндөр нь усны төлөвлөгөөг тань тохируулахад чухал. Өндрөө сонгоно уу.',
        `${toggle('hunit', hUnit, [['cm', 'см'], ['ft', 'фут']])}<div class="ob-pick">${body(sex, p.weight, p.height)}${hUnit === 'cm'
          ? wheel('ob-height', range(90, 230), p.height, 'см')
          : wheel('ob-height', range(36, 90), inches(p.height), '', v => `${Math.floor(Number(v) / 12)}′${Number(v) % 12}″`)}</div>`);
      case 3: return question('Таны жин?', 'Өдрийн усны хэмжээг голчлон биеийн жингээр тооцно. Жингээ сонгоно уу.',
        `${toggle('wunit', wUnit, [['kg', 'кг'], ['lb', 'lb']])}<div class="ob-pick">${body(sex, p.weight, p.height)}${wUnit === 'kg'
          ? wheel('ob-weight', range(10, 250), p.weight, 'кг')
          : wheel('ob-weight', range(22, 550), pounds(p.weight), 'lb')}</div>`);
      case 4: return question('Хэдэн настай вэ?', 'Нас ахих тусам цангах мэдрэмж сулардаг.', wheel('ob-age', range(4, 110), p.age, 'нас'));
      case 5: return question('Хэдэн цагт сэрдэг вэ?', 'Сануулга сэрснээс хойш эхэлнэ.', timePicker('ob-wake', times.wake));
      case 6: return question('Хэдэн цагт унтдаг вэ?', 'Унтахын өмнө сануулга ирэхгүй.', timePicker('ob-sleep', times.sleep));
      case 7: return question('Хөдөлгөөний түвшин?', 'Хөдөлгөөн их байх тусам хөлсөөр их ус алдана.',
        `<div class="ob-cards">${(Object.keys(ACTIVITIES) as Activity[]).map(a => `<button type="button" class="ob-card${p.activity === a ? ' on' : ''}" data-act="${a}" aria-pressed="${p.activity === a}"><span class="ob-card-icon">${mdIcon(ACT_ICONS[a])}</span><b>${ACTIVITIES[a].label}</b><small>${ACTIVITIES[a].hint}</small></button>`).join('')}</div>`);
      case 8: return question('Таны амьдардаг газрын уур амьсгал?', 'Халуунд хөлсөөр илүү их ус алдана. Ихэнх цагаа өнгөрөөдөг газрынхаа уур амьсгалыг сонгоно уу.',
        `<div class="ob-cards">${(Object.keys(CLIMATES) as Climate[]).map(c => `<button type="button" class="ob-climate${climate === c ? ' on' : ''}" data-climate="${c}" aria-pressed="${climate === c}"><svg viewBox="0 0 32 32" aria-hidden="true">${CLIMATES[c].icon}</svg><b>${CLIMATES[c].label}</b>${CLIMATES[c].extra ? `<small>+${CLIMATES[c].extra} мл</small>` : ''}</button>`).join('')}</div>
        ${'geolocation' in navigator ? `<button type="button" class="ob-locate" data-locate><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>Миний байршлын цаг агаараар</button>` : ''}
        <p class="ob-weather" role="status">${weather}</p>`);
      default: {
        const list = sex === 'female' ? [FOR_ALL[0], ...FOR_WOMEN, ...FOR_ALL.slice(1)] : FOR_ALL;
        const limit = p.condition === 'kidney' || p.condition === 'heart';
        return question('Биеийн онцлог?', 'Эмчийн хяналтад байгаа бол заавал сонгоорой.',
          `<div class="ob-cards">${list.map(c => `<button type="button" class="ob-card slim${p.condition === c ? ' on' : ''}" data-cond="${c}" aria-pressed="${p.condition === c}"><b>${CONDITIONS[c]}</b></button>`).join('')}</div>
          ${limit ? `<label class="ob-field">Эмчийн заасан өдрийн дээд хязгаар, мл<input id="ob-limit" type="number" inputmode="numeric" min="500" max="4000" step="50" value="${p.doctorLimit}"/></label>` : ''}
          ${p.condition === 'other' ? `<label class="ob-field">Ямар онош вэ?<input id="ob-note" type="text" maxlength="60" placeholder="Жишээ нь: чихрийн шижин" value="${escape(p.conditionNote)}"/></label>` : ''}`);
      }
    }
  }

  function view(): string {
    if (screen === 'walk') {
      const s = SLIDES[slide];
      return `<div class="ob-walk"><div class="ob-hero">${MOCK}</div>
        <div class="ob-walk-text"><h2 id="onb-title">${s.title}</h2><p>${s.text}</p>
          <ol class="ob-dots" aria-label="${slide + 1} / ${SLIDES.length}">${SLIDES.map((_, i) => `<li class="${i === slide ? 'on' : ''}"></li>`).join('')}</ol></div>
        <div class="ob-actions"><button type="button" class="ob-ghost" data-skip>Алгасах</button><button type="button" class="ob-primary" data-next>Үргэлжлүүлэх</button></div></div>`;
    }
    if (screen === 'signup') {
      return `<div class="ob-form"><button type="button" class="ob-back" aria-label="Буцах">←</button>
        <h2 id="onb-title">Дусалд нэгдээрэй ✨</h2><p class="ob-lead left">Уусан усаа бүртгэж, сануулга тавьж, амжилтаа нээхийн тулд бүртгүүлээрэй.</p>
        <label class="ob-field">Нэр<input id="ob-name" maxlength="24" autocomplete="nickname" placeholder="Жишээ нь: Сараа" value="${escape(name)}"/></label>
        <label class="ob-field">Имэйл<input id="ob-email" type="email" autocomplete="email" placeholder="Имэйл"/></label>
        <label class="ob-field">Нууц үг<input id="ob-pass" type="password" autocomplete="new-password" placeholder="Нууц үг"/></label>
        <label class="ob-check"><input type="checkbox" id="ob-agree" ${agreed ? 'checked' : ''}/> <span>Дусалын <a href="/privacypolicy.html" target="_blank">үйлчилгээний нөхцөл</a>-ийг зөвшөөрч байна.</span></label>
        <p class="ob-or"><span>эсвэл</span></p>
        <button type="button" class="ob-social" data-social>Google-ээр үргэлжлүүлэх</button>
        <button type="button" class="ob-social" data-social>Apple-аар үргэлжлүүлэх</button>
        <p class="ob-demo">Demo: имэйл, нууц үг хаашаа ч илгээгдэхгүй. Нэр зөвхөн энэ утсанд хадгалагдана.</p>
        <p class="ob-error" role="alert" hidden></p>
        <div class="ob-actions single"><button type="button" class="ob-primary" data-signup>Бүртгүүлэх</button></div></div>`;
    }
    if (screen === 'making') {
      return `<div class="ob-making"><h2 id="onb-title">Таны усны төлөвлөгөөг гаргаж байна…</h2><p class="ob-lead">Түр хүлээнэ үү.</p>
        <div class="ob-ring" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" pathLength="100" stroke-dasharray="0 100"/></svg><b>0%</b></div>
        <p class="ob-lead small">Хэсэг хугацаа шаардана. Усаар дүүрэн аялалдаа бэлдээрэй!</p></div>`;
    }
    if (screen === 'ready') {
      const plan = result();
      const u = UNITS[unit];
      const shown = (plan.ml / u.per).toFixed(u.digits);
      return `<div class="ob-ready"><h2 id="onb-title">${plan.mode === 'limit' ? 'Таны өдрийн хязгаар' : 'Таны өдрийн зорилт'}</h2>
        <div class="ob-units wide" role="radiogroup" aria-label="Нэгж">${(Object.keys(UNITS) as Unit[]).map(k => `<button type="button" role="radio" aria-checked="${k === unit}" class="${k === unit ? 'on' : ''}" data-unit="${k}">${UNITS[k].label}</button>`).join('')}</div>
        <span class="ob-glass" aria-hidden="true"><svg viewBox="0 0 48 64"><path d="M6 4h36l-4 56H10z" fill="#e3f0fd"/><path d="M8.6 22h30.8l-2.8 38H11.4z" fill="#369fff"/><circle cx="20" cy="40" r="2" fill="#fff"/><circle cx="28" cy="50" r="1.6" fill="#fff"/></svg></span>
        <p class="ob-result">${unit === 'ml' ? number(plan.ml) : shown}<span>${u.label}</span></p>
        ${plan.mode === 'limit' ? '' : '<button type="button" class="ob-adjust" data-adjust>✎ Тохируулах</button>'}
        <p class="ob-lead small">${escape(plan.how)}</p>
        ${p.condition === 'other' ? `<p class="ob-warn">${p.conditionNote ? `«${escape(p.conditionNote)}»-д` : 'Таны оношид'} тохирох хэмжээг эмчээсээ асуугаарай.</p>` : ''}
        <p class="ob-demo">Ерөнхий зөвлөмж. Эмчийн заавар байвал түүнийг дагана.</p>
        <div class="ob-actions single"><button type="button" class="ob-primary" data-done>Эхэлье!</button></div></div>`;
    }
    return `<div class="ob-step">${stepBody()}<div class="ob-actions single"><button type="button" class="ob-primary" data-continue>Үргэлжлүүлэх</button></div></div>`;
  }

  // calcPlan, plus a hot climate; "Тохируулах" overrides the amount (a doctor's limit stays as it is).
  function result(): Plan {
    const plan = calcPlan(p);
    if (plan.mode === 'limit') return plan;
    if (custom) return { ...plan, ml: custom, how: 'Өөрөө тохируулсан' };
    const extra = CLIMATES[climate].extra;
    return extra ? { ...plan, ml: plan.ml + extra, how: `${plan.how} + ${extra} мл (халуун уур амьсгал)` } : plan;
  }

  // "Generating…" (kit 18): the ring counts up to 100%, then the result.
  function making(): void {
    const ring = box.querySelector<HTMLElement>('.ob-ring')!;
    const start = performance.now();
    const tick = (now: number) => {
      if (!ring.isConnected) return;
      const pct = Math.min(100, Math.round(((now - start) / 2200) * 100));
      ring.querySelector('.fg')!.setAttribute('stroke-dasharray', `${pct} 100`);
      ring.querySelector('b')!.textContent = `${pct}%`;
      ring.setAttribute('aria-valuenow', String(pct));
      if (pct < 100) requestAnimationFrame(tick);
      else setTimeout(() => { screen = 'ready'; draw(); }, 250);
    };
    requestAnimationFrame(tick);
  }

  async function locate(): Promise<void> {
    weather = 'Цаг агаарыг шалгаж байна…';
    const line = box.querySelector('.ob-weather');
    if (line) line.textContent = weather;
    try {
      const got = await fetchWeather();
      climate = climateOf(got.feels);
      weather = `Өнөөдөр таны байршилд ${got.feels}°C мэт мэдрэгдэнэ → «${CLIMATES[climate].label}». Цаашид нүүр хуудас өдөр бүр шалгана.`;
    } catch (err) {
      weather = (err as GeolocationPositionError)?.code === 1 ? 'Байршлын зөвшөөрөл өгөөгүй. Гараар сонгоно уу.' : 'Цаг агаарыг авч чадсангүй. Гараар сонгоно уу.';
    }
    if (screen === 'step' && step === 8) draw();
  }

  function draw(): void {
    box.innerHTML = `<div class="ob-screen">${view()}</div>`;
    bind();
    box.querySelectorAll<HTMLElement>('.ob-wheel').forEach(centerWheel);
    box.querySelector<HTMLElement>('#ob-name, .ob-primary')?.focus();
  }

  // Wheels: scroll the chosen value into the middle, and mark whichever value sits there.
  const ITEM = 52;
  function centerWheel(w: HTMLElement): void {
    const items = [...w.querySelectorAll<HTMLElement>('.ob-wheel-item')];
    const on = Math.max(0, items.findIndex(i => i.classList.contains('on')));
    w.scrollTop = on * ITEM;
    let t: ReturnType<typeof setTimeout>;
    w.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const idx = Math.max(0, Math.min(items.length - 1, Math.round(w.scrollTop / ITEM)));
        items.forEach((it, i) => { it.classList.toggle('on', i === idx); it.setAttribute('aria-selected', String(i === idx)); });
      }, 80);
      // The figure follows the value under the band while the wheel is still moving.
      if (w.id === 'ob-height' || w.id === 'ob-weight') {
        const v = items[Math.max(0, Math.min(items.length - 1, Math.round(w.scrollTop / ITEM)))].dataset.v!;
        redrawBody(w.id === 'ob-height' ? { height: hUnit === 'cm' ? Number(v) : Math.round(Number(v) * 2.54) } : { weight: wUnit === 'kg' ? Number(v) : Math.round(Number(v) * 0.4536) });
      }
    }, { passive: true });
    w.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      w.scrollBy({ top: e.key === 'ArrowUp' ? -ITEM : ITEM });
    });
  }
  let bodyFrame = 0;
  function redrawBody(change: { height?: number; weight?: number }): void {
    cancelAnimationFrame(bodyFrame);
    bodyFrame = requestAnimationFrame(() => {
      const fig = box.querySelector('.ob-body');
      if (fig) fig.outerHTML = body(sex, change.weight ?? p.weight, change.height ?? p.height);
    });
  }
  const picked = (id: string) => box.querySelector<HTMLElement>(`#${id} .ob-wheel-item.on`)?.dataset.v;

  const readStep = () => {
    const h = picked('ob-height'), w = picked('ob-weight');
    if (step === 2 && h) p.height = hUnit === 'cm' ? Number(h) : Math.round(Number(h) * 2.54);
    if (step === 3 && w) p.weight = wUnit === 'kg' ? Number(w) : Math.round(Number(w) * 0.4536);
    if (step === 4) p.age = Number(picked('ob-age') ?? p.age);
    if (step === 5) times.wake = `${picked('ob-wake-h') ?? '07'}:${picked('ob-wake-m') ?? '00'}`;
    if (step === 6) times.sleep = `${picked('ob-sleep-h') ?? '22'}:${picked('ob-sleep-m') ?? '00'}`;
    const limit = box.querySelector<HTMLInputElement>('#ob-limit');
    if (limit) { const v = Math.round(Number(limit.value) / 50) * 50; if (v >= 500 && v <= 4000) p.doctorLimit = v; }
    const note = box.querySelector<HTMLInputElement>('#ob-note');
    if (note) p.conditionNote = note.value.trim().slice(0, 60);
  };

  function bind(): void {
    const on = (sel: string, fn: (el: HTMLElement) => void) => box.querySelectorAll<HTMLElement>(sel).forEach(el => el.addEventListener('click', () => fn(el)));
    on('[data-skip]', () => { screen = 'signup'; draw(); });
    on('[data-next]', () => { if (slide < SLIDES.length - 1) slide += 1; else screen = 'signup'; draw(); });
    on('.ob-back', () => {
      if (screen === 'signup') screen = 'walk';
      else if (screen === 'step') { readStep(); if (step > 1) step -= 1; else screen = 'signup'; }
      draw();
    });
    on('[data-social]', () => { box.querySelector<HTMLInputElement>('#ob-agree')!.checked = true; });
    on('[data-signup]', () => {
      name = box.querySelector<HTMLInputElement>('#ob-name')!.value;
      agreed = box.querySelector<HTMLInputElement>('#ob-agree')!.checked;
      const error = box.querySelector<HTMLElement>('.ob-error')!;
      if (!name.trim()) { error.textContent = 'Нэрээ бичнэ үү.'; error.hidden = false; return; }
      if (!agreed) { error.textContent = 'Үйлчилгээний нөхцөлийг зөвшөөрнө үү.'; error.hidden = false; return; }
      saveMember(name);
      screen = 'step'; step = 1; draw();
    });
    on('[data-sex]', el => { sex = el.dataset.sex as Sex; if (sex !== 'female' && FOR_WOMEN.includes(p.condition)) p.condition = 'none'; draw(); });
    on('[data-hunit]', el => { readStep(); hUnit = el.dataset.hunit as 'cm' | 'ft'; draw(); });
    on('[data-wunit]', el => { readStep(); wUnit = el.dataset.wunit as 'kg' | 'lb'; draw(); });
    on('[data-climate]', el => { climate = el.dataset.climate as Climate; weather = ''; draw(); });
    on('[data-locate]', () => void locate());
    on('[data-unit]', el => { unit = el.dataset.unit as Unit; draw(); });
    on('[data-adjust]', () => openAmountSheet('Өдрийн зорилт', '💧', result().ml, ml => { custom = Math.max(500, Math.min(5000, Math.round(ml / 50) * 50)); draw(); }));
    on('[data-act]', el => { p.activity = el.dataset.act as Activity; draw(); });
    on('[data-cond]', el => { readStep(); p.condition = el.dataset.cond as Condition; draw(); });
    on('[data-continue]', () => {
      readStep();
      if (step < QUESTIONS) {
        step += 1; draw();
        // Already allowed once: fill the climate in without asking again.
        if (step === 8 && !weather) void navigator.permissions?.query({ name: 'geolocation' }).then(r => { if (r.state === 'granted') void locate(); }).catch(() => {});
        return;
      }
      screen = 'making'; draw(); making();
    });
    on('[data-done]', () => finish(result()));
  }

  draw();
}
