// Every number the pet game runs on, in one place so the milestones can be tuned without touching
// the rules (pet-game.ts) or the page (achievements.ts). The animals themselves and the streak each one
// needs live in pet.ts (KINDS), next to their pictures.

// XP comes only from days that counted, never from extra water, so drinking past the goal earns nothing.
export const XP_PER_DAY = 100;
// Feeding the day's bowl adds a little on top; it can be claimed once per counted day.
export const XP_PER_FEED = 20;
export const XP_PER_LEVEL = 300;
// Every few levels the pet's glow and sparkles go up a step, to this many steps.
export const LEVELS_PER_SHINE = 2;
export const MAX_SHINE = 4;

// The bowl shows how many of the last few days the pet was fed.
export const ENERGY_DAYS = 5;

// Badges, by the longest streak ever (the first one by the first day that counted), so a break keeps them.
export const BADGES = [
  { id: 'first', name: 'Анхны дусал', need: 1 },
  { id: 'd3', name: '3 өдөр дараалан', need: 3 },
  { id: 'd7', name: '7 хоногийн аварга', need: 7 },
  { id: 'd14', name: '2 долоо хоногийн баатар', need: 14 },
  { id: 'd30', name: 'Сарын мастер', need: 30 },
  { id: 'd100', name: 'Домогт усчин', need: 100 },
] as const;
export type BadgeId = (typeof BADGES)[number]['id'];
