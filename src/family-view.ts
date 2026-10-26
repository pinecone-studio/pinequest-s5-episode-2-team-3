import type { Leaderboard, LeaderboardRow } from '../shared/family';
import { AVATARS, avatarSvg, type AvatarId } from './avatars';
import { escape, number } from './format';

// The family card on the home screen. Names and avatars come from other phones through the server,
// so everything is escaped and an unknown avatar falls back to the bottle.
const MEDALS = ['🥇', '🥈', '🥉'];

function avatarOf(id: string): AvatarId {
  return Object.hasOwn(AVATARS, id) ? id as AvatarId : 'bottle';
}

function rowHtml(r: LeaderboardRow, i: number): string {
  const avatar = avatarOf(r.avatar);
  const frac = Math.min(1, r.drinkMl / r.goalMl);
  // Under a doctor's limit nobody is ranked and nothing cheers for more: only how close the limit is.
  const place = r.rank === null ? '<span class="fam-place" aria-label="Эмчийн хязгаар">💙</span>'
    : `<span class="fam-place" aria-label="${r.rank}-р байр">${MEDALS[r.rank - 1] ?? r.rank}</span>`;
  const value = r.mode === 'limit'
    ? (r.drinkMl > r.goalMl ? 'Хязгаараас хэтэрсэн' : 'Хязгаартаа ✓')
    : `${number(r.pct)}%`;
  return `<li class="fam-row${r.me ? ' me' : ''}">
    ${place}
    <span class="fam-avatar" aria-hidden="true">${avatarSvg(avatar, frac >= 1 ? 'beam' : frac < 0.25 && r.mode === 'goal' ? 'sad' : 'happy', AVATARS[avatar].waterH * (1 - frac), false, `fam-${i}`)}</span>
    <span class="fam-name">${escape(r.name)}${r.me ? ' <small>(та)</small>' : ''}</span>
    <span class="fam-bar" aria-hidden="true"><span style="width: ${Math.round(frac * 100)}%"></span></span>
    <span class="fam-value">${value}</span>
  </li>`;
}

export function familyCard(board: Leaderboard): string {
  const rows = board.members;
  return `<section class="fam" aria-labelledby="fam-title">
    <div class="fam-head"><h2 id="fam-title">Гэр бүл · Өнөөдөр</h2><button type="button" class="text-button" data-family-leave>Гарах</button></div>
    ${rows.length ? `<ol class="fam-list">${rows.map(rowHtml).join('')}</ol>` : '<p class="fam-empty">Одоогоор зөвхөн та байна. Гэр бүлийнхэн тань энэ суурьтай холбогдоход энд гарна.</p>'}
  </section>`;
}

// Shown when the phone is with a base but has no name yet (onboarding's name step was skipped).
export function familyJoinCard(): string {
  return `<section class="fam" aria-labelledby="fam-title">
    <div class="fam-head"><h2 id="fam-title">Гэр бүлийн жагсаалт</h2></div>
    <p class="fam-empty">Энэ суурийг ашигладаг гэр бүлийнхэнтэйгээ уусан усаа харьцуулаарай.</p>
    <form class="fam-join" data-family-join data-transient>
      <label for="fam-name">Таны нэр</label>
      <div><input id="fam-name" name="name" maxlength="24" autocomplete="nickname" placeholder="Жишээ нь: Сараа" required/><button type="submit">Нэгдэх</button></div>
    </form>
  </section>`;
}
