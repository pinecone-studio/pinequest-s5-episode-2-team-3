import { expect, test } from 'bun:test';
import { SITE_URL, baseQrUrl, fromParams, parseBaseQr, qrSvg } from '../src/base-qr';

const link = { baseId: 'bottle-01', bleId: 'AA:BB:CC:DD:EE:FF', name: 'Гал тогооны суурь' };

test('the QR is a link to the family page that reads back the same base', () => {
  const url = baseQrUrl(link);
  expect(url.startsWith(`${SITE_URL}/family.html?base=bottle-01`)).toBe(true);
  expect(parseBaseQr(url)).toEqual(link);
});

test('without a Bluetooth address (browser) only the base comes through', () => {
  expect(parseBaseQr(baseQrUrl({ baseId: 'bottle-01', bleId: null, name: null }))).toEqual({ baseId: 'bottle-01', bleId: null, name: null });
});

test('a bare base code typed or printed on its own also works', () => {
  expect(parseBaseQr('  bottle-02 ')).toEqual({ baseId: 'bottle-02', bleId: null, name: null });
});

test('other QR codes and bad fields are rejected or dropped', () => {
  expect(parseBaseQr('https://example.com/menu')).toBeNull();
  expect(parseBaseQr('WIFI:S:home;T:WPA;P:secret;;')).toBeNull();
  expect(parseBaseQr('https://dusal.example/family.html?base=bad%20id')).toBeNull();
  // An address that is not hex is ignored, so the app never tries to connect to it.
  expect(fromParams(new URLSearchParams('base=bottle-01&ble=<script>'))).toEqual({ baseId: 'bottle-01', bleId: null, name: null });
});

test('the code is drawn as an SVG', () => {
  const svg = qrSvg(baseQrUrl(link));
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg.length).toBeGreaterThan(1000);
});
