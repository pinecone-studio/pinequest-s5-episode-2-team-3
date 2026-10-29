import type { Condition } from '../shared/plan';

// What the home's «⋯» menu offers, decided by the diagnosis in the profile (not by the mode alone,
// so a heart patient under a limit never sees dialysis). Most used first.
// «Цангаж байна» only helps under a limit; without one the reminders take its place. The base has its own
// row on the home and on «Профайл», so it is not here.
export type HomeAction = 'thirst' | 'dialysis' | 'plan' | 'reminder';

export function homeActions(condition: Condition, mode: 'goal' | 'limit'): HomeAction[] {
  const limit = mode === 'limit';
  if (condition === 'kidney') return limit ? ['thirst', 'dialysis', 'plan'] : ['dialysis', 'plan', 'reminder'];
  if (condition === 'heart') return limit ? ['thirst', 'plan'] : ['plan', 'reminder'];
  return ['plan', 'reminder'];
}
