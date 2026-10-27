import './style.css';
import './shell.css';
import './pwa';
import { defaults, type AppState } from './data';
import { escape, number } from './format';
import { siteNav } from './nav';
import { load, onExternalChange } from './storage';
import { STAGES, petState, petSvg, readPetName, writePetName } from './pet';
import './theme.css';

// "Амжилт" page, Hydrify layout (demo): levels earned by days that counted (the goal reached, or
// under a doctor's limit, the limit kept). The pet «Дусалхан» (pet.ts) on a blue header, then all fifteen levels.
const LEVELS = [1, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 200, 250, 300];

const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();

// A winged hexagon with the level number on a ribbon; grey with a lock when not reached yet.
function badge(level: number, locked: boolean): string {
  if (locked) return `<svg class="ach-badge locked" viewBox="0 0 120 110" aria-hidden="true"><circle cx="60" cy="50" r="34" fill="#eeeeee"/><path d="M38 78l-10 24 16-6 8 10 8-22M82 78l10 24-16-6-8 10-8-22" fill="#eeeeee"/><rect x="50" y="46" width="20" height="16" rx="3" fill="#bdbdbd"/><path d="M54 46v-5a6 6 0 0 1 12 0v5" fill="none" stroke="#bdbdbd" stroke-width="3"/></svg>`;
  const id = `g${level}`;
  return `<svg class="ach-badge" viewBox="0 0 120 110" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa6c9"/><stop offset="1" stop-color="#5a6690"/></linearGradient></defs>
    <path d="M22 40c-14 4-20 16-18 26 8-6 14-6 20-4zM98 40c14 4 20 16 18 26-8-6-14-6-20-4z" fill="#7b86ad"/>
    <path d="M60 6l34 19v40L60 84 26 65V25z" fill="url(#${id})" stroke="#c9d1ec" stroke-width="3"/>
    <text x="60" y="56" text-anchor="middle" font-size="34" font-weight="800" fill="#fff">${level}</text>
    <path d="M18 66h84l-6 9 6 9H18l6-9z" fill="#1f8bff"/>
    <text x="60" y="79" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" letter-spacing="1">ТҮВШИН</text>
  </svg>`;
}

// The stage name, and a bar for the days left until the next one.
function stageLine(days: number): string {
  const at = STAGES.filter(s => days >= s.from).length - 1;
  const cur = STAGES[at], next = STAGES[at + 1];
  if (!next) return `<div class="pet-stage"><p><b>${cur.name} шат</b><span>Хамгийн дээд шат</span></p><div class="pet-bar"><span style="width:100%"></span></div></div>`;
  const span = next.from - cur.from, got = days - cur.from;
  return `<div class="pet-stage"><p><b>${cur.name} шат</b><span>${next.name} шат хүртэл ${number(next.from - days)} өдөр</span></p>
    <div class="pet-bar" role="progressbar" aria-label="${next.name} шат хүртэл" aria-valuemin="0" aria-valuemax="${span}" aria-valuenow="${got}"><span style="width:${Math.round((got / span) * 100)}%"></span></div></div>`;
}

function render(): void {
  const name = readPetName();
  const pet = petState(state.events, state.goal, state.mode, new Date(), name);
  const done = pet.days;
  const level = LEVELS.filter(t => done >= t).length; // 0 until the first counted day
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app" tabindex="-1"><div class="app-shell">
      <header class="app-top">${siteNav('achievements')}</header>
      <div class="ach-top">
        <div class="hx-header ach-header"><span class="hx-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.5C8 8 5 11.6 5 15.5a7 7 0 0 0 14 0c0-3.9-3-7.5-7-13z" fill="none" stroke="currentColor" stroke-width="2"/></svg></span><h1>Амжилт</h1><span></span></div>
        <button type="button" class="pet-tap" id="pet-tap">${petSvg(pet, name, 'pet-big')}</button>
        <button type="button" class="pet-name" id="pet-name" aria-label="Нэр солих: ${escape(name)}">${escape(name)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
        <span class="pet-streak${pet.streak ? ' hot' : ''}"><span aria-hidden="true">🔥</span>${number(pet.streak)} өдрийн streak</span>
        <p class="pet-line" id="pet-line">${escape(pet.line)}</p>
        ${stageLine(done)}
        <p class="ach-sub">${level ? `${level}-р түвшин · ${number(done)} өдөр биелүүлсэн` : '1-р түвшин хүртэл 1 өдөр'}</p>
      </div>
      <div class="hydro hx-page ach-body">
        <section class="hx-card ach-grid" aria-label="Бүх түвшин">${LEVELS.map((need, i) => {
          const n = i + 1, got = n <= level, current = n === level;
          return `<div class="ach-item">${badge(n, !got)}<b>${n}-р түвшин</b><small>${current ? 'Таны одоогийн түвшин' : got ? 'Давсан' : `${need} өдөр биелүүлэх`}</small></div>`;
        }).join('')}</section>
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
    heart.style.left = `${40 + Math.random() * 20}%`;
    tap.append(heart);
    setTimeout(() => heart.remove(), 1000);
  });
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
