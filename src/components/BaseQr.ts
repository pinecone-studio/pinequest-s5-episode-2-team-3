import { Capacitor } from '@capacitor/core';
import { baseQrUrl, qrSvg, type BaseLink } from '../base-qr';
import { escape } from '../format';
import { mdIcon } from './Icon';
import './base-qr.css';

// A sheet with the base's QR, big enough to scan off the screen, and a print button: printed and
// stuck on the base, it lets every family member join and connect by pointing a camera at it.
// The Android WebView cannot print, so there it suggests a screenshot instead.
export function openBaseQr(link: BaseLink): void {
  const canPrint = !Capacitor.isNativePlatform() && typeof window.print === 'function';
  const sheet = document.createElement('div');
  sheet.className = 'qr-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'qr-title');
  sheet.innerHTML = `<div class="qr-card">
    <button type="button" class="qr-close" aria-label="Хаах">${mdIcon('close')}</button>
    <h2 id="qr-title">${escape(link.name || 'Дусал суурь')}</h2>
    <div class="qr-code" role="img" aria-label="Суурийн QR код">${qrSvg(baseQrUrl(link))}</div>
    <p class="qr-id">Код: <b>${escape(link.baseId)}</b></p>
    <p class="qr-how">Утасны камераар уншуулбал гэр бүлд нэгдэнэ${link.bleId ? ', Дусал апп суурьтай шууд холбогдоно' : ''}.</p>
    ${canPrint ? `<button type="button" class="dark-button qr-print">Хэвлэх</button>` : '<p class="qr-how">Хэвлэхдээ дэлгэцийн зураг аваарай.</p>'}
  </div>`;
  document.body.append(sheet);
  const close = () => { sheet.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  sheet.querySelector('.qr-close')!.addEventListener('click', close);
  sheet.querySelector('.qr-print')?.addEventListener('click', () => window.print());
  sheet.querySelector<HTMLElement>('.qr-close')!.focus();
}
