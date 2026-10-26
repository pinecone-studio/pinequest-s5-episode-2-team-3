// Account settings of the Hydrify demo that live only on this phone: the onboarding answers the
// profile does not keep (sex, climate), preferences, the reminder mode, security switches, the plan,
// payment methods, theme and language. Each is one JSON object read with its defaults filled in.
function store<T extends object>(key: string, defaults: T) {
  return {
    read(): T {
      try { const v = JSON.parse(localStorage.getItem(key) ?? 'null'); return v && typeof v === 'object' ? { ...defaults, ...v } : { ...defaults }; } catch { return { ...defaults }; }
    },
    write(patch: Partial<T>): T {
      const next = { ...this.read(), ...patch };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* defaults next time */ }
      return next;
    },
  };
}

export const about = store('dusal-profile-extra-v1', { sex: 'none' as 'male' | 'female' | 'none', climate: 'mild' as 'hot' | 'mild' | 'cold' });

export const prefs = store('dusal-prefs-v1', {
  cupUnit: 'мл', weightUnit: 'кг', heightUnit: 'см', weekStart: 'Даваа', timeFormat: 'Системийн', dayReset: '00:00',
  achievements: true, haptics: true,
});

// The reminders themselves (on, wake, sleep, every) stay in schedule.ts; these are the kit's extras.
export const reminder = store('dusal-reminder-extra-v1', {
  mode: 'interval' as 'static' | 'interval' | 'level',
  repeat: 'Өдөр бүр', sound: 'Усны дусал', skip: '10 мин', stopFull: true,
  times: ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']
    .map(t => ({ t, on: t >= '08:00' && t <= '20:00' })),
});

export const security = store('dusal-security-v1', { biometric: false, faceId: false, sms: false, google: false });
export const linked = store('dusal-linked-v1', { google: true, apple: true, facebook: false, twitter: false });
export const analytics = store('dusal-analytics-v1', { usage: true, ads: false });

export type Plan = 'free' | 'month' | 'year';
export const plan = store('dusal-premium-v1', { plan: 'free' as Plan, since: '' });

export interface PayMethod { id: string; name: string; detail: string; brand: string }
export const payments = store('dusal-payments-v1', {
  list: [
    { id: 'paypal', name: 'PayPal', detail: 'sarnai@dusal.mn', brand: 'paypal' },
    { id: 'gpay', name: 'Google Pay', detail: 'sarnai@dusal.mn', brand: 'google' },
    { id: 'apple', name: 'Apple Pay', detail: 'sarnai@dusal.mn', brand: 'apple' },
    { id: 'mc', name: 'Mastercard', detail: '•••• •••• •••• 4679', brand: 'mastercard' },
    { id: 'visa', name: 'Visa', detail: '•••• •••• •••• 5567', brand: 'visa' },
  ] as PayMethod[],
  selected: 'mc',
});

export const look = store('dusal-look-v1', { theme: 'light' as 'system' | 'light' | 'dark', language: 'mn' });

// Puts the theme on <html>; "system" follows the phone. Called on every page (nav.ts).
export function applyTheme(): void {
  const { theme } = look.read();
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
