import './onboarding.css';
import { number } from './format';
import { mdIcon } from './components/Icon';
import { ACTIVITIES, CONDITIONS, PROFILE_KEY, calcPlan, readProfile, writeProfile, type Activity, type Condition, type Plan, type Profile } from './plan';

// First visit: a few one-question screens (sex, age, weight and height, activity, condition),
// then the daily amount from calcPlan. Sex only decides whether pregnancy options show.
const SEEN_KEY = 'dusal-onboarded-v1';

export function needsOnboarding(): boolean {
  try { return !localStorage.getItem(SEEN_KEY) && !localStorage.getItem(PROFILE_KEY); } catch { return false; }
}

const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: ask again next time */ } };

type Sex = 'male' | 'female';
const FOR_ALL: Condition[] = ['none', 'stones', 'kidney', 'heart'];
const FOR_WOMEN: Condition[] = ['pregnant', 'breastfeeding'];
const STEPS = 7;
const ACTIVITY_ICONS: Record<Activity, string> = { low: mdIcon('weekend'), medium: mdIcon('directions_walk'), high: mdIcon('directions_run') };

export function showOnboarding(onDone: (plan: Plan) => void): void {
  const p: Profile = { ...readProfile() };
  let sex: Sex | null = null;
  let step = 0;
  const box = document.createElement('div');
  box.className = 'onb';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'onb-title');
  document.body.append(box);

  const finish = (plan: Plan | null) => {
    if (plan) writeProfile(p);
    markSeen();
    box.remove();
    if (plan) onDone(plan);
  };
  const stepper = (id: string, value: number, unit: string, min: number, max: number) =>
    `<div class="onb-stepper"><button type="button" data-step="${id}" data-d="-1" aria-label="Хасах">−</button>
      <label><input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${value}"/><span>${unit}</span></label>
      <button type="button" data-step="${id}" data-d="1" aria-label="Нэмэх">+</button></div>`;

  function screen(): string {
    switch (step) {
      case 0: return `<p class="onb-big" aria-hidden="true">${mdIcon('water_drop')}</p><h2 id="onb-title">Сайн байна уу!</h2>
        <p>Танд өдөрт хэдэн мл ус хэрэгтэйг <b>5 асуултаар</b> тооцоолъё.</p>
        <button type="button" class="onb-next" data-go="1">Эхлэх</button>`;
      case 1: return `<h2 id="onb-title">Таны хүйс?</h2><div class="onb-choices">
        <button type="button" class="onb-choice" data-sex="male"><span aria-hidden="true">${mdIcon('man')}</span>Эрэгтэй</button>
        <button type="button" class="onb-choice" data-sex="female"><span aria-hidden="true">${mdIcon('woman')}</span>Эмэгтэй</button></div>`;
      case 2: return `<h2 id="onb-title">Хэдэн настай вэ?</h2>${stepper('onb-age', p.age, 'нас', 4, 110)}
        <button type="button" class="onb-next" data-go="3">Үргэлжлүүлэх</button>`;
      case 3: return `<h2 id="onb-title">Жин, өндөр?</h2>${stepper('onb-weight', p.weight, 'кг', 10, 250)}${stepper('onb-height', p.height, 'см', 90, 230)}
        <button type="button" class="onb-next" data-go="4">Үргэлжлүүлэх</button>`;
      case 4: return `<h2 id="onb-title">Биеийн хөдөлгөөн хийдэг үү?</h2><div class="onb-list">${(Object.keys(ACTIVITIES) as Activity[]).map(a =>
        `<button type="button" class="onb-choice wide act" data-act="${a}"><span aria-hidden="true">${ACTIVITY_ICONS[a]}</span><b>${ACTIVITIES[a].label}</b><small>${ACTIVITIES[a].hint}</small></button>`).join('')}</div>`;
      case 5: {
        const list = sex === 'female' ? [...FOR_ALL.slice(0, 1), ...FOR_WOMEN, ...FOR_ALL.slice(1)] : FOR_ALL;
        const limit = p.condition === 'kidney' || p.condition === 'heart';
        return `<h2 id="onb-title">Биеийн онцлог?</h2><p>Эмчийн хяналтад байгаа бол заавал сонгоорой.</p>
          <div class="onb-list">${list.map(c => `<button type="button" class="onb-choice wide${p.condition === c ? ' on' : ''}" data-cond="${c}" aria-pressed="${p.condition === c}">${CONDITIONS[c]}</button>`).join('')}</div>
          ${limit ? `<p class="onb-note">Эмчийн заасан өдрийн <b>дээд хязгаар</b>:</p>${stepper('onb-limit', p.doctorLimit, 'мл', 500, 4000)}` : ''}
          <button type="button" class="onb-next" data-go="6">Тооцоолох</button>`;
      }
      default: {
        const plan = calcPlan(p);
        return `<p class="onb-big" aria-hidden="true">${mdIcon(plan.mode === 'limit' ? 'stethoscope' : 'target')}</p>
          <h2 id="onb-title">${plan.mode === 'limit' ? 'Таны өдрийн хязгаар' : 'Таны өдрийн зорилт'}</h2>
          <p class="onb-result">${number(plan.ml)} <span>мл</span></p><p class="onb-how">${plan.how}</p>
          <p class="onb-note">Ерөнхий зөвлөмж. Эмчийн заавар байвал түүнийг дагана. Хүссэн үедээ өөрчилж болно.</p>
          <button type="button" class="onb-next" data-done>Эхэлье</button>`;
      }
    }
  }

  function draw(): void {
    box.innerHTML = `<div class="onb-card">
      <div class="onb-top">${step > 0 ? '<button type="button" class="onb-back" aria-label="Буцах">←</button>' : '<span></span>'}
        <ol class="onb-dots" aria-label="Алхам ${step + 1} / ${STEPS}">${Array.from({ length: STEPS }, (_, i) => `<li class="${i <= step ? 'on' : ''}"></li>`).join('')}</ol>
        <button type="button" class="onb-skip">Алгасах</button></div>
      <div class="onb-body">${screen()}</div></div>`;
    bind();
    box.querySelector<HTMLElement>('.onb-next, .onb-choice')?.focus();
  }

  const readInputs = () => {
    const get = (id: string) => box.querySelector<HTMLInputElement>(`#${id}`);
    const val = (id: string, lo: number, hi: number, fallback: number) => {
      const n = Math.round(Number(get(id)?.value));
      return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
    };
    if (get('onb-age')) p.age = val('onb-age', 4, 110, p.age);
    if (get('onb-weight')) p.weight = val('onb-weight', 10, 250, p.weight);
    if (get('onb-height')) p.height = val('onb-height', 90, 230, p.height);
    if (get('onb-limit')) p.doctorLimit = Math.round(val('onb-limit', 500, 4000, p.doctorLimit) / 50) * 50;
  };

  function bind(): void {
    box.querySelector('.onb-skip')!.addEventListener('click', () => finish(null));
    box.querySelector('.onb-back')?.addEventListener('click', () => { readInputs(); step -= 1; draw(); });
    box.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(b => b.addEventListener('click', () => { readInputs(); step = Number(b.dataset.go); draw(); }));
    box.querySelectorAll<HTMLButtonElement>('[data-sex]').forEach(b => b.addEventListener('click', () => {
      sex = b.dataset.sex as Sex;
      if (sex === 'male' && FOR_WOMEN.includes(p.condition)) p.condition = 'none';
      step = 2; draw();
    }));
    box.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(b => b.addEventListener('click', () => { p.activity = b.dataset.act as Activity; step = 5; draw(); }));
    box.querySelectorAll<HTMLButtonElement>('[data-cond]').forEach(b => b.addEventListener('click', () => { readInputs(); p.condition = b.dataset.cond as Condition; draw(); }));
    box.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => b.addEventListener('click', () => {
      const input = box.querySelector<HTMLInputElement>(`#${b.dataset.step}`)!;
      const by = input.id === 'onb-limit' ? 50 : 1;
      input.value = String(Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value) + Number(b.dataset.d) * by)));
    }));
    box.querySelector('[data-done]')?.addEventListener('click', () => { readInputs(); finish(calcPlan(p)); });
  }

  draw();
}
