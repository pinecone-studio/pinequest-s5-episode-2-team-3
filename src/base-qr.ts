import { renderSVG } from 'uqr';

// The QR stuck on a base. It is a link to the family page with the base in it, so an ordinary phone
// camera opens the web app ready to join, and the Android app reads the Bluetooth address from it
// to connect straight away, without the «Суурь хайх» device list.
export const SITE_URL: string = import.meta.env?.VITE_SITE_URL ?? 'https://dusal.bbek3201.workers.dev';

export interface BaseLink {
  baseId: string; // device ID = family ID
  bleId: string | null; // Android Bluetooth address (a browser has no stable one)
  name: string | null;
}

const BASE_ID = /^[a-zA-Z0-9-]{1,64}$/;
// Android gives a MAC address, iOS a UUID; both only hex digits with ':' or '-'.
const BLE_ID = /^[0-9A-Fa-f:-]{12,64}$/;

export function baseQrUrl(link: BaseLink): string {
  const url = new URL('/family.html', SITE_URL);
  url.searchParams.set('base', link.baseId);
  if (link.bleId) url.searchParams.set('ble', link.bleId);
  if (link.name) url.searchParams.set('name', link.name.slice(0, 40));
  return url.toString();
}

// Reads our link (from any host, so a local or preview build still works) or a bare base code.
export function parseBaseQr(text: string): BaseLink | null {
  const value = text.trim();
  if (BASE_ID.test(value)) return { baseId: value, bleId: null, name: null };
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  return fromParams(url.searchParams);
}

// The same fields from a page address (family.html?base=…), for when the camera app opened it.
export function fromParams(params: URLSearchParams): BaseLink | null {
  const baseId = params.get('base') ?? '';
  if (!BASE_ID.test(baseId)) return null;
  const ble = params.get('ble');
  const name = params.get('name')?.trim().slice(0, 40) || null;
  return { baseId, bleId: ble && BLE_ID.test(ble) ? ble : null, name };
}

export const qrSvg = (text: string) => renderSVG(text, { border: 2, pixelSize: 8 });
