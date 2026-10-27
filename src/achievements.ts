import './style.css';
import './shell.css';
import './pwa';
import { defaults, type AppState } from './data';
import { escape, number } from './format';
import { siteNav } from './nav';
import { load, onExternalChange } from './storage';
import { KINDS, STAGES, petState, petSvg, readPetKind, readPetName, takeNewKinds, unlockedKinds, writePetKind, writePetName, type Kind } from './pet';
import './theme.css';

// "Амжилт" page, Hydrify layout (demo): the pet «Дусалхан» (pet.ts) on a blue header, grown by days that
// counted (the goal reached, or under a doctor's limit, the limit kept), then the animals to pick from.

const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();

// The stage name, and a bar for the days left until the next one.
function stageLine(days: number): string {
  const at = STAGES.filter(s => days >= s.from).length - 1;
  const cur = STAGES[at], next = STAGES[at + 1];
  if (!next) return `<div class="pet-stage"><p><b>${cur.name} шат</b><span>Хамгийн дээд шат</span></p><div class="pet-bar"><span style="width:100%"></span></div></div>`;
  const span = next.from - cur.from, got = days - cur.from;
  return `<div class="pet-stage"><p><b>${cur.name} шат</b><span>${next.name} шат хүртэл ${number(next.from - days)} өдөр</span></p>
    <div class="pet-bar" role="progressbar" aria-label="${next.name} шат хүртэл" aria-valuemin="0" aria-valuemax="${span}" aria-valuenow="${got}"><span style="width:${Math.round((got / span) * 100)}%"></span></div></div>`;
}

// Animals unlocked since the last visit; kept for this whole visit so the «Шинэ!» doesn't vanish on a redraw.
let fresh: Set<Kind> | null = null;

// Every animal: unlocked ones can be picked, locked ones show the streak they need.
function kindList(best: number, picked: Kind): string {
  const open = unlockedKinds(best);
  const sample = { stage: 'big' as const, mood: 'good' as const, streak: 0, best, days: 30, nextStageIn: null, line: '' };
  return `<section class="hx-card pet-kinds" aria-labelledby="pet-kinds-title">
    <h2 id="pet-kinds-title">Амьтад <small>Хамгийн урт streak: ${number(best)} өдөр</small></h2>
    <div class="pet-kind-grid" role="radiogroup" aria-labelledby="pet-kinds-title">${KINDS.map(k => {
      const got = open.includes(k.id), on = k.id === picked;
      return `<button type="button" class="pet-kind${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-kind="${k.id}" ${got ? '' : 'disabled'}>
        ${petSvg(sample, k.name, `kind-${k.id}`, k.id, true)}<b>${k.name}</b>
        <small>${on ? 'Сонгосон' : got ? 'Сонгох' : `${lockIcon()}${k.need} өдөр дараалан`}</small>
        ${fresh?.has(k.id) ? '<span class="pet-new">Шинэ!</span>' : ''}</button>`;
    }).join('')}</div></section>`;
}
const lockIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

function render(): void {
  const name = readPetName();
  const pet = petState(state.events, state.goal, state.mode, new Date(), name);
  fresh ??= new Set(takeNewKinds(pet.best));
  const kind = readPetKind(pet.best);
  const nextKind = KINDS.find(k => k.need > pet.best);
  const news = KINDS.filter(k => fresh!.has(k.id)).map(k => k.name);
  const done = pet.days;
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app" tabindex="-1"><div class="app-shell">
      <header class="app-top">${siteNav('achievements')}</header>
      <div class="ach-top">
        <div class="hx-header ach-header"><span class="hx-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.5C8 8 5 11.6 5 15.5a7 7 0 0 0 14 0c0-3.9-3-7.5-7-13z" fill="none" stroke="currentColor" stroke-width="2"/></svg></span><h1>Амжилт</h1><span></span></div>
        <button type="button" class="pet-tap" id="pet-tap">${petSvg(pet, name, 'pet-big', kind)}</button>
        <button type="button" class="pet-name" id="pet-name" aria-label="Нэр солих: ${escape(name)}">${escape(name)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
        <span class="pet-streak${pet.streak ? ' hot' : ''}"><span aria-hidden="true">🔥</span>${number(pet.streak)} өдрийн streak</span>
        <p class="pet-line" id="pet-line">${escape(pet.line)}</p>
        ${stageLine(done)}
        ${news.length ? `<p class="pet-unlock" role="status">🎉 ${news.join(', ')} нээгдлээ! Доороос сонгоорой.</p>`
          : nextKind ? `<p class="ach-sub">${nextKind.name} нээгдэхэд ${number(nextKind.need - pet.streak)} өдөр дараалан хэрэгтэй</p>` : ''}
        ${done ? `<p class="ach-sub">${number(done)} өдөр биелүүлсэн</p>` : ''}
      </div>
      <div class="hydro hx-page ach-body">
        ${kindList(pet.best, kind)}
      </div>
    </div></main>`;
  bindPet();
}

// A tap makes the pet hop with a heart; the name turns into a field (Enter or leaving it saves, Esc cancels).
function bindPet(): void {
  const tap = document.querySelector<HTMLButtonElement>('#pet-tap')!;
  tap.addEventListener('click', () => {
    tap.classList.remove('hop');
    void tap.offsetWidth;  // restart the hop on quick taps
    tap.classList.add('hop');
    const heart = document.createElement('span');
    heart.className = 'pet-heart';
    heart.setAttribute('aria-hidden', 'true');
    heart.textContent = '❤';
    const box = tap.getBoundingClientRect();
    heart.style.left = `${box.left + box.width * (0.38 + Math.random() * 0.2)}px`;
    heart.style.top = `${box.top + box.height * 0.28}px`;
    document.body.append(heart);
    setTimeout(() => heart.remove(), 1000);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.kind as Kind;
    writePetKind(kind);
    fresh?.delete(kind);
    render();
    document.querySelector<HTMLButtonElement>(`[data-kind="${kind}"]`)?.focus();
  }));
  const nameButton = document.querySelector<HTMLButtonElement>('#pet-name')!;
  nameButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'pet-name-input';
    input.maxLength = 20;
    input.value = readPetName();
    input.setAttribute('aria-label', 'Амьтны нэр');
    nameButton.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      if (keep) writePetName(input.value);
      render();
      document.querySelector<HTMLButtonElement>('#pet-name')?.focus();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  });
}

async function reload(): Promise<void> { state = (await load()).state; render(); }
onExternalChange(() => void reload());
void reload();
