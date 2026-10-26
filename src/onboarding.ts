import './onboarding.css';
import { escape, number } from './format';
import { mdIcon } from './components/Icon';
import { AVATARS, avatarSvg, readAvatar, writeAvatar, type AvatarId } from './avatars';
import { cleanName, readMember, saveMember } from './member';
import { ACTIVITIES, CONDITIONS, PROFILE_KEY, calcPlan, readProfile, writeProfile, type Activity, type Condition, type Plan, type Profile } from './plan';

// First visit: why water matters (the buddy dry next to the buddy full), then a few one-question
// screens (sex, age, weight and height, activity, condition), then the daily amount from calcPlan,
// then a name and buddy for the family leaderboard (src/member.ts). Sex only decides whether pregnancy options show.
const SEEN_KEY = 'dusal-onboarded-v1';

export function needsOnboarding(): boolean {
  try { return !localStorage.getItem(SEEN_KEY) && !localStorage.getItem(PROFILE_KEY); } catch { return false; }
}

const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: ask again next time */ } };

type Sex = 'male' | 'female';
// «Бусад» last: anything not listed, named in a short text the AI then takes into account.
const FOR_ALL: Condition[] = ['none', 'stones', 'kidney', 'heart', 'other'];
const FOR_WOMEN: Condition[] = ['pregnant', 'breastfeeding'];
const STEPS = 9;
// What a little too little water does, kept short and calm: a nudge, not a scare.
const DRY_EFFECTS = ['Толгой өвдөх, ядрах', 'Анхаарал суларах', 'Арьс хуурайших, өтгөн хатах', 'Удаан хугацаанд бөөрний чулууны эрсдэл'];
const ACTIVITY_ICONS: Record<Activity, string> = { low: mdIcon('weekend'), medium: mdIcon('directions_walk'), high: mdIcon('directions_run') };

