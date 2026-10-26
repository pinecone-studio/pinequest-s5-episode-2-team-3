// This phone's family member: the name and buddy others see on the family leaderboard (shared/family.ts).
// No password or email: the random ID is the member's key and never leaves this phone except in its
// own reports, so nobody can write another member's numbers. The buddy is the home screen's avatar.
const MEMBER_KEY = 'dusal-member-v1';

export interface Member { id: string; name: string }

// The server's rule (validateReport): spaces collapsed, 1–24 characters.
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function readMember(): Member | null {
  try {
    const m = JSON.parse(localStorage.getItem(MEMBER_KEY) ?? 'null') as Partial<Member> | null;
    return m && typeof m.id === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(m.id) && typeof m.name === 'string' && cleanName(m.name)
      ? { id: m.id, name: cleanName(m.name) }
      : null;
  } catch { return null; }
}

// Saves the name, keeping the ID a phone already has so its leaderboard history stays its own.
export function saveMember(name: string): Member | null {
  const clean = cleanName(name);
  if (!clean) return null;
  const member = { id: readMember()?.id ?? crypto.randomUUID(), name: clean };
  try { localStorage.setItem(MEMBER_KEY, JSON.stringify(member)); } catch { return null; }
  return member;
}
