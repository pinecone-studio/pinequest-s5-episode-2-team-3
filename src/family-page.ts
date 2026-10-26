import './style.css';
import './shell.css';
import './hydration.css';
import './family.css';
import './pwa';
import { dayKey, defaults } from './data';
import { dateLabel, escape, number } from './format';
import { brandMark, mdIcon } from './components/Icon';
import { siteNav } from './nav';
import { load, onExternalChange } from './storage';
import { scale } from './scale';
import { AVATARS, avatarSvg, readAvatar, type AvatarId, type Face } from './avatars';
import { FamilyError, family, readMembership, todayReport, writeMembership } from './family';
import type { Leaderboard, LeaderboardRow } from '../shared/family';

// Family: everyone on the same base, ranked by how much of their own goal they have drunk today.
// Joining needs a name and the base (the connected one, or its code typed in); after that the board
// refreshes on its own while the page is open.
const app = document.querySelector<HTMLDivElement>('#app')!;
let state = defaults();
let board: Leaderboard | null = null;
let error = '';
let busy = false;
let renaming = false;
const REFRESH_MS = 30_000;

const MEDALS = ['#f5b400', '#a8b2bf', '#d08a4a'];
const isAvatar = (id: string): id is AvatarId => Object.hasOwn(AVATARS, id);
const faceFor = (r: LeaderboardRow): Face => (r.mode === 'limit' ? (r.pct > 100 ? 'worried' : 'happy') : r.pct >= 100 ? 'beam' : r.pct >= 50 ? 'happy' : r.pct >= 25 ? 'worried' : 'sad');

function row(r: LeaderboardRow, i: number): string {
  const id = isAvatar(r.avatar) ? r.avatar : 'bottle';
  const fill = Math.min(1, r.pct / 100);
  const rank = r.rank === null ? `<span class="fam-rank none" title="Эмчийн хязгаартай">${mdIcon('stethoscope')}</span>`
    : `<span class="fam-rank${r.rank <= 3 ? ' medal' : ''}" style="${r.rank <= 3 ? `--medal: ${MEDALS[r.rank - 1]}` : ''}">${r.rank}</span>`;
  const status = r.mode === 'limit' ? (r.pct > 100 ? 'Хязгаараас хэтэрсэн' : 'Хязгаартаа') : r.pct >= 100 ? `Биеллээ ${mdIcon('celebration')}` : `${r.pct}%`;
  return `<li class="fam-row${r.me ? ' me' : ''}${r.mode === 'limit' ? ' limit' : ''}">
    ${rank}
    <span class="fam-avatar">${avatarSvg(id, faceFor(r), AVATARS[id].waterH * (1 - fill), r.pct >= 100 && r.mode === 'goal', `fam-${i}`)}</span>
    <div class="fam-main"><b>${escape(r.name)}${r.me ? ' <small>(Та)</small>' : ''}</b>
      <div class="fam-bar" aria-hidden="true"><i style="width: ${Math.round(fill * 100)}%"></i></div>
      <span class="fam-ml">${number(r.drinkMl)} / ${number(r.goalMl)} мл</span></div>
    <span class="fam-status">${status}</span>
  </li>`;
}

function joinCard(): string {
  const m = readMembership();
  const connected = scale.baseId;
  return `<section class="fam-card fam-join" aria-labelledby="fam-title">
    <span class="fam-hero" aria-hidden="true">${mdIcon('emoji_events')}</span>
    <h1 id="fam-title">Гэр бүл</h1>
    <p>Нэг суурийг хэрэглэдэг хүмүүс нэг гэр бүл болж, өдөр бүр хэн зорилтдоо хамгийн ойр байгааг харна.</p>
    <form id="fam-join" novalidate>
      <label>Таны нэр<input id="fam-name" name="name" maxlength="24" autocomplete="nickname" placeholder="Жишээ: Ээж" value="${escape(m.name)}" required/></label>
      ${connected ? `<p class="fam-base">${mdIcon('check_circle')}<span><b>${escape(scale.name || 'Суурь')}</b> холбогдсон · ${escape(connected)}</span></p>`
        : `<label>Суурийн код<input id="fam-base" name="base" maxlength="64" autocomplete="off" placeholder="Жишээ: bottle-01" value="${escape(m.baseId ?? '')}"/></label>
        <p class="fam-hint">Суурийг <a href="/settings.html">Тохиргоо</a>-оос Bluetooth-ээр холбовол код автоматаар орно.</p>`}
      <p class="form-error" role="alert" ${error ? '' : 'hidden'}>${escape(error)}</p>
      <button type="submit" class="dark-button fam-go" ${busy ? 'disabled' : ''}>${busy ? 'Түр хүлээнэ үү…' : 'Гэр бүл үүсгэх / нэгдэх'}</button>
    </form>
  </section>`;
}

