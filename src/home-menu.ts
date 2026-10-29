import { number } from './format';
import { mdIcon } from './components/Icon';
import { WEEKDAY_SHORT, readDialysis } from './progress-data';
import { nextDialysis, sheet } from './home-limit';
import { readSettings } from './schedule';
import type { HomeAction } from './home-actions';

// The home's «⋯» sheet: one row per action from homeActions(), each an icon, a title, a short
// note on the right where it helps, and ›. Closes with ×, a tap outside or Escape.
export interface MenuHandlers { thirst: () => void; plan: () => void; reminder: () => void }

const ICONS = { thirst: mdIcon('water_drop'), dialysis: mdIcon('calendar_month'), plan: mdIcon('target'), reminder: mdIcon('alarm') } as const;

function row(action: HomeAction, goal: number): string {
  const line = (title: string, note = '') =>
    `<span class="hm-icon">${ICONS[action]}</span><b>${title}</b>${note ? `<small>${note}</small>` : ''}<i aria-hidden="true">›</i>`;
  if (action === 'dialysis') {
    // The days live on «Эмчийн зөвлөмж»; in the app's tab host the hash goes along (tabs.ts).
    const d = readDialysis(), at = nextDialysis(d);
    return `<li><a class="hm-row" href="/settings.html#doctor">${line('Диализын өдөр', at ? `${WEEKDAY_SHORT[at.getDay()]} ${d.time}` : 'Тохируулаагүй')}</a></li>`;
  }
  const title = { thirst: 'Цангаж байна', plan: 'Зорилтоо тохируулах', reminder: 'Уух цагийн сануулга' }[action];
  const note = action === 'plan' ? `${number(goal)} мл` : action === 'reminder' ? (readSettings().on ? 'Асаалттай' : 'Унтраалттай') : '';
  return `<li><button type="button" class="hm-row" data-action="${action}">${line(title, note)}</button></li>`;
}

export function openHomeMenu(actions: HomeAction[], goal: number, on: MenuHandlers): void {
  const { box, close } = sheet('hm-sheet', `
      <div class="hm-head"><h2 id="hm-title">Бусад үйлдэл</h2><button type="button" class="hm-close" data-close aria-label="Хаах">${mdIcon('close')}</button></div>
      <ul class="hm-list">${actions.map(a => row(a, goal)).join('')}</ul>`, 'Бусад үйлдэл');
  box.querySelector('[data-close]')!.addEventListener('click', close);
  box.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => b.addEventListener('click', () => {
    close();
    on[b.dataset.action as keyof MenuHandlers]();
  }));
}
