import type { BadgeId } from './pet-config';

// Badge medals and the small how-to icons on the achievements page, drawn as SVG in the pet's own
// style (a smiling water drop) instead of system emoji, so they look the same on every phone.
// Each medal: a round face with its own gradient, a white rim and two ribbons; locked ones turn grey in CSS.

const DROP = 'M32 13C32 13 19 29 19 38.5a13 13 0 0 0 26 0C45 29 32 13 32 13Z';
const face = (dx = 0, dy = 0, s = 1) => `<g transform="translate(${dx} ${dy}) translate(32 40) scale(${s}) translate(-32 -40)">
  <circle class="b-eye" cx="27.5" cy="38" r="2.3"/><circle class="b-eye" cx="36.5" cy="38" r="2.3"/>
  <circle fill="#fff" cx="28.3" cy="37.2" r=".8"/><circle fill="#fff" cx="37.3" cy="37.2" r=".8"/>
  <path class="b-smile" d="M29.5 42.5q2.5 2.4 5 0"/><ellipse class="b-blush" cx="24.5" cy="42" rx="2.2" ry="1.3"/><ellipse class="b-blush" cx="39.5" cy="42" rx="2.2" ry="1.3"/></g>`;
const drop = (fill: string, dx = 0, dy = 0, s = 1) => `<g transform="translate(${dx} ${dy}) translate(32 40) scale(${s}) translate(-32 -40)">
  <path d="${DROP}" fill="${fill}" stroke="#fff" stroke-width="1.8"/><path d="M25.5 29q-3 4.5-3.4 8.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".75"/></g>${face(dx, dy, s)}`;
const sparkle = (x: number, y: number, r: number, c = '#fff6b0') => `<path fill="${c}" d="M${x} ${y - r}l${r * 0.28} ${r * 0.72} ${r * 0.72} ${r * 0.28}-${r * 0.72} ${r * 0.28}-${r * 0.28} ${r * 0.72}-${r * 0.28}-${r * 0.72}-${r * 0.72}-${r * 0.28} ${r * 0.72}-${r * 0.28}Z"/>`;

const ART: Record<BadgeId, { from: string; to: string; art: string }> = {
  // The first drop, with a little splash.
  first: { from: '#bfe6ff', to: '#3f9cf5', art: `${drop('url(#bd-water)')}<path d="M14 50q4-4 8 0M42 50q4-4 8 0" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/>${sparkle(48, 18, 4)}` },
  // Three drops in a row, the middle one tallest.
  d3: { from: '#c9f3ff', to: '#22b8d9', art: `${drop('url(#bd-water)', -11, 4, 0.62)}${drop('url(#bd-water)', 11, 4, 0.62)}${drop('url(#bd-water)', 0, -2, 0.78)}` },
  // A trophy cup full of water with a star.
  d7: { from: '#fff1c2', to: '#ffb02e', art: `<path d="M20 18h24v8a12 12 0 0 1-24 0Z" fill="#ffd45c" stroke="#fff" stroke-width="1.8"/><path d="M21 24h22v2a11 11 0 0 1-22 0Z" fill="#4fb3ff"/><path d="M21 24q5.5-2.5 11 0t11 0" stroke="#bfe6ff" stroke-width="1.6" fill="none"/>
    <path d="M20 21h-4a5 5 0 0 0 5 6M44 21h4a5 5 0 0 1-5 6" stroke="#ffd45c" stroke-width="2.4" fill="none"/><rect x="29" y="37" width="6" height="7" fill="#ffd45c"/><rect x="23" y="44" width="18" height="5" rx="2" fill="#ffc02d" stroke="#fff" stroke-width="1.5"/>${sparkle(32, 12, 4.5, '#fff')}` },
  // A hero drop with a red cape.
  d14: { from: '#ffd2dc', to: '#ff5c7a', art: `<path d="M22 32q-8 14-4 22l7-5 7 6 7-6 7 5q4-8-4-22Z" fill="#e8213d"/>${drop('url(#bd-water)')}<path d="M24 34.5q8 3 16 0" stroke="#e8213d" stroke-width="3" stroke-linecap="round" fill="none"/>` },
  // A drop king with a gold crown.
  d30: { from: '#ece0ff', to: '#8a5cff', art: `${drop('url(#bd-water)', 0, 3)}<path d="M22 19l3-8 4 5 3-7 3 7 4-5 3 8Z" fill="#ffcc33" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="32" cy="9.5" r="1.6" fill="#ff5c7a"/>` },
  // The legend: a drop with angel wings and a halo on a rainbow.
  d100: { from: '#fff6c9', to: '#ff8ad8', art: `<path d="M8 50a24 24 0 0 1 48 0" stroke="#ff7a7a" stroke-width="3" fill="none"/><path d="M12 50a20 20 0 0 1 40 0" stroke="#ffd166" stroke-width="3" fill="none"/><path d="M16 50a16 16 0 0 1 32 0" stroke="#5cd6a0" stroke-width="3" fill="none"/>
    <path d="M19 34q-9-6-11 2 4 0 6 3 2-3 5-2ZM45 34q9-6 11 2-4 0-6 3-2-3-5-2Z" fill="#fff" stroke="#ffe08a" stroke-width="1.2"/>${drop('url(#bd-water)', 0, 2)}<ellipse cx="32" cy="10" rx="7" ry="2.2" fill="none" stroke="#ffcc33" stroke-width="2"/>${sparkle(52, 16, 4, '#fff')}${sparkle(12, 18, 3, '#fff')}` },
};

