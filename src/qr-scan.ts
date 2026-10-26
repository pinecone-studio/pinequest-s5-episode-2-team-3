import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import './components/base-qr.css';

// One QR read with the camera; resolves the text, or null when the person closes the scanner.
// Android uses Google's ready-made scanner screen (no camera permission of our own needed); a
// browser with BarcodeDetector (Chrome on Android, most desktops) gets a small camera sheet.
export class ScanError extends Error {}

export async function scanQr(): Promise<string | null> {
  return Capacitor.isNativePlatform() ? scanNative() : scanWeb();
}

async function scanNative(): Promise<string | null> {
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    // Play services downloads the scanner once, in the background.
    await BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {});
    throw new ScanError('QR уншигчийг суулгаж байна. Хэдэн секундын дараа дахин оролдоно уу.');
  }
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    return barcodes[0]?.rawValue ?? null;
  } catch (error) {
    if (error instanceof Error && /cancel/i.test(error.message)) return null;
    throw new ScanError('QR уншиж чадсангүй. Дахин оролдоно уу.');
  }
}

interface Detector { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
type DetectorClass = new (options: { formats: string[] }) => Detector;

async function scanWeb(): Promise<string | null> {
  const Detector = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (!Detector || !navigator.mediaDevices?.getUserMedia) throw new ScanError('Энэ хөтөч QR уншиж чадахгүй. Суурийн кодыг гараар оруулна уу.');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    throw new ScanError('Камер ашиглах зөвшөөрөл өгнө үү, эсвэл кодыг гараар оруулна уу.');
  }
  const detector = new Detector({ formats: ['qr_code'] });
  const sheet = document.createElement('div');
  sheet.className = 'qr-scan';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'QR уншуулах');
  sheet.innerHTML = `<div class="qr-scan-card"><video playsinline muted></video><p>Суурийн QR-ийг дөрвөлжин дотор оруулна уу</p>
    <button type="button" class="qr-scan-close">Болих</button></div>`;
  document.body.append(sheet);
  const video = sheet.querySelector('video')!;
  video.srcObject = stream;
  await video.play().catch(() => {});

  return new Promise(resolve => {
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      stream.getTracks().forEach(t => t.stop());
      sheet.remove();
      resolve(value);
    };
    sheet.querySelector('.qr-scan-close')!.addEventListener('click', () => finish(null));
    sheet.addEventListener('keydown', e => { if (e.key === 'Escape') finish(null); });
    const look = async () => {
      if (done) return;
      const found = await detector.detect(video).catch(() => []);
      if (found[0]?.rawValue) finish(found[0].rawValue); else setTimeout(look, 250);
    };
    void look();
  });
}
