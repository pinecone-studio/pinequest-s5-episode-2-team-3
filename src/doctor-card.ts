import { askDoctor, type DoctorRead } from './api';
import { escape, number } from './format';
import { mdIcon } from './components/Icon';
import { readProfile, writeProfile } from './plan';
import { readSettings, writeSettings } from './schedule';
import { askPermission, nativeReminders } from './native-reminders';

// Home card for people under a doctor's care (heart or kidney failure): they type the doctor's fluid
// instructions or photograph the paper, the AI reads them (POST /api/doctor), and only after the person
// checks what it understood does the app take the amount as the goal or limit and set the reminders.
// The home redraws often, so what is typed and the AI's answer live here, not in the page.
let text = '';
let photo: { mediaType: string; data: string; name: string } | null = null;
let asking = false;
let read: DoctorRead | null = null;
let error = '';
let done = '';

const kind = (mode: 'goal' | 'limit') => (mode === 'limit' ? 'хамгийн ихдээ' : 'дор хаяж');

function resultBlock(): string {
  if (error) return `<p class="doc-error" role="alert">${escape(error)}</p>`;
  if (done) return `<p class="doc-done" role="status">${mdIcon('check')} ${escape(done)}</p>`;
  if (!read) return '';
  if (!read.found) return `<p class="doc-error" role="alert">${escape(read.warning || read.summary)}</p>`;
  return `<div class="doc-read" role="status">
    <p class="doc-amount">Өдөрт ${kind(read.mode)} <b>${number(read.ml)} мл</b></p>
    ${read.summary ? `<p class="doc-summary">${escape(read.summary)}</p>` : ''}
    ${read.times.length ? `<ol class="doc-times">${read.times.map(t => `<li><span>${t.at}</span><b>${number(t.ml)} мл</b></li>`).join('')}</ol>` : '<p class="doc-summary">Сануулга таны сэрэх, унтах цагийн хооронд тэгш хуваагдана.</p>'}
    ${read.warning ? `<p class="doc-warning">${escape(read.warning)}</p>` : ''}
    <p class="doc-check">Эмчийн бичигтэй тулгаад зөв бол батлаарай.</p>
    <div class="doc-actions"><button type="button" class="hx-light" data-doc-cancel>Цуцлах</button><button type="button" class="hx-blue" data-doc-apply>Батлах, сануулга тавих</button></div>
  </div>`;
}

export function doctorCard(): string {
  const times = readSettings().times;
  return `<section class="hx-card doctor-card" aria-labelledby="doc-title">
    <h2 id="doc-title"><span aria-hidden="true">🩺</span> Эмчийн заавар</h2>
    <p class="doc-intro">Эмчийн заавраа бичих эсвэл бичгийн зургийг оруулбал AI өдрийн хэмжээ, уух цагийг тань тохируулна.</p>
    ${times ? `<p class="doc-now">Одоогийн хуваарь: ${times.map(t => `${t.at} · ${number(t.ml)} мл`).join(', ')}</p>` : ''}
    <label class="visually-hidden" for="doc-text">Эмчийн заавар</label>
    <textarea id="doc-text" rows="3" maxlength="2000" placeholder="Жишээ: Өдөрт 1.5 литрээс хэтрүүлэхгүй. Өглөө 8, өдөр 12, орой 18 цагт 300 мл.">${escape(text)}</textarea>
    <div class="doc-row">
      <label class="file-button doc-photo"><span aria-hidden="true">📷</span><span>${photo ? escape(photo.name) : 'Зураг'}</span><input type="file" id="doc-photo" accept="image/*"/></label>
      ${photo ? '<button type="button" class="text-button" data-doc-unphoto>Зураг хасах</button>' : ''}
      <button type="button" class="hx-blue doc-ask" data-doc-ask ${asking ? 'disabled' : ''}>${asking ? 'Уншиж байна…' : 'AI-д өгөх'}</button>
    </div>
    ${resultBlock()}
  </section>`;
}

// A phone photo is several MB; 1600 px JPEG keeps the writing readable and the request small.
async function shrink(file: File): Promise<{ mediaType: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { mediaType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

// `apply` saves the amount as the goal or limit (overview.ts); true once it is saved.
export function bindDoctorCard(redraw: () => void, apply: (ml: number, mode: 'goal' | 'limit') => Promise<boolean>): void {
  const card = document.querySelector<HTMLElement>('.doctor-card');
  if (!card) return;
  card.querySelector<HTMLTextAreaElement>('#doc-text')!.addEventListener('input', e => { text = (e.target as HTMLTextAreaElement).value; });
  card.querySelector<HTMLInputElement>('#doc-photo')!.addEventListener('change', async e => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try { photo = { ...(await shrink(file)), name: file.name.length > 18 ? 'Зураг ✓' : file.name }; error = ''; }
    catch { error = 'Зургийг уншиж чадсангүй. Өөр зураг оролдоно уу.'; }
    read = null; done = '';
    redraw();
  });
  card.querySelector('[data-doc-unphoto]')?.addEventListener('click', () => { photo = null; redraw(); });
  card.querySelector('[data-doc-ask]')!.addEventListener('click', async () => {
    if (!text.trim() && !photo) { error = 'Эмчийн заавраа бичих эсвэл зургийг нь оруулна уу.'; redraw(); return; }
    const s = readSettings();
    asking = true; error = ''; read = null; done = '';
    redraw();
    try { read = await askDoctor({ text, image: photo ? { mediaType: photo.mediaType, data: photo.data } : undefined, wake: s.wake, sleep: s.sleep }); }
    catch (err) { error = (err as Error).message; }
    asking = false;
    redraw();
  });
  card.querySelector('[data-doc-cancel]')?.addEventListener('click', () => { read = null; redraw(); });
  card.querySelector('[data-doc-apply]')?.addEventListener('click', async () => {
    if (!read?.found) return;
    const r = read;
    writeProfile({ ...readProfile(), doctorLimit: r.ml, doctorMode: r.mode });
    if (!(await apply(r.ml, r.mode))) { error = 'Хадгалж чадсангүй. Дахин оролдоно уу.'; redraw(); return; }
    const on = nativeReminders ? await askPermission().catch(() => false) : readSettings().on;
    writeSettings({ ...readSettings(), times: r.times.length ? r.times : undefined, on });
    read = null; text = ''; photo = null;
    done = `Өдөрт ${kind(r.mode)} ${number(r.ml)} мл боллоо.${on ? ' Сануулга тавигдлаа.' : ' Сануулгыг Профайл → Уух сануулга дотроос асаана уу.'}`;
    redraw();
  });
}