// Medal metals by rarity, and the number of days each badge is for (on its ribbon).
const METAL: Record<BadgeId, { stops: [string, string, string]; days: string; wreath: boolean }> = {
  first: { stops: ['#ffe2bf', '#d48a4a', '#8a4b1e'], days: '1', wreath: false },
  d3: { stops: ['#ffe2bf', '#d48a4a', '#8a4b1e'], days: '3', wreath: false },
  d7: { stops: ['#ffffff', '#c9d3df', '#7d8da3'], days: '7', wreath: true },
  d14: { stops: ['#ffffff', '#c9d3df', '#7d8da3'], days: '14', wreath: true },
  d30: { stops: ['#fff6c2', '#ffc83d', '#b87800'], days: '30', wreath: true },
  d100: { stops: ['#f2fdff', '#7fd6ff', '#9a6bff'], days: '100', wreath: true },
};
// A scalloped rosette edge round the medal.
const rosette = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, r = i % 2 ? 33 : 36.5; pts.push(`${(40 + Math.sin(a) * r).toFixed(1)},${(40 - Math.cos(a) * r).toFixed(1)}`); }
  return pts.join(' ');
})();
const rays = Array.from({ length: 12 }, (_, i) => `<path d="M40 40 L${40 + Math.sin((i / 12) * Math.PI * 2 - 0.13) * 46} ${40 - Math.cos((i / 12) * Math.PI * 2 - 0.13) * 46} L${40 + Math.sin((i / 12) * Math.PI * 2 + 0.13) * 46} ${40 - Math.cos((i / 12) * Math.PI * 2 + 0.13) * 46}Z"/>`).join('');
const wreath = (c: string) => [-1, 1].map(s => Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI * (0.62 + i * 0.075), x = 40 + s * Math.sin(a) * 37, y = 40 - Math.cos(a) * 37, rot = s * (a * 180 / Math.PI) + (s < 0 ? 180 : 0) - 40 * s;
  return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3.4" ry="7" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${c}"/>`;
}).join('')).join('');

export function badgeSvg(id: BadgeId): string {
  const a = ART[id], m = METAL[id];
  return `<svg class="badge-art" viewBox="0 0 80 92" aria-hidden="true"><defs>
    <linearGradient id="bd-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.from}"/><stop offset="1" stop-color="${a.to}"/></linearGradient>
    <linearGradient id="bm-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.stops[0]}"/><stop offset=".5" stop-color="${m.stops[1]}"/><stop offset="1" stop-color="${m.stops[2]}"/></linearGradient>
    <radialGradient id="bd-water" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#9fd8ff"/><stop offset="1" stop-color="#2f8ff0"/></radialGradient>
    <clipPath id="bc-${id}"><circle cx="40" cy="40" r="28"/></clipPath></defs>
    <g class="b-rays" fill="url(#bm-${id})">${rays}</g>
    ${m.wreath ? `<g class="b-wreath">${wreath(id === 'd30' ? '#ffb800' : id === 'd100' ? '#8f7bff' : '#57b86a')}</g>` : ''}
    <polygon points="${rosette}" fill="url(#bm-${id})" stroke="#fff" stroke-width="1.5"/>
    <circle cx="40" cy="40" r="30.5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>
    <circle cx="40" cy="40" r="28" fill="url(#bd-${id})"/>
    <g clip-path="url(#bc-${id})"><g transform="translate(8 2)">${a.art}</g><rect class="b-sweep" x="-30" y="0" width="14" height="80" fill="#fff" opacity=".45" transform="rotate(25 40 40)"/></g>
    <path d="M14 70h52l-5 7 5 7H14l5-7Z" fill="url(#bm-${id})" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
    <text x="40" y="81" text-anchor="middle" font-size="10" font-weight="900" fill="#fff" stroke="rgba(0,0,0,.25)" stroke-width=".6" paint-order="stroke">${m.days} ӨДӨР</text></svg>`;
}

// The four steps of the game loop.
export const LOOP_ICONS = {
  drink: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3S7 14 7 20a9 9 0 0 0 18 0C25 14 16 3 16 3Z" fill="#4aa8ff"/><path d="M11.5 20.5l3 3 6-6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  bowl: `<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="14" rx="12" ry="3.4" fill="#9fd8ff"/><path d="M4 14q1 13 12 13t12-13q-2 3.5-12 3.5T4 14Z" fill="#2f93ff"/><path d="M16 19c-1.6 2-2.2 3-2.2 4a2.2 2.2 0 0 0 4.4 0c0-1-.6-2-2.2-4Z" fill="#fff"/><path d="M10 9q1.5-2 0-4M16 8q1.5-2 0-4M22 9q1.5-2 0-4" stroke="#9fd8ff" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
  feed: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3S7 14 7 20a9 9 0 0 0 18 0C25 14 16 3 16 3Z" fill="#4aa8ff"/><path d="M11.5 18.5q1.5-1.6 3 0M17.5 18.5q1.5-1.6 3 0" stroke="#14305a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M13 22q3 3.4 6 0Z" fill="#14305a"/><path d="M25 6c-1.2-1.6-3.8-.6-3 1.4.5 1.2 3 3 3 3s2.5-1.8 3-3c.8-2-1.8-3-3-1.4Z" fill="#ff6b8a"/></svg>`,
  star: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3l3.7 7.6 8.3 1.2-6 5.9 1.4 8.3L16 22l-7.4 4 1.4-8.3-6-5.9 8.3-1.2Z" fill="#ffc83d" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><path d="M16 11s-3 3.6-3 5.6a3 3 0 0 0 6 0C19 14.6 16 11 16 11Z" fill="#4aa8ff"/></svg>`,
};
