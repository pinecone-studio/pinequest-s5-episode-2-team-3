import { escape, number } from './format';
import { COMMON, KINDS, OTHER, SALTABLE, SERVING, type Kind } from './drinks';
import { FLAGS, flagSeen, forbidden, markFlagSeen } from './drink-flags';
import { readCups } from './hydrify';
import { askDrinkParse } from './api';
import { addChecked, openDial, type AddCtx } from './home-limit';

// «Юу уусан бэ?»: the drink sheet (opened by «Бусад…» on the limit home and by the cup button on the
// goal home). A drink (Түгээмэл, or the folded «Бусад» list), salty or not for milk tea and soup, and an
// amount, then «Нэмэх», which under a limit goes through the over-limit check. Typing or saying what
// it was ("2 аяга сүүтэй цай") asks the AI to fill the sheet in; it only parses, and the sentence
// about what fits is built here from the limit. Choosing by hand always works, offline too.

const SALTY_KEY = 'dusal-salty-last-v1';
export function readSaltyChoice(): boolean { try { return localStorage.getItem(SALTY_KEY) === '1'; } catch { return false; } }
function writeSaltyChoice(salty: boolean): void { try { localStorage.setItem(SALTY_KEY, salty ? '1' : '0'); } catch { /* default next time */ } }

// «Шөл, цай, сүү…» is shown once, the first time the sheet opens under a limit.
const NOTE_KEY = 'dusal-limit-fluids-note-v1';
function takeLimitNote(): boolean {
  try { if (localStorage.getItem(NOTE_KEY)) return false; localStorage.setItem(NOTE_KEY, '1'); return true; } catch { return false; }
}

const WATER = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 5h14l-1.6 23H10.6z" fill="#eef3ff"/><path d="M9.8 13h12.4l-1 15H10.8z" fill="#1769ff"/></svg>';
const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" fill="#1769ff"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" fill="#9cc6fb"/></svg>';
const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20Z" fill="#f2a33a"/><path d="M12 10v5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="18" r="1.3" fill="#fff"/></svg>';

// «2 аяга», «1½ аяга»: a count of cups for the AI sentence, to the quarter.
const PARTS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };
function cupCount(n: number): string {
  const q = Math.round(n * 4) / 4, whole = Math.floor(q);
  return `${whole || (q - whole ? '' : '0')}${PARTS[String(q - whole)] ?? ''}`;
}