function boardCard(): string {
  const m = readMembership();
  const members = board?.members ?? [];
  const alone = members.length <= 1;
  return `<section class="fam-card" aria-labelledby="fam-title">
    <div class="fam-head"><h1 id="fam-title">Манай гэр бүл</h1><span>${dateLabel(dayKey())}</span></div>
    ${board ? `<ol class="fam-board" aria-label="Өнөөдрийн жагсаалт">${members.map(row).join('')}</ol>` : `<p class="fam-empty">${busy ? 'Ачаалж байна…' : 'Жагсаалтыг авч чадсангүй.'}</p>`}
    ${members.some(r => r.mode === 'limit') ? '<p class="fam-note">Эмчийн хязгаартай гишүүнийг эрэмбэлэхгүй: түүнд их уух нь ялалт биш.</p>' : ''}
    ${board && alone ? `<p class="fam-invite">${mdIcon('water_drop')}<span>Гэр бүлийнхнээ урь: тэд энэ суурийг утсандаа холбоод (эсвэл <b>${escape(m.baseId!)}</b> кодоор) нэгдэнэ.</span></p>` : ''}
    <p class="form-error" role="alert" ${error ? '' : 'hidden'}>${escape(error)}</p>
    <form id="fam-rename" class="fam-rename" ${renaming ? '' : 'hidden'} novalidate>
      <label>Шинэ нэр<input id="fam-new-name" maxlength="24" value="${escape(m.name)}"/></label><button type="submit" class="dark-button">Хадгалах</button>
    </form>
    <div class="fam-actions"><span>Суурь: ${escape(m.baseId!)}</span>
      <button type="button" class="text-button" id="fam-rename-toggle">Нэр солих</button>
      <button type="button" class="text-button danger" id="fam-leave">Гарах</button></div>
  </section>`;
}

function render(): void {
  const m = readMembership();
  app.innerHTML = `<a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home home-app family-page" tabindex="-1">
      <div class="app-shell">
        <header class="app-top">
          <a class="brand" href="/" aria-label="Дусал нүүр"><span class="brand-mark">${brandMark()}</span>Дусал</a>
          ${siteNav('family')}
          <span class="app-date">${dateLabel(dayKey())}</span>
        </header>
        <div class="fam-body">${m.baseId && m.name ? boardCard() : joinCard()}</div>
      </div>
    </main>`;
  bind();
}

// Sends today's own numbers and shows the board the server answers with.
async function refresh(report = true): Promise<void> {
  const m = readMembership();
  if (!m.baseId || !m.name) return;
  try {
    board = report ? await family.report(m.baseId, m.memberId, todayReport(state, m.name, readAvatar()))
      : await family.board(m.baseId, m.memberId, dayKey());
    error = '';
  } catch (e) {
    error = e instanceof FamilyError ? e.message : 'Гэр бүлийн мэдээллийг авч чадсангүй.';
  }
  render();
}

async function join(form: HTMLFormElement): Promise<void> {
  const name = (form.querySelector<HTMLInputElement>('#fam-name')!.value ?? '').trim().replace(/\s+/g, ' ');
  const baseId = scale.baseId || (form.querySelector<HTMLInputElement>('#fam-base')?.value ?? '').trim();
  if (!name) { error = 'Нэрээ бичнэ үү.'; render(); return; }
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(baseId)) { error = 'Суурийн код үсэг, тоо, зураастай байна (жишээ: bottle-01).'; render(); return; }
  const m = readMembership();
  busy = true; error = ''; render();
  try {
    board = await family.report(baseId, m.memberId, todayReport(state, name, readAvatar()));
    writeMembership({ ...m, name, baseId });
  } catch (e) {
    error = e instanceof FamilyError ? e.message : 'Нэгдэж чадсангүй.';
  }
  busy = false;
  render();
}

async function leave(): Promise<void> {
  const m = readMembership();
  if (!m.baseId || !confirm('Гэр бүлээс гарах уу? Таны дүн жагсаалтаас арилна.')) return;
  try { await family.leave(m.baseId, m.memberId); } catch (e) {
    // Already gone on the server is fine; anything else keeps the membership so it can be retried.
    if (!(e instanceof FamilyError && /олдсонгүй/.test(e.message))) { error = e instanceof Error ? e.message : 'Гарч чадсангүй.'; render(); return; }
  }
  writeMembership({ ...m, baseId: null });
  board = null; error = '';
  render();
}

function bind(): void {
  const joinForm = document.querySelector<HTMLFormElement>('#fam-join');
  if (joinForm) joinForm.onsubmit = event => { event.preventDefault(); void join(joinForm); };
  document.querySelector('#fam-leave')?.addEventListener('click', () => void leave());
  document.querySelector('#fam-rename-toggle')?.addEventListener('click', () => {
    renaming = !renaming; render();
    if (renaming) document.querySelector<HTMLInputElement>('#fam-new-name')?.focus();
  });
  const rename = document.querySelector<HTMLFormElement>('#fam-rename');
  if (rename) rename.onsubmit = event => {
    event.preventDefault();
    const name = document.querySelector<HTMLInputElement>('#fam-new-name')!.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    writeMembership({ ...readMembership(), name });
    renaming = false;
    void refresh();
  };
}

async function reload(): Promise<void> {
  state = (await load()).state;
  await refresh();
}

window.addEventListener('dusal-scale', () => { if (!readMembership().baseId) render(); });
onExternalChange(() => { void reload(); });
setInterval(() => { if (!document.hidden) void refresh(false); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(false); });
scale.start();
// Show the board straight away; today's own total goes up once local data has loaded.
busy = Boolean(readMembership().baseId);
render();
void refresh(false).finally(() => { busy = false; if (!board) render(); });
void reload();
