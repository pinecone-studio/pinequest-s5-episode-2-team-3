const paths = {
  drop: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
export const icon = (name: keyof typeof paths) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

// App mark: a little water drop with a face, shown in the top bar of every page.
export const brandMark = () => `<svg class="brand-drop" viewBox="0 0 24 26" aria-hidden="true">
  <path d="M12 2C12 2 4 11 4 17a8 8 0 0 0 16 0C20 11 12 2 12 2Z" fill="#5aa9ff" stroke="#2f80ed" stroke-width="1.3"/>
  <path d="M8.6 9.6q-1.4 2-1.8 4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".85"/>
  <circle cx="9.4" cy="16" r="1.25" fill="#10233d"/><circle cx="14.6" cy="16" r="1.25" fill="#10233d"/>
  <circle cx="7.8" cy="18.4" r="1.2" fill="#ff9ec4"/><circle cx="16.2" cy="18.4" r="1.2" fill="#ff9ec4"/>
  <path d="M9.8 18.6q2.2 2 4.4 0" fill="none" stroke="#10233d" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;
