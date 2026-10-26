import './style.css';
import './shell.css';
import './pwa';
import { dayKey, defaults, type AppState } from './data';
import { number } from './format';
import { siteNav } from './nav';
import { load, onExternalChange } from './storage';
import { dayCounter } from './hydration';
import './theme.css';

// "Амжилт" page, Hydrify layout (demo): levels earned by days that counted (the goal reached, or
// under a doctor's limit, the limit kept). The current level's badge on a blue header, then all fifteen.
const LEVELS = [1, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 200, 250, 300];

const app = document.querySelector<HTMLDivElement>('#app')!;
let state: AppState = defaults();

// Days so far that counted, from the first logged day to today.
function countedDays(): number {
  const met = dayCounter(state.events, state.goal, state.mode);
  const days = new Set(state.events.map(e => dayKey(new Date(e.at))));
  let n = 0;
  for (const d of days) if (met(d)) n++;
  return n;
}

// A winged hexagon with the level number on a ribbon; grey with a lock when not reached yet.
function badge(level: number, locked: boolean, big = false): string {
  if (locked) return `<svg class="ach-badge locked" viewBox="0 0 120 110" aria-hidden="true"><circle cx="60" cy="50" r="34" fill="#eeeeee"/><path d="M38 78l-10 24 16-6 8 10 8-22M82 78l10 24-16-6-8 10-8-22" fill="#eeeeee"/><rect x="50" y="46" width="20" height="16" rx="3" fill="#bdbdbd"/><path d="M54 46v-5a6 6 0 0 1 12 0v5" fill="none" stroke="#bdbdbd" stroke-width="3"/></svg>`;
  const id = `g${level}${big ? 'b' : ''}`;
  return `<svg class="ach-badge${big ? ' big' : ''}" viewBox="0 0 120 110" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa6c9"/><stop offset="1" stop-color="#5a6690"/></linearGradient></defs>
    <path d="M22 40c-14 4-20 16-18 26 8-6 14-6 20-4zM98 40c14 4 20 16 18 26-8-6-14-6-20-4z" fill="#7b86ad"/>
    <path d="M60 6l34 19v40L60 84 26 65V25z" fill="url(#${id})" stroke="#c9d1ec" stroke-width="3"/>
    <text x="60" y="56" text-anchor="middle" font-size="34" font-weight="800" fill="#fff">${level}</text>
    <path d="M18 66h84l-6 9 6 9H18l6-9z" fill="#1f8bff"/>
    <text x="60" y="79" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" letter-spacing="1">ТҮВШИН</text>
  </svg>`;
}

function render(): void {
  const done = countedDays();
  const level = LEVELS.filter(t => done >= t).length; // 0 until the first counted day
  const shown = Math.max(1, level);
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app" tabindex="-1"><div class="app-shell">
      <header class="app-top">${siteNav('achievements')}</header>
      <div class="ach-top">
        <div class="hx-header ach-header"><span class="hx-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.5C8 8 5 11.6 5 15.5a7 7 0 0 0 14 0c0-3.9-3-7.5-7-13z" fill="none" stroke="currentColor" stroke-width="2"/></svg></span><h1>Амжилт</h1><span></span></div>
        ${badge(shown, level === 0, true)}
        <p class="ach-level">${level ? `${level}-р түвшин` : 'Эхний түвшин рүү'}</p>
        <p class="ach-sub">${level ? `Та ${number(done)} өдөр зорилтоо биелүүлсэн!` : 'Нэг өдөр зорилтоо биелүүлбэл 1-р түвшин нээгдэнэ.'}</p>
      </div>
      <div class="hydro hx-page ach-body">
        <section class="hx-card ach-grid" aria-label="Бүх түвшин">${LEVELS.map((need, i) => {
          const n = i + 1, got = n <= level, current = n === level;
          return `<div class="ach-item">${badge(n, !got)}<b>${n}-р түвшин</b><small>${current ? 'Таны одоогийн түвшин' : got ? 'Давсан' : `${need} өдөр биелүүлэх`}</small></div>`;
        }).join('')}</section>
      </div>
    </div></main>`;
}

async function reload(): Promise<void> { state = (await load()).state; render(); }
onExternalChange(() => void reload());
void reload();
