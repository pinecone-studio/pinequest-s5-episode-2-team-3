import './type-menu.css';
import { TYPES, type EntryType } from '../data';

type Choice = 'drink' | 'spill';
const CHOICES: Choice[] = ['drink', 'spill'];
const chevron = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>';
const check = '<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>';
let closeOpen: ((refocus: boolean) => void) | undefined;

// The row's type as a pill; `label` names the entry for screen readers.
export function typeTrigger(id: string, type: EntryType, label: string): string {
  return `<button type="button" class="type-trigger ${type}" data-type-menu="${id}" aria-haspopup="menu" aria-expanded="false"
    aria-label="${label}: ${TYPES[type]}. Төрөл солих"><i></i>${TYPES[type]}${chevron}</button>`;
}

export function closeTypeMenu(refocus = false): void {
  closeOpen?.(refocus);
}

// Lives on <body> with fixed positioning so glass cards (overflow, backdrop-filter) never clip it.
export function openTypeMenu(trigger: HTMLButtonElement, current: EntryType, onPick: (type: Choice) => void): void {
  closeTypeMenu();
  const menu = document.createElement('div');
  menu.className = 'type-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Төрөл');
  menu.innerHTML = CHOICES.map(type =>
    `<button type="button" role="menuitemradio" tabindex="-1" aria-checked="${type === current}" data-pick="${type}"><i class="${type}"></i>${TYPES[type]}${check}</button>`).join('');
  document.body.append(menu);

  const rect = trigger.getBoundingClientRect();
  const fitsBelow = window.innerHeight - rect.bottom >= menu.offsetHeight + 12;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${fitsBelow ? rect.bottom + 6 : rect.top - menu.offsetHeight - 6}px`;
  trigger.setAttribute('aria-expanded', 'true');

  const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
  const focusAt = (i: number) => items[(i + items.length) % items.length].focus();
  focusAt(Math.max(0, CHOICES.indexOf(current as Choice)));

  const outside = (event: PointerEvent) => {
    const target = event.target as Node;
    if (!menu.contains(target) && !trigger.contains(target)) close(false);
  };
  const onScroll = () => close(false);
  const close = (refocus: boolean) => {
    menu.remove();
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    closeOpen = undefined;
    if (refocus) trigger.focus();
  };
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
  closeOpen = close;

  menu.onkeydown = event => {
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') focusAt(i + 1);
    else if (event.key === 'ArrowUp') focusAt(i - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(items.length - 1);
    else if (event.key === 'Escape') close(true);
    else if (event.key === 'Tab') { close(false); return; }
    else return;
    event.preventDefault();
  };
  menu.onclick = event => {
    const item = (event.target as Element).closest<HTMLButtonElement>('[data-pick]');
    if (!item) return;
    close(true);
    onPick(item.dataset.pick as Choice);
  };
}
