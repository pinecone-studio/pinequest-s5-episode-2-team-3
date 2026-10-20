export const STORAGE_KEY = 'dusal-v1';
export const TYPES = { drink: 'Уусан', spill: 'Асгасан', pending: 'Тодорхойгүй' };
// Preserve the shared storage format; this part only edits events.
export const defaults = () => ({ goal: 2000, mode: 'goal', events: [] });

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localInput(date = new Date()) {
  return `${dayKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function validateState(data) {
  if (!data || !Number.isInteger(data.goal) || data.goal < 50 || data.goal > 10000 ||
      !['goal', 'limit'].includes(data.mode) || !Array.isArray(data.events)) {
    throw new Error('Файлын бүтэц эсвэл өдрийн тохиргоо буруу байна.');
  }
  const ids = new Set();
  const events = data.events.map(event => {
    if (!event || typeof event.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(event.id) ||
        ids.has(event.id) || !Number.isInteger(event.amount) || event.amount < 1 || event.amount > 5000 ||
        typeof event.type !== 'string' || !Object.hasOwn(TYPES, event.type) || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at))) {
      throw new Error('Файлд хүчингүй эсвэл давхардсан бүртгэл байна.');
    }
    ids.add(event.id);
    return { id: event.id, amount: event.amount, type: event.type, at: new Date(event.at).toISOString() };
  });
  return { goal: data.goal, mode: data.mode, events };
}

export function sortedEvents(events) {
  return [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
