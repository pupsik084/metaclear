import { onLangChange, t } from '@/i18n';
import { createDropZone } from '@/ui/DropZone';
import { renderFileCard } from '@/ui/FileCard';
import { createHeader } from '@/ui/Header';
import { createFooter, createPrivacyBanner } from '@/ui/Footer';
import { applyTheme, getSettings } from '@/ui/settings';
import { cleanAll, getItems, onItemsChange, removeAll } from '@/ui/state';
import { el } from '@/ui/utils';
import logoSvg from './assets/logo.svg?raw';

type Route = 'home' | 'super';

export function mountApp(root: HTMLElement): void {
  applyTheme(getSettings().theme);

  const container = el('div', { className: 'flex min-h-screen flex-col' });
  container.append(createHeader(logoSvg));

  const main = el('main', {
    className: 'mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:px-6',
  });

  const view = el('div');
  main.append(view);

  container.append(main);
  container.append(createFooter());
  root.append(container);

  const route = (): Route => {
    const hash = window.location.hash || '#/';
    return hash.startsWith('#/super') ? 'super' : 'home';
  };

  const render = (): void => {
    view.innerHTML = '';
    if (route() === 'super') {
      void (async () => {
        const { createSuperMode } = await import('@/ui/SuperMode');
        view.append(createSuperMode());
      })();
      return;
    }
    renderHome(view);
  };

  window.addEventListener('hashchange', render);
  onLangChange(render);
  onItemsChange((items) => {
    if (route() === 'home') {
      renderHome(view, items);
    }
  });
  render();
}

function renderHome(view: HTMLElement, itemsArg?: ReturnType<typeof getItems>): void {
  view.innerHTML = '';

  view.append(createPrivacyBanner());

  // Hero
  const hero = el('section', { className: 'mb-6 text-center sm:mb-10' });
  hero.append(
    el('h1', {
      className: 'text-3xl font-semibold tracking-tight sm:text-5xl',
      text: t('app.tagline'),
    }),
  );
  hero.append(
    el('p', {
      className: 'mx-auto mt-3 max-w-2xl text-sm text-ink-400 sm:text-base',
      text: t('app.subtitle'),
    }),
  );
  view.append(hero);

  // Drop zone
  view.append(createDropZone());

  // Items
  const items = itemsArg ?? getItems();
  if (items.length > 0) {
    const actions = el('div', { className: 'mt-6 flex flex-wrap gap-2' });
    const cleanAllBtn = el('button', {
      className: 'btn btn-primary',
      text: t('actions.clean_all'),
      onClick: () => void cleanAll(),
    });
    actions.append(cleanAllBtn);

    const hasDone = items.some((i) => i.status === 'done' && i.downloadUrl);
    if (hasDone) {
      const dlAll = el('button', {
        className: 'btn btn-outline',
        text: t('actions.download_all'),
        onClick: () => void downloadAllZip(),
      });
      actions.append(dlAll);
    }

    const clearList = el('button', {
      className: 'btn btn-ghost',
      text: t('actions.clear_list'),
      onClick: () => removeAll(),
    });
    actions.append(clearList);
    view.append(actions);

    const list = el('div', { className: 'mt-6 grid gap-3' });
    for (const it of items) list.append(renderFileCard(it));
    view.append(list);
  }
}

async function downloadAllZip(): Promise<void> {
  const items = getItems().filter((i) => i.status === 'done' && i.result && i.outputName);
  if (items.length === 0) return;
  const { downloadZip } = await import('client-zip');
  const files = items.map((i) => ({
    name: i.outputName ?? 'clean.bin',
    lastModified: new Date(),
    input: i.result!.output as Uint8Array,
  }));
  const blob = await downloadZip(files).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `metaclear-${Date.now()}.zip`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
