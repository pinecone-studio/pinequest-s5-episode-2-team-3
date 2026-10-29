import { number } from './format';
import { KINDS, type Kind } from './drinks';
import { readCups } from './hydrify';
import { addChecked, openDial, quickDrink, quickTiles, type AddCtx, type Quick } from './home-limit';

// «Юу уусан бэ?»: the drink sheet (opened by «Уух» on the limit home and by the cup button on the
// goal home). On top, three quick tiles that add in one tap and close: a cup of water, the 50 мл
// pill sip, a dissolved medicine. Below, water or a dissolved medicine at another amount, then
// «Нэмэх», which under a limit goes through the over-limit check. Other drinks (tea, soup, coffee…)
// are no longer offered; past entries of them still show with their own name (drinks.ts).

const WATER = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 5h14l-1.6 23H10.6z" fill="#eef6fe"/><path d="M9.8 13h12.4l-1 15H10.8z" fill="#569df8"/></svg>';

interface Start { kind?: Kind; salty?: boolean; ml?: number }
// What the sheet still offers besides plain water.
const OFFERED: readonly Kind[] = ['medMix'];

export function openDrinkSheet(ctx: AddCtx, start: Start = {}): void {
  // A cup last set to a drink no longer offered starts as water.
  let kind: Kind | undefined = start.kind && OFFERED.includes(start.kind) ? start.kind : undefined;
  let ml = start.ml ?? ctx.cup;
  const second = readCups().find(c => c.name && !c.main && c.ml !== ctx.cup)?.ml ?? 350;
  const left = Math.max(0, ctx.goal - ctx.drink);

  const back = document.activeElement as HTMLElement | null;
  const box = document.createElement('div');
  box.className = 'hx-dim';
  box.innerHTML = `<div class="hx-bottom hl-sheet ds-sheet" role="dialog" aria-modal="true" aria-labelledby="ds-title">
      <span class="hl-grab" aria-hidden="true"></span>
      <div class="hl-dial-head"><h2 id="ds-title">Юу уусан бэ?</h2><span>${ctx.limit ? `Үлдсэн <b>${number(left)}</b> / ${number(ctx.goal)} мл` : `<b>${number(ctx.drink)}</b> / ${number(ctx.goal)} мл`}</span></div>
      <div class="ds-progress" aria-hidden="true"><i style="width: ${Math.min(100, (ctx.drink / ctx.goal) * 100).toFixed(1)}%"></i></div>
      ${quickTiles(ctx.cup)}
      <p class="ds-label ds-rest">Өөр хэмжээ</p>
      <div data-part="kinds"></div>
      <div data-part="sizes"></div>
      <button type="button" class="hx-blue hl-wide" data-add></button>
    </div>`;
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); back?.focus({ preventScroll: true }); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && [...document.querySelectorAll('.hx-dim')].at(-1) === box) close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  const part = (name: string) => box.querySelector<HTMLElement>(`[data-part="${name}"]`)!;
  const label = (k: Kind | undefined) => (k ? KINDS[k].name : 'Ус');

  function render(): void {
    const seg = (k: Kind | undefined) => `<button type="button" data-kind="${k ?? ''}" aria-pressed="${kind === k}">${k ? KINDS[k].icon : WATER}<span>${label(k)}</span></button>`;
    part('kinds').innerHTML = `<div class="ds-seg ds-kinds" role="group" aria-label="Юу">${seg(undefined)}${OFFERED.map(seg).join('')}</div>`;
    const sizes = [100, 150, ctx.cup, second];
    if (!sizes.includes(ml)) sizes[3] = ml;
    part('sizes').innerHTML = `<div class="ds-size-head"><p class="ds-label">Хэмжээ, мл</p><small>Таны аяга = ${number(ctx.cup)} мл</small></div>
      <div class="ds-sizes">${sizes.map(v => `<button type="button" data-ml="${v}" aria-pressed="${v === ml}">${number(v)}</button>`).join('')}<button type="button" data-dial>Өөр…</button></div>`;
    const add = box.querySelector<HTMLButtonElement>('[data-add]')!;
    const what = kind ? `${label(kind)} · ` : '';
    add.textContent = !kind && ml === ctx.cup ? `Нэмэх · 1 аяга (${number(ml)} мл)` : `Нэмэх · ${what}${number(ml)} мл`;
  }

  box.addEventListener('click', e => {
    const t = (e.target as Element).closest<HTMLElement>('button');
    if (!t || !box.contains(t)) return;
    if (t.dataset.quick) { close(); quickDrink({ ...ctx, add: ctx.addOnce ?? ctx.add }, t.dataset.quick as Quick); }
    else if (t.dataset.kind !== undefined) { kind = (t.dataset.kind || undefined) as Kind | undefined; render(); box.querySelector<HTMLElement>(`[data-kind="${t.dataset.kind}"]`)?.focus(); }
    else if (t.dataset.ml) { ml = Number(t.dataset.ml); render(); box.querySelector<HTMLElement>(`[data-ml="${ml}"]`)?.focus(); }
    else if (t.hasAttribute('data-dial')) { close(); openDial(ctx, kind, ml, false); }
    else if (t.hasAttribute('data-add')) { close(); addChecked(ctx, ml, kind, false); }
  });

  render();
  requestAnimationFrame(() => box.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true }));
}
