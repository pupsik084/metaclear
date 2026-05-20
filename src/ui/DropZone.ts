import { t, onLangChange } from '@/i18n';
import { addFiles } from './state';
import { el } from './utils';

/** Большая drop-зона — основной экран. */
export function createDropZone(): HTMLElement {
  const wrap = el('div', { className: 'w-full' });

  let dragCounter = 0;

  const onDragEnter = (e: DragEvent): void => {
    e.preventDefault();
    dragCounter++;
    box.classList.add('border-cyan', 'bg-cyan/5');
  };
  const onDragOver = (e: DragEvent): void => {
    e.preventDefault();
  };
  const onDragLeave = (e: DragEvent): void => {
    e.preventDefault();
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) box.classList.remove('border-cyan', 'bg-cyan/5');
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    dragCounter = 0;
    box.classList.remove('border-cyan', 'bg-cyan/5');
    if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files);
  };

  const input = el('input', {
    className: 'sr-only',
    attrs: { type: 'file', multiple: 'true' },
  }) as HTMLInputElement;
  input.addEventListener('change', () => {
    if (input.files?.length) {
      void addFiles(input.files);
      input.value = '';
    }
  });

  const box = el('label', {
    className:
      'group relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-white/10 bg-ink-900/40 px-6 py-16 text-center transition-colors hover:border-white/20 hover:bg-ink-900/60 sm:py-24',
  });
  box.append(input);
  box.addEventListener('dragenter', onDragEnter);
  box.addEventListener('dragover', onDragOver);
  box.addEventListener('dragleave', onDragLeave);
  box.addEventListener('drop', onDrop);

  const icon = el('div', {
    className: 'mb-2 text-cyan',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  });
  const title = el('div', { className: 'text-2xl font-semibold sm:text-3xl' });
  const sub = el('div', { className: 'text-sm text-ink-400' });
  const hint = el('div', { className: 'mt-3 max-w-md text-xs text-ink-500' });

  const refresh = (): void => {
    title.textContent = t('drop.title');
    sub.textContent = t('drop.subtitle');
    hint.textContent = t('drop.hint');
  };
  refresh();
  onLangChange(refresh);

  box.append(icon, title, sub, hint);

  // Глобальный drag-and-drop — на всю страницу
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files);
  });

  wrap.append(box);
  return wrap;
}
