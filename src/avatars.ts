// Buddy characters for the home (viewBox 160×220). Each one has its own body outline, the band
// the water rises through, where arms and feet attach, how far the face sits down, and extras
// drawn behind the body (ears) or on top of it (cap, whiskers).
export interface Avatar {
  name: string;
  body: string;
  waterTop: number;
  waterH: number;
  arms: { y: number; left: number; right: number };
  feetY: number | null;
  faceDy: number;
  behind?: string;
  front?: string;
  shine?: string;
}

export const AVATARS = {
  bottle: {
    name: 'Сав',
    body: 'M58 30 V24 H102 V30 C102 42 130 46 130 74 V196 A14 14 0 0 1 116 210 H44 A14 14 0 0 1 30 196 V74 C30 46 58 42 58 30Z',
    waterTop: 60, waterH: 150, arms: { y: 118, left: 31, right: 129 }, feetY: 214, faceDy: 0,
    shine: '<rect class="buddy-shine" x="42" y="82" width="7" height="70" rx="3.5"/>',
    front: '<rect class="buddy-cap" x="52" y="8" width="56" height="20" rx="7"/>',
  },
  glass: {
    name: 'Шил аяга',
    body: 'M26 44 H134 L120 204 Q119 212 110 212 H50 Q41 212 40 204 Z',
    waterTop: 58, waterH: 154, arms: { y: 122, left: 33, right: 127 }, feetY: 216, faceDy: 6,
    shine: '<rect class="buddy-shine" x="40" y="62" width="7" height="80" rx="3.5" transform="rotate(-5 43 100)"/>',
  },
  drop: {
    name: 'Дусал',
    body: 'M80 14 C80 14 26 92 26 146 A54 54 0 0 0 134 146 C134 92 80 14 80 14Z',
    waterTop: 46, waterH: 154, arms: { y: 132, left: 27, right: 133 }, feetY: 202, faceDy: 18,
    shine: '<path class="buddy-shine-ln" d="M58 74 Q46 98 44 122"/>',
  },
  bowl: {
    name: 'Монгол аяга',
    body: 'M14 92 H146 Q146 166 100 184 H60 Q14 166 14 92Z',
    waterTop: 98, waterH: 86, arms: { y: 118, left: 16, right: 144 }, feetY: null, faceDy: 8,
    front: '<rect class="buddy-cap" x="56" y="184" width="48" height="14" rx="5"/><path class="buddy-trim" d="M24 106 H136"/>',
  },
  cat: {
    name: 'Муур',
    body: 'M40 74 Q40 40 80 40 Q120 40 120 74 V196 A14 14 0 0 1 106 210 H54 A14 14 0 0 1 40 196Z',
    waterTop: 46, waterH: 164, arms: { y: 122, left: 41, right: 119 }, feetY: 214, faceDy: 0,
    behind: '<path class="buddy-ear" d="M44 64 L50 18 L78 44Z"/><path class="buddy-ear" d="M116 64 L110 18 L82 44Z"/><path class="buddy-ear-in" d="M52 52 L55 30 L68 44Z"/><path class="buddy-ear-in" d="M108 52 L105 30 L92 44Z"/>',
    front: '<path class="buddy-whisker" d="M50 136 H30 M50 142 L32 148 M110 136 H130 M110 142 L128 148"/>',
    shine: '<rect class="buddy-shine" x="50" y="70" width="7" height="60" rx="3.5"/>',
  },
  bear: {
    name: 'Баавгай',
    body: 'M80 36 A48 48 0 0 1 128 84 V190 A20 20 0 0 1 108 210 H52 A20 20 0 0 1 32 190 V84 A48 48 0 0 1 80 36Z',
    waterTop: 42, waterH: 168, arms: { y: 124, left: 33, right: 127 }, feetY: 214, faceDy: 0,
    behind: '<circle class="buddy-ear" cx="42" cy="50" r="17"/><circle class="buddy-ear" cx="118" cy="50" r="17"/><circle class="buddy-ear-in" cx="42" cy="50" r="8"/><circle class="buddy-ear-in" cx="118" cy="50" r="8"/>',
    front: '<ellipse class="buddy-snout" cx="80" cy="150" rx="15" ry="10"/><ellipse class="buddy-nose" cx="80" cy="146" rx="5" ry="3.5"/>',
    shine: '<rect class="buddy-shine" x="44" y="76" width="7" height="60" rx="3.5"/>',
  },
} satisfies Record<string, Avatar>;
export type AvatarId = keyof typeof AVATARS;