export function showOnboarding(onDone: (plan: Plan) => void): void {
  const p: Profile = { ...readProfile() };
  let sex: Sex | null = null;
  let step = 0;
  // The last step: what the family sees. Kept while the user moves back and forth.
  let name = readMember()?.name ?? '';
  let avatar: AvatarId = readAvatar();
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
      case 1: {
        const id = readAvatar(), h = AVATARS[id].waterH;
        return `<h2 id="onb-title">Ус уухгүй бол юу болох вэ?</h2>
        <div class="onb-why">
          <figure class="onb-dry">${avatarSvg(id, 'sad', h * 0.92, false, 'onb-dry')}<figcaption>Ус дутвал</figcaption></figure>
          <figure class="onb-full">${avatarSvg(id, 'beam', h * 0.08, true, 'onb-full')}<figcaption>Хангалттай бол</figcaption></figure>
        </div>
        <ul class="onb-effects" aria-label="Ус дутахад">${DRY_EFFECTS.map((t, i) => `<li style="--i: ${i}">${t}</li>`).join('')}</ul>
        <p class="onb-fact">Биеийн жингийн 1–2%-ийн ус алдахад л ядаргаа, толгой өвдөлт мэдрэгдэж эхэлдэг. Цангах мэдрэмж хоцорч ирдэг.</p>
        <p class="onb-cheer">Өдөрт хэдэн аяга ус л хангалттай. Хамтдаа зуршил болгоё!</p>
        <p class="onb-note">Эмч хязгаар тогтоосон бол тэр хязгаарыг дагана.</p>
        <button type="button" class="onb-next" data-go="2">Үргэлжлүүлэх</button>`;
      }
      case 2: return `<h2 id="onb-title">Таны хүйс?</h2><div class="onb-choices">
        <button type="button" class="onb-choice" data-sex="male"><span aria-hidden="true">${mdIcon('man')}</span>Эрэгтэй</button>
        <button type="button" class="onb-choice" data-sex="female"><span aria-hidden="true">${mdIcon('woman')}</span>Эмэгтэй</button></div>`;
      case 3: return `<h2 id="onb-title">Хэдэн настай вэ?</h2>${stepper('onb-age', p.age, 'нас', 4, 110)}
        <button type="button" class="onb-next" data-go="4">Үргэлжлүүлэх</button>`;
      case 4: return `<h2 id="onb-title">Жин, өндөр?</h2>${stepper('onb-weight', p.weight, 'кг', 10, 250)}${stepper('onb-height', p.height, 'см', 90, 230)}
        <button type="button" class="onb-next" data-go="5">Үргэлжлүүлэх</button>`;
      case 5: return `<h2 id="onb-title">Биеийн хөдөлгөөн хийдэг үү?</h2><div class="onb-list">${(Object.keys(ACTIVITIES) as Activity[]).map(a =>
        `<button type="button" class="onb-choice wide act" data-act="${a}"><span aria-hidden="true">${ACTIVITY_ICONS[a]}</span><b>${ACTIVITIES[a].label}</b><small>${ACTIVITIES[a].hint}</small></button>`).join('')}</div>`;
      case 6: {
        const list = sex === 'female' ? [...FOR_ALL.slice(0, 1), ...FOR_WOMEN, ...FOR_ALL.slice(1)] : FOR_ALL;
        const limit = p.condition === 'kidney' || p.condition === 'heart';
        return `<h2 id="onb-title">Биеийн онцлог?</h2><p>Эмчийн хяналтад байгаа бол заавал сонгоорой.</p>
          <div class="onb-list">${list.map(c => `<button type="button" class="onb-choice wide${p.condition === c ? ' on' : ''}" data-cond="${c}" aria-pressed="${p.condition === c}">${CONDITIONS[c]}</button>`).join('')}</div>
          ${limit ? `<p class="onb-note">Эмчийн заасан өдрийн <b>дээд хязгаар</b>:</p>${stepper('onb-limit', p.doctorLimit, 'мл', 500, 4000)}` : ''}
          ${p.condition === 'other' ? `<label class="onb-field">Ямар онош вэ?<input id="onb-condition-note" type="text" maxlength="60" placeholder="Жишээ нь: чихрийн шижин" value="${escape(p.conditionNote)}"/></label>` : ''}
          <button type="button" class="onb-next" data-go="7">Тооцоолох</button>`;
      }
      case 8: return `<h2 id="onb-title">Таныг хэн гэж дуудах вэ?</h2>
        <p>Гэр бүлийн жагсаалтад ингэж харагдана. Суурийн QR уншуулахад гэр бүлдээ нэгдэнэ.</p>
        <label class="onb-field">Нэр<input id="onb-name" type="text" maxlength="24" autocomplete="nickname" placeholder="Жишээ нь: Сараа" value="${escape(name)}"/></label>
        <div class="avatar-grid onb-avatars" role="radiogroup" aria-label="Дүрээ сонго">${(Object.keys(AVATARS) as AvatarId[]).map(id =>
          `<button type="button" class="avatar-opt${id === avatar ? ' on' : ''}" role="radio" aria-checked="${id === avatar}" data-avatar="${id}">
            ${avatarSvg(id, 'happy', AVATARS[id].waterH * 0.45, false, `onb-av-${id}`)}<span>${AVATARS[id].name}</span></button>`).join('')}</div>
        <p class="onb-error" role="alert" hidden>Нэрээ бичнэ үү.</p>
        <button type="button" class="onb-next" data-join>Бүртгүүлэх</button>
        <button type="button" class="onb-later" data-done>Дараа нь</button>`;
      default: {
        const plan = calcPlan(p);
        return `<p class="onb-big" aria-hidden="true">${mdIcon(plan.mode === 'limit' ? 'stethoscope' : 'target')}</p>
          <h2 id="onb-title">${plan.mode === 'limit' ? 'Таны өдрийн хязгаар' : 'Таны өдрийн зорилт'}</h2>
          <p class="onb-result">${number(plan.ml)} <span>мл</span></p><p class="onb-how">${plan.how}</p>
          ${p.condition === 'other' ? `<p class="onb-warn">${p.conditionNote ? `«${escape(p.conditionNote)}»-д` : 'Таны оношид'} тохирох хэмжээг эмчээсээ асуугаарай. Нүүр хуудсанд AI зөвлөгөө авч болно.</p>` : ''}
          <p class="onb-note">Ерөнхий зөвлөмж. Эмчийн заавар байвал түүнийг дагана. Хүссэн үедээ өөрчилж болно.</p>
          <button type="button" class="onb-next" data-go="8">Үргэлжлүүлэх</button>`;
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
    box.querySelector<HTMLElement>(step === 8 ? '#onb-name' : '.onb-next, .onb-choice')?.focus();
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
    if (get('onb-condition-note')) p.conditionNote = get('onb-condition-note')!.value.trim().slice(0, 60);
    if (get('onb-name')) name = get('onb-name')!.value;
    if (get('onb-limit')) p.doctorLimit = Math.round(val('onb-limit', 500, 4000, p.doctorLimit) / 50) * 50;
  };

  function bind(): void {
    // On the last step the daily amount is already settled; skipping only skips the name.
    box.querySelector('.onb-skip')!.addEventListener('click', () => finish(step === 8 ? calcPlan(p) : null));
    box.querySelector('.onb-back')?.addEventListener('click', () => { readInputs(); step -= 1; draw(); });
    box.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(b => b.addEventListener('click', () => { readInputs(); step = Number(b.dataset.go); draw(); }));
    box.querySelectorAll<HTMLButtonElement>('[data-sex]').forEach(b => b.addEventListener('click', () => {
      sex = b.dataset.sex as Sex;
      if (sex === 'male' && FOR_WOMEN.includes(p.condition)) p.condition = 'none';
      step = 3; draw();
    }));
    box.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(b => b.addEventListener('click', () => { p.activity = b.dataset.act as Activity; step = 6; draw(); }));
    box.querySelectorAll<HTMLButtonElement>('[data-cond]').forEach(b => b.addEventListener('click', () => { readInputs(); p.condition = b.dataset.cond as Condition; draw(); }));
    box.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => b.addEventListener('click', () => {
      const input = box.querySelector<HTMLInputElement>(`#${b.dataset.step}`)!;
      const by = input.id === 'onb-limit' ? 50 : 1;
      input.value = String(Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value) + Number(b.dataset.d) * by)));
    }));
    box.querySelectorAll<HTMLButtonElement>('[data-avatar]').forEach(b => b.addEventListener('click', () => { readInputs(); avatar = b.dataset.avatar as AvatarId; draw(); }));
    box.querySelector('[data-join]')?.addEventListener('click', () => {
      readInputs();
      if (!cleanName(name) || !saveMember(name)) {
        box.querySelector<HTMLElement>('.onb-error')!.hidden = false;
        box.querySelector<HTMLElement>('#onb-name')!.focus();
        return;
      }
      writeAvatar(avatar);
      finish(calcPlan(p));
    });
    box.querySelector('[data-done]')?.addEventListener('click', () => { readInputs(); finish(calcPlan(p)); });
  }

  draw();
}
