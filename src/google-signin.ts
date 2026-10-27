import { Capacitor } from '@capacitor/core';

// "Google-ээр үргэлжлүүлэх" on the signup screen: Google Identity Services shows the account picker and
// hands back an ID token, from which only the name and email are read to fill the profile. The token is
// not sent anywhere; the app has no accounts on the server yet. Needs VITE_GOOGLE_CLIENT_ID (a Web
// client ID from Google Cloud with this site's origin allowed). Google does not allow this sign-in
// inside an app's WebView, so the Android app keeps the name field instead.
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
export const googleAvailable = () => Boolean(GOOGLE_CLIENT_ID) && !Capacitor.isNativePlatform();

export interface GoogleUser { name: string; email: string }

type Gsi = {
  accounts: { id: {
    initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; cancel_on_tap_outside?: boolean }): void;
    prompt(notify?: (n: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void): void;
  } };
};

let script: Promise<Gsi> | undefined;
function loadGsi(): Promise<Gsi> {
  return script ??= new Promise((ok, fail) => {
    const el = document.createElement('script');
    el.src = 'https://accounts.google.com/gsi/client';
    el.async = true;
    el.onload = () => { const g = (window as unknown as { google?: Gsi }).google; if (g) ok(g); else fail(new Error('gsi')); };
    el.onerror = () => { script = undefined; fail(new Error('gsi')); };
    document.head.append(el);
  });
}

// The ID token's middle part is base64url JSON; only display fields are taken from it.
function readToken(credential: string): GoogleUser {
  const part = credential.split('.')[1] ?? '';
  const json = decodeURIComponent(Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
  const p = JSON.parse(json) as { name?: string; given_name?: string; email?: string };
  return { name: (p.given_name || p.name || '').slice(0, 24), email: p.email ?? '' };
}

// Resolves with the picked account, or rejects with a message for the person.
export async function signInWithGoogle(): Promise<GoogleUser> {
  if (!googleAvailable()) throw new Error(Capacitor.isNativePlatform() ? 'Апп дотор Google нэвтрэлт удахгүй нэмэгдэнэ. Нэрээ бичээд үргэлжлүүлнэ үү.' : 'Google нэвтрэлт тохируулагдаагүй байна.');
  let gsi: Gsi;
  try { gsi = await loadGsi(); } catch { throw new Error('Google-д холбогдож чадсангүй. Интернэтээ шалгана уу.'); }
  return new Promise((ok, fail) => {
    gsi.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: 'popup',
      cancel_on_tap_outside: true,
      callback: r => { try { ok(readToken(r.credential)); } catch { fail(new Error('Google-ийн хариуг уншиж чадсангүй.')); } },
    });
    gsi.accounts.id.prompt(n => {
      if (n.isNotDisplayed() || n.isSkippedMoment()) fail(new Error('Google цонх нээгдсэнгүй. Хөтчийн гуравдагч талын cookie-г зөвшөөрөөд дахин оролдоно уу.'));
    });
  });
}