// The speech API where the browser has one (Chrome, Android WebView); the mic hides elsewhere.
type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void };
const speechCtor = () => {
  const w = globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

interface Start { kind?: Kind; salty?: boolean; ml?: number }
type Ai = { state: 'idle' } | { state: 'busy' } | { state: 'fail'; text: string } | { state: 'done'; kind: Kind | undefined; ml: number; cups: number | null };

export function openDrinkSheet(ctx: AddCtx, start: Start = {}): void {
  let kind: Kind | undefined = start.kind;
  let salty = start.salty ?? readSaltyChoice();
  let ml = start.ml ?? ctx.cup;
  let showOther = !!kind && OTHER.includes(kind);
  let ai: Ai = { state: 'idle' };
  const SpeechCtor = speechCtor();
  const note = ctx.limit && takeLimitNote();
  const second = readCups().find(c => c.name && !c.main && c.ml !== ctx.cup)?.ml ?? 350;
  const left = Math.max(0, ctx.goal - ctx.drink);

  const back = document.activeElement as HTMLElement | null;
  const box = document.createElement('div');
  box.className = 'hx-dim';
  box.innerHTML = `<div class="hx-bottom hl-sheet ds-sheet" role="dialog" aria-modal="true" aria-labelledby="ds-title">
      <span class="hl-grab" aria-hidden="true"></span>
      <div class="hl-dial-head"><h2 id="ds-title">Юу уусан бэ?</h2><span>${ctx.limit ? `Үлдсэн <b>${number(left)}</b> / ${number(ctx.goal)} мл` : `<b>${number(ctx.drink)}</b> / ${number(ctx.goal)} мл`}</span></div>
      <div class="ds-progress" aria-hidden="true"><i style="width: ${Math.min(100, (ctx.drink / ctx.goal) * 100).toFixed(1)}%"></i></div>
      <form class="ds-ask" data-no-swipe>${SPARK}<input id="ds-text" type="text" enterkeyhint="send" autocomplete="off" maxlength="200" placeholder="Юу уух вэ? Жишээ нь: 2 аяга цай" aria-label="Юу уух вэ? AI-аар бөглөх">
        <button type="button" class="ds-mic" data-mic aria-label="Яриагаар оруулах" ${SpeechCtor ? '' : 'hidden'}>${MIC}</button>
        <button type="submit" class="ds-send" data-send aria-label="AI-д илгээх" hidden>${SEND}</button></form>
      <div data-part="ai"></div>
      ${note ? '<p class="ds-note">Шөл, цай, сүү бүгд шингэнд тооцогдож, хязгаарт бүрэн орно.</p>' : ''}
      <div data-part="kinds"></div>
      <div data-part="salt"></div>
      <div data-part="other"></div>
      <div data-part="sizes"></div>
      <div data-part="warn"></div>
      <button type="button" class="hx-blue hl-wide" data-add></button>
    </div>`;
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); recognition?.stop(); back?.focus({ preventScroll: true }); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && [...document.querySelectorAll('.hx-dim')].at(-1) === box) close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  const part = (name: string) => box.querySelector<HTMLElement>(`[data-part="${name}"]`)!;

  const label = (k: Kind | undefined) => (k ? KINDS[k].name : 'Ус');
  const tag = (k: Kind) => forbidden(k, salty) ? '<small class="ds-tag stop">⛔ Эмч хориглосон</small>'
    : FLAGS[k] ? `<small class="ds-tag warn">${WARN}${FLAGS[k]!.tag}</small>` : '';

  function render(): void {
    const tile = (k: Kind | undefined) => `<button type="button" class="ds-tile" data-kind="${k ?? ''}" aria-pressed="${kind === k}">${k ? KINDS[k].icon : WATER}<span>${label(k)}</span></button>`;
    part('kinds').innerHTML = `<p class="ds-label">Түгээмэл</p><div class="ds-tiles">${tile(undefined)}${COMMON.map(tile).join('')}</div>`;
    part('salt').innerHTML = kind && SALTABLE.includes(kind) ? `<p class="ds-label">Давс</p>
      <div class="ds-seg" role="group" aria-label="Давс"><button type="button" data-salty="0" aria-pressed="${!salty}">Давсгүй</button><button type="button" data-salty="1" aria-pressed="${salty}">Давстай</button></div>
      <small class="ds-hint">Давс цангааг ихэсгэдэг. Сувилагчийн тайланд тоологдоно.</small>` : '';
    part('other').innerHTML = `<button type="button" class="ds-more" data-other aria-expanded="${showOther}" aria-controls="ds-other-list">Бусад ундаа<span>${OTHER.length} ${showOther ? '⌄' : '›'}</span></button>
      <div id="ds-other-list" class="ds-other" ${showOther ? '' : 'hidden'}><p class="ds-label">Бусад</p><div class="ds-chips">${OTHER.map(k =>
        `<button type="button" class="ds-chip${forbidden(k, salty) ? ' stop' : ''}" data-kind="${k}" aria-pressed="${kind === k}">${KINDS[k].icon}<span><b>${KINDS[k].name}</b>${tag(k)}</span></button>`).join('')}</div></div>`;
    const sizes = [100, 150, ctx.cup, second];
    if (!sizes.includes(ml)) sizes[3] = ml;
    part('sizes').innerHTML = `<div class="ds-size-head"><p class="ds-label">Хэмжээ, мл</p><small>Таны аяга = ${number(ctx.cup)} мл</small></div>
      <div class="ds-sizes">${sizes.map(v => `<button type="button" data-ml="${v}" aria-pressed="${v === ml}">${number(v)}</button>`).join('')}<button type="button" data-dial>Өөр…</button></div>`;
    // A flagged drink: the full note once per kind, then just its tag. A ruled-out one: in red.
    let warn = '';
    if (kind && forbidden(kind, salty)) warn = '<p class="ds-warn stop">Эмч тань үүнийг хориглосон. Уусан бол бүртгэнэ үү — тайланд хэрэгтэй.</p>';
    else if (kind && FLAGS[kind]) {
      const f = FLAGS[kind]!;
      warn = flagSeen(kind) ? `<p class="ds-warn line">⚠ ${f.tag}</p>` : `<p class="ds-warn">${WARN}<span><b>${f.title}</b> ${f.text}</span></p>`;
      markFlagSeen(kind);
    }
    part('warn').innerHTML = warn;
    part('ai').innerHTML = aiCard();
    const add = box.querySelector<HTMLButtonElement>('[data-add]')!;
    add.textContent = ml === ctx.cup ? `Нэмэх · 1 аяга (${number(ml)} мл)` : `Нэмэх · ${number(ml)} мл`;
  }

  // The AI's reading, and the sentence about the limit built here from cupsText-style counts.
  function aiCard(): string {
    if (ai.state === 'idle') return '';
    if (ai.state === 'busy') return '<p class="ds-ai-state" role="status">AI уншиж байна…</p>';
    if (ai.state === 'fail') return `<p class="ds-ai-state fail" role="alert">${escape(ai.text)}</p>`;
    const amount = ai.cups ? `${cupCount(ai.cups)} аяга` : `${number(ai.ml)} мл`;
    const whole = Math.floor(left / ctx.cup);
    let line = '', fit = '';
    if (ctx.limit) {
      if (ai.ml <= left) line = `Танд <b>${number(left)} мл</b> үлдсэн. ${amount} уувал багтана.`;
      else {
        const over = `<b class="ds-red">${number(ai.ml - left)} мл хэтэрнэ</b>`;
        line = whole >= 1 ? `Танд <b>${number(left)} мл</b> үлдсэн. ${whole} аяга уувал хязгаартаа багтана, ${amount} бол ${over}.` : `Танд <b>${number(left)} мл</b> үлдсэн. ${amount} бол ${over}.`;
        if (whole >= 1) fit = `<button type="button" class="hx-blue ds-fit" data-fit="${whole * ctx.cup}">${whole} аяга (${number(whole * ctx.cup)} мл) болгох</button>`;
      }
    }
    return `<div class="ds-ai" role="status">
        <p class="ds-ai-head">${SPARK}AI ойлгосон: <span>${escape(label(ai.kind))} · ${number(ai.ml)} мл</span></p>
        ${line ? `<p class="ds-ai-line">${line}</p>` : ''}${fit}
        ${ctx.limit ? '<small>Тоог апп таны эмчийн хязгаараар тооцоолсон.</small>' : ''}
      </div>`;
  }

  const pick = (k: Kind | undefined) => {
    // Another drink than the AI read: its card no longer applies.
    if (ai.state === 'done' && ai.kind !== k) ai = { state: 'idle' };
    kind = k;
    if (k && !COMMON.includes(k) && SERVING[k]) ml = SERVING[k]!;
    render();
    box.querySelector<HTMLElement>(`[data-kind="${k ?? ''}"]`)?.focus({ preventScroll: true });
  };
  box.addEventListener('click', e => {
    const t = (e.target as Element).closest<HTMLElement>('button');
    if (!t || !box.contains(t)) return;
    if (t.dataset.kind !== undefined) pick((t.dataset.kind || undefined) as Kind | undefined);
    else if (t.dataset.salty) { salty = t.dataset.salty === '1'; writeSaltyChoice(salty); render(); box.querySelector<HTMLElement>(`[data-salty="${t.dataset.salty}"]`)?.focus(); }
    else if (t.hasAttribute('data-other')) { showOther = !showOther; render(); box.querySelector<HTMLElement>('[data-other]')?.focus(); }
    else if (t.dataset.ml) { ml = Number(t.dataset.ml); render(); box.querySelector<HTMLElement>(`[data-ml="${ml}"]`)?.focus(); }
    else if (t.dataset.fit) { ml = Number(t.dataset.fit); render(); }
    else if (t.hasAttribute('data-dial')) { close(); openDial(ctx, kind, ml, salty); }
    else if (t.hasAttribute('data-add')) { close(); addChecked(ctx, ml, kind, kind && SALTABLE.includes(kind) ? salty : false); }
  });

  // The AI is asked only when the field is sent, never on a tile tap.
  const input = box.querySelector<HTMLInputElement>('#ds-text')!;
  const mic = box.querySelector<HTMLButtonElement>('[data-mic]')!, send = box.querySelector<HTMLButtonElement>('[data-send]')!;
  const toggle = () => { const typed = !!input.value.trim(); send.hidden = !typed; mic.hidden = typed || !SpeechCtor; };
  input.addEventListener('input', toggle);
  box.querySelector('form')!.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || ai.state === 'busy') return;
    ai = { state: 'busy' }; render();
    try {
      const r = await askDrinkParse({ text, kinds: Object.keys(KINDS), cupMl: ctx.cup });
      const k = r.kind === 'water' ? undefined : (r.kind as Kind);
      if (!r.kind || !r.ml || (k && !(k in KINDS))) ai = { state: 'fail', text: 'Ойлгосонгүй, доороос сонгоно уу' };
      else { ai = { state: 'done', kind: k, ml: r.ml, cups: r.cups }; kind = k; ml = r.ml; showOther = !!k && OTHER.includes(k); }
    } catch (err) {
      ai = { state: 'fail', text: err instanceof Error && /цаг|холболт/i.test(err.message) ? err.message : 'Ойлгосонгүй, доороос сонгоно уу' };
    }
    render();
  });
  let recognition: Recognition | null = null;
  mic.addEventListener('click', () => {
    if (!SpeechCtor) return;
    if (recognition) { recognition.stop(); return; }
    recognition = new SpeechCtor();
    recognition.lang = 'mn-MN';
    recognition.interimResults = false;
    mic.classList.add('on');
    recognition.onresult = ev => { input.value = ev.results[0]?.[0]?.transcript ?? ''; toggle(); input.focus(); };
    recognition.onend = recognition.onerror = () => { recognition = null; mic.classList.remove('on'); };
    recognition.start();
  });

  render();
  requestAnimationFrame(() => box.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true }));
}
