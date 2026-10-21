import { SyncStatus } from './SyncStatus';
import { dayKey, type WaterEntry } from '../data';
import { dateLabel, escape } from '../format';
import { icon } from './Icon';
import { siteNav } from '../nav';
import { EntryList } from './EntryList';
import { Toast } from './Toast';

export function EntryPage(events: readonly WaterEntry[], storageError: string): string {
  return `
    <a class="skip-link" href="#main">Агуулга руу очих</a>
    <main id="main" class="home entries-page" tabindex="-1">
      <div class="app-shell">
        <header class="app-top">
          <a class="brand" href="/" aria-label="Дусал нүүр"><span class="brand-mark">${icon('drop')}</span>Дусал</a>
          ${siteNav()}
          <span class="app-date">${dateLabel(dayKey())}</span>
        </header>
        <div class="entries-body">
          <div class="entries-head">
            <div><p class="panel-label">Усны хэрэглээ</p><h1>Ус бүртгэх</h1></div>
            <button class="dark-button" id="add-entry">${icon('plus')} Бүртгэх</button>
          </div>
          <p id="storage-error" class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
          ${SyncStatus()}
          <div class="quick-add" role="group" aria-labelledby="quick-add-label">
            <span id="quick-add-label">Хурдан нэмэх</span>
            ${[150, 250, 500].map(amount => `<button data-quick="${amount}"><span aria-hidden="true">+</span>${amount} мл</button>`).join('')}
          </div>
          <section class="entries" aria-labelledby="entries-title">
            <div class="section-heading">
              <h2 id="entries-title">Бүртгэлүүд</h2><span>${events.length} бүртгэл</span>
            </div>
            ${EntryList(events)}
          </section>
        </div>
      </div>
      <footer class="entries-footer"><span>Дусал</span><p>Мэдээлэл энэ браузерт хадгалагдана.</p></footer>
    </main>
    <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
    ${Toast()}
  `;
}
