import { dayKey, TYPES, type WaterEntry } from './data';
import { time } from './format';

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

// Oldest first with local date and time, so the file reads like a log.
export function entriesCsv(events: readonly WaterEntry[]): string {
  const rows = [...events]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map(event => [dayKey(new Date(event.at)), time(event.at), TYPES[event.type], event.amount]);
  return [['Огноо', 'Цаг', 'Төрөл', 'Хэмжээ (мл)'], ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

// The BOM makes Excel open the Cyrillic text as UTF-8.
export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
