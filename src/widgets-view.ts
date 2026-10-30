import './widgets-view.css';
import { escape } from './format';
import { notify } from './components/Toast';
import { pinWidget, widgetsAvailable, type WidgetKind } from './widget';

// Profile → «Нүүр дэлгэцийн widget»: the five home screen widgets drawn small, each with «Нэмэх», which asks
// the launcher to place it (WidgetPlugin.pin), and the steps to add one by hand where the launcher cannot.
// The small drawings follow res/layout/widget_*.xml.
interface Item { kind: WidgetKind; name: string; size: string; about: string; preview: string }
const ITEMS: Item[] = [
  { kind: 'water', name: 'Өнөөдрийн ус', size: '2×2', about: 'Хэдэн удаа уусан, нийт хэмжээ, төлөв',
    preview: '<div class="wv wv-navy"><b class="wv-title">Өнөөдөр</b><small>💧 5 удаа</small><i></i><strong>1.2<small>л</small> <span class="wv-badge">▲</span><small>0.3</small></strong><em class="wv-white">Хэвийн</em></div>' },
  { kind: 'left', name: 'Үлдсэн хэмжээ', size: '2×2', about: 'Эмчийн хязгаараас үлдсэн хэмжээгээр ус буурна',
    preview: '<div class="wv wv-black"><span class="wv-water" style="height:60%"></span><b class="wv-title">Эмчийн хязгаар</b><i></i><strong>0.9 <small>л үлдсэн</small></strong><em class="ok">Хэвийн</em><em>Хязгаар 1,500 мл</em></div>' },
  { kind: 'ring', name: 'Цагираг', size: '2×2', about: 'Өнөөдрийн ус цагаан цагираг дотор',
    preview: '<div class="wv wv-black wv-center"><b class="wv-title">Өнөөдрийн ус</b><span class="wv-ring" style="--p:60"><strong>1.2</strong><small>/ 2.0 л</small></span><em>Хэвийн</em></div>' },
  { kind: 'mix', name: 'Ундааны задаргаа', size: '4×2', about: 'Ус, цай, шөл… тус бүрээр хэдийг уусан',
    preview: '<div class="wv wv-black wv-wide"><em><i class="d1">●</i> Ус 900 мл</em><em><i class="d2">●</i> Цай 300 мл</em><em><i class="d3">●</i> Шөл 250 мл</em><i></i><strong>1,450 <small>мл / 2,000</small></strong><span class="wv-stack"><i style="width:45%"></i><i style="width:15%"></i><i style="width:13%"></i></span></div>' },
  { kind: 'gauges', name: 'Гурван хэмжүүр', size: '4×1', about: 'Өнөөдрийн хувь, streak, 7 хоногийн биелэлт',
    preview: '<div class="wv wv-pill">' + [['💧', '60%', 60], ['🔥', '4', 57], ['📅', '5/7', 71]].map(([icon, value, p]) => `<span class="wv-gauge" style="--p:${p}"><span>${icon}</span><b>${value}</b></span>`).join('') + '</div>' },
];

const STEPS = ['Нүүр дэлгэцийн хоосон хэсэг дээр хуруугаа 1–2 секунд дарна.', 'Доор гарах цэснээс «Widgets»-ийг сонгоно.',
  'Жагсаалтаас «Дусал»-ыг олно.', 'Хүссэн widget-ээ дарж нүүр дэлгэц рүү чирч тавина.'];

// The widgets with «Нэмэх», and the steps by hand: on Profile and on the last onboarding step (onboarding.ts).
export function widgetPicker(): string {
  return `${ITEMS.map(w => `<section class="hx-card wv-card"><div class="wv-preview${w.size === '2×2' ? '' : ' wide'}">${w.preview}</div>
      <div class="wv-info"><b>${escape(w.name)}</b><small>${w.size} · ${escape(w.about)}</small>
      ${widgetsAvailable ? `<button type="button" class="hx-blue wv-add" data-widget="${w.kind}">Нэмэх</button>` : ''}</div></section>`).join('')}
    <section class="hx-card wv-steps" id="wv-steps"><h2 class="ac-card-title">Гараар нэмэх</h2><ol>${STEPS.map(s => `<li>${s}</li>`).join('')}</ol></section>`;
}

export function widgetsBody(): string {
  return `<p class="ac-small">Нүүр дэлгэцэндээ ус, эмчийн хязгаараа app нээлгүй харах жижиг цонх. «Нэмэх» дарахад утас хаана тавихыг асууна.</p>
    ${widgetPicker()}`;
}

export function bindWidgets(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-widget]').forEach(b => b.addEventListener('click', async () => {
    if (await pinWidget(b.dataset.widget as WidgetKind)) return;
    notify('Энэ утас шууд нэмэх боломжгүй байна. Доорх алхмаар нэмээрэй.');
    root.querySelector('#wv-steps')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
}
