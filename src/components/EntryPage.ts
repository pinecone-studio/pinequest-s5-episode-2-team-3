import type { WaterEntry } from '../data';
import { escape } from '../format';
import { icon } from './Icon';
import { EntryList } from './EntryList';
import { Toast } from './Toast';

export function EntryPage(events: readonly WaterEntry[], storageError: string): string {
  return `
    <a class="skip-link" href="#main">Агуулга руу очих</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="#main" aria-label="Дусал нүүр">
          ${icon('drop')}Дусал<span>/ усны бүртгэл</span>
        </a>
        <nav class="site-nav" aria-label="Хэсгүүд">
          <a href="/overview.html">Өдрийн тойм</a><a href="/" aria-current="page">Ус бүртгэх</a><a href="/settings.html">Тохиргоо</a>
        </nav>
        <span class="connection">Гараар бүртгэж байна</span>
      </div>
    </header>
    <main id="main" tabindex="-1">
      <div class="page-heading">
        <div><p class="page-kicker">УСНЫ ХЭРЭГЛЭЭ</p><h1>Ус бүртгэх</h1></div>
        <button class="primary-button" id="add-entry">${icon('plus')} Бүртгэх</button>
      </div>
      <p id="storage-error" class="storage-error" role="alert" ${storageError ? '' : 'hidden'}>${escape(storageError)}</p>
      <div class="quick-add">
        <span>Хурдан нэмэх</span>
        ${[150, 250, 500].map(amount => `<button data-quick="${amount}">+${amount} мл</button>`).join('')}
      </div>
      <section class="entries" aria-labelledby="entries-title">
        <div class="section-heading">
          <h2 id="entries-title">Бүртгэлүүд</h2><span>${events.length} бүртгэл</span>
        </div>
        ${EntryList(events)}
      </section>
      <footer><span>Дусал</span><p>Мэдээлэл энэ браузерт хадгалагдана.</p></footer>
    </main>
    <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
    ${Toast()}
  `;
}
