let undoAction: (() => void) | undefined;
let undoTimer: ReturnType<typeof setTimeout> | undefined;

export function Toast(): string {
  return `<div class="toast" id="toast" role="status" aria-live="polite">
    <span></span><button id="undo" hidden>Буцаах</button>
  </div>`;
}

// The toast stays 5 s, or 10 s with «Буцаах»; `ms` sets it otherwise. `label` names the button when it does
// something else, e.g. «Унтраах» for an alarm.
export function notify(message: string, undo?: () => void, ms?: number, label = 'Буцаах'): void {
  clearTimeout(undoTimer);
  undoAction = undo;
  const toast = document.querySelector<HTMLDivElement>('#toast')!;
  const button = toast.querySelector('button')!;
  toast.querySelector('span')!.textContent = message;
  button.textContent = label;
  button.hidden = !undo;
  button.onclick = () => {
    const action = undoAction;
    undoAction = undefined;
    action?.();
  };
  toast.classList.add('visible');
  undoTimer = setTimeout(() => {
    toast.classList.remove('visible');
    undoAction = undefined;
  }, ms ?? (undo ? 10000 : 5000));
}
