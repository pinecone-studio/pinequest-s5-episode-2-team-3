import { Capacitor } from '@capacitor/core';

// "Google-ээр үргэлжлүүлэх" on the signup screen. Only the name and email are read to fill the profile;
// no token is sent anywhere, the app has no accounts on the server yet.
// - Web: Google Identity Services shows the account picker and hands back an ID token.
// - Android app: Google does not allow that inside a WebView, so the native account picker
//   (@capgo/capacitor-social-login, Credential Manager) is used. It needs an Android OAuth client in the
//   same Google Cloud project with package mn.pinecone.dusal and the SHA-1 of the key that signs the APK.
// Both use the Web client ID (project "dusal", public by design; origins dusal.bbek3201.workers.dev and
// localhost:5173). Override it with VITE_GOOGLE_CLIENT_ID.
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '253911522297-p7ulev5jt6lo8qv674m50j6h5776gr3h.apps.googleusercontent.com';
const native = () => Capacitor.getPlatform() === 'android';

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

function webSignIn(): Promise<GoogleUser> {
  return loadGsi().catch(() => { throw new Error('Google-д холбогдож чадсангүй. Интернэтээ шалгана уу.'); }).then(gsi => new Promise((ok, fail) => {
    gsi.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: 'popup',
      cancel_on_tap_outside: true,
      callback: r => { try { ok(readToken(r.credential)); } catch { fail(new Error('Google-ийн хариуг уншиж чадсангүй.')); } },
    });
    gsi.accounts.id.prompt(n => {
      if (n.isNotDisplayed() || n.isSkippedMoment()) fail(new Error('Google цонх нээгдсэнгүй. Хөтчийн гуравдагч талын cookie-г зөвшөөрөөд дахин оролдоно уу.'));
    });
  }));
}

let nativeReady: Promise<void> | undefined;
async function nativeSignIn(): Promise<GoogleUser> {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  nativeReady ??= SocialLogin.initialize({ google: { webClientId: GOOGLE_CLIENT_ID, mode: 'online' } }).catch(e => { nativeReady = undefined; throw e; });
  await nativeReady;
  let res;
  try {
    res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(text)) throw new Error('Google-ээр нэвтрэхийг цуцаллаа.');
    throw new Error('Google-ээр нэвтэрч чадсангүй. Утсанд Google данс нэмэгдсэн эсэхийг шалгана уу.');
  }
  const r = res.result;
  if (r.responseType !== 'online') throw new Error('Google-ийн хариуг уншиж чадсангүй.');
  const name = r.profile.givenName || r.profile.name || '';
  if (!name && r.idToken) return readToken(r.idToken);
  return { name: name.slice(0, 24), email: r.profile.email ?? '' };
}

// Resolves with the picked account, or rejects with a message for the person.
export async function signInWithGoogle(): Promise<GoogleUser> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google нэвтрэлт тохируулагдаагүй байна.');
  if (native()) return nativeSignIn();
  if (Capacitor.isNativePlatform()) throw new Error('Энэ төхөөрөмж дээр Google нэвтрэлт хараахан алга. Нэрээ бичээд үргэлжлүүлнэ үү.');
  return webSignIn();
}