const AVATAR_KEY = 'dusal-avatar-v1';
export function readAvatar(): AvatarId {
  try { const v = localStorage.getItem(AVATAR_KEY); return v && Object.hasOwn(AVATARS, v) ? v as AvatarId : 'bottle'; } catch { return 'bottle'; }
}
export function writeAvatar(id: AvatarId): void {
  try { localStorage.setItem(AVATAR_KEY, id); } catch { /* keeps the default next time */ }
}

export type Face = 'happy' | 'beam' | 'sad' | 'worried';
const WAVE = 'M-160 8 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V240 H-160Z';
const MOUTHS: Record<Face, string> = {
  beam: 'M68 140 Q80 156 92 140',
  happy: 'M70 142 Q80 150 90 142',
  sad: 'M72 146 Q80 140 88 146',
  worried: 'M71 147 Q80 139 89 147',
};

// The whole character as SVG. `levelY` is the water's offset from full; `wave` raises the right arm.
export function avatarSvg(id: AvatarId, face: Face, levelY: number, wave: boolean, clipId = 'buddy-clip'): string {
  const a: Avatar = AVATARS[id];
  const { y, left, right } = a.arms;
  const feet = a.feetY === null ? '' : `<ellipse cx="62" cy="${a.feetY}" rx="13" ry="6"/><ellipse cx="98" cy="${a.feetY}" rx="13" ry="6"/>`;
  return `<svg viewBox="0 0 160 220" aria-hidden="true">
    <defs><clipPath id="${clipId}"><path d="${a.body}"/></clipPath></defs>
    ${a.behind ?? ''}
    <g class="buddy-limbs">
      <path class="buddy-arm left" d="M${left} ${y} Q${left - 17} ${y + 6} ${left - 19} ${y + 24}"/>
      <path class="buddy-arm right" d="${wave ? `M${right} ${y - 2} Q${right + 19} ${y - 12} ${right + 21} ${y - 32}` : `M${right} ${y} Q${right + 17} ${y + 6} ${right + 19} ${y + 24}`}"/>
      ${feet}
    </g>
    <path class="buddy-glass" d="${a.body}"/>
    <g clip-path="url(#${clipId})"><g class="buddy-water" style="transform: translateY(${levelY}px)">
      <g transform="translate(0 ${a.waterTop - 8})"><path class="buddy-wave back" d="${WAVE}"/><path class="buddy-wave" d="${WAVE}" transform="translate(0 4)"/></g>
    </g></g>
    <path class="buddy-outline" d="${a.body}"/>
    ${a.shine ?? ''}
    ${a.front ?? ''}
    <g class="buddy-face" transform="translate(0 ${a.faceDy})">
      <g class="buddy-eyes"><circle cx="64" cy="128" r="6"/><circle cx="96" cy="128" r="6"/></g>
      <circle class="buddy-glint" cx="66" cy="126" r="2"/><circle class="buddy-glint" cx="98" cy="126" r="2"/>
      <ellipse class="buddy-blush" cx="54" cy="142" rx="7" ry="4"/><ellipse class="buddy-blush" cx="106" cy="142" rx="7" ry="4"/>
      <path class="buddy-mouth" d="${MOUTHS[face]}"/>
    </g>
  </svg>`;
}

// Picker sheet: every character half full and smiling; tapping one saves it and redraws the home.
export function openAvatarPicker(onPick: (id: AvatarId) => void): void {
  const current = readAvatar();
  const box = document.createElement('div');
  box.className = 'cal avatar-picker';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'avatar-title');
  box.innerHTML = `<div class="cal-card">
    <div class="cal-top"><h2 id="avatar-title">Дүрээ сонго</h2><button type="button" class="cal-close" aria-label="Хаах">✕</button></div>
    <div class="avatar-grid" role="radiogroup" aria-label="Дүрүүд">${(Object.keys(AVATARS) as AvatarId[]).map(id => {
      const a: Avatar = AVATARS[id];
      return `<button type="button" class="avatar-opt${id === current ? ' on' : ''}" role="radio" aria-checked="${id === current}" data-avatar="${id}">
        ${avatarSvg(id, 'happy', a.waterH * 0.45, false, `clip-${id}`)}<span>${a.name}</span></button>`;
    }).join('')}</div>
  </div>`;
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelector('.cal-close')!.addEventListener('click', close);
  box.querySelectorAll<HTMLButtonElement>('[data-avatar]').forEach(b => b.addEventListener('click', () => {
    writeAvatar(b.dataset.avatar as AvatarId);
    close();
    onPick(b.dataset.avatar as AvatarId);
  }));
  box.querySelector<HTMLButtonElement>('.avatar-opt.on')?.focus();
}
