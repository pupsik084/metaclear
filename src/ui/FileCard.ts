import type { ProcessingItem } from '@/types';
import { t, onLangChange } from '@/i18n';
import { renderMetaPreview } from './MetaPreview';
import { cleanItem, markDownloaded, removeItem } from './state';
import { el, formatBytes } from './utils';

export function renderFileCard(item: ProcessingItem): HTMLElement {
  const card = el('div', { className: 'surface p-4 sm:p-5' });

  const head = el('div', { className: 'flex items-start gap-3' });
  head.append(renderTypeBadge(item));

  const meta = el('div', { className: 'min-w-0 flex-1' });
  const title = el('div', {
    className: 'truncate text-base font-medium',
    text: item.file.name,
  });
  const sub = el('div', {
    className: 'mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400',
  });
  sub.append(el('span', { text: item.type.label }));
  sub.append(el('span', { text: '·' }));
  sub.append(el('span', { text: formatBytes(item.file.size) }));
  if (item.metadata?.device) {
    sub.append(el('span', { text: '·' }));
    sub.append(el('span', { text: item.metadata.device }));
  }
  meta.append(title, sub);
  head.append(meta);

  const removeBtn = el('button', {
    className: 'btn btn-ghost px-2 py-1 text-xs',
    text: '✕',
    attrs: { 'aria-label': t('card.remove') },
    onClick: () => removeItem(item.id),
  });
  head.append(removeBtn);

  card.append(head);

  // RAW notice
  if (item.type.family === 'raw') {
    const notice = el('div', {
      className:
        'mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200',
    });
    notice.append(el('div', { text: t('raw.notice') }));
    notice.append(
      el('a', {
        className: 'mt-1 inline-flex text-xs text-cyan hover:underline',
        text: t('raw.open_super'),
        attrs: { href: '#/super' },
      }),
    );
    card.append(notice);
  }

  // Прочитанные метаданные
  if (item.status === 'ready' || item.status === 'cleaning' || item.status === 'done') {
    const found = el('details', { className: 'mt-3' });
    const summary = el('summary', {
      className: 'cursor-pointer text-sm font-medium text-ink-200 hover:text-ink-100',
      text: t('card.found') + (item.metadata ? ` (${item.metadata.totalCount})` : ''),
    });
    found.append(summary);
    if (item.metadata) {
      found.append(renderMetaPreview(item.metadata));
    }
    found.open = (item.metadata?.totalCount ?? 0) > 0;
    card.append(found);
  }

  // Действия
  const actions = el('div', { className: 'mt-4 flex flex-wrap items-center gap-2' });

  if (item.status === 'reading') {
    actions.append(el('div', { className: 'text-sm text-ink-400', text: '⏳' }));
  } else if (item.status === 'ready') {
    const cleanBtn = el('button', {
      className: 'btn btn-primary',
      text: t('card.clean'),
      onClick: () => void cleanItem(item.id),
    });
    actions.append(cleanBtn);
  } else if (item.status === 'cleaning') {
    actions.append(el('div', { className: 'text-sm text-ink-300', text: t('card.cleaning') }));
  } else if (item.status === 'done' && item.result && item.downloadUrl) {
    const dl = el('a', {
      className: 'btn btn-primary',
      attrs: { href: item.downloadUrl, download: item.outputName ?? 'clean.bin' },
      text: t('card.download'),
      onClick: () => markDownloaded(item.id),
    });
    actions.append(dl);

    // Share API на мобильных
    if (canShareFile()) {
      const share = el('button', {
        className: 'btn btn-outline',
        text: t('card.share'),
        onClick: () => {
          void doShare(item);
        },
      });
      actions.append(share);
    }

    const saved = item.result.inputSize - item.result.outputSize;
    if (saved > 0) {
      actions.append(
        el('span', {
          className: 'chip',
          text: t('card.savings', { bytes: formatBytes(saved) }),
        }),
      );
    }
  } else if (item.status === 'error') {
    actions.append(
      el('div', {
        className: 'text-sm text-red-400',
        text: `${t('card.error')}: ${item.error ?? ''}`,
      }),
    );
  }

  card.append(actions);

  // Локализованный перерендер не делаем — карточка пересоздаётся в App при ре-эмите
  onLangChange(() => {
    /* App перерисует список */
  });

  return card;
}

function renderTypeBadge(item: ProcessingItem): HTMLElement {
  const badge = el('div', {
    className:
      'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xs font-semibold uppercase text-ink-200',
  });
  badge.textContent = (item.type.ext || '?').slice(0, 4);
  return badge;
}

function canShareFile(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'share' in navigator &&
    'canShare' in navigator &&
    typeof (navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare ===
      'function'
  );
}

async function doShare(item: ProcessingItem): Promise<void> {
  if (!item.result || !item.outputName) return;
  const file = new File([item.result.output as BlobPart], item.outputName, {
    type: item.result.outputMime,
  });
  const data: ShareData = { files: [file], title: item.outputName };
  try {
    if (
      'canShare' in navigator &&
      typeof (navigator as Navigator & { canShare?: (d: ShareData) => boolean }).canShare ===
        'function' &&
      !(navigator as Navigator & { canShare: (d: ShareData) => boolean }).canShare(data)
    ) {
      return;
    }
    await navigator.share(data);
  } catch {
    /* пользователь отменил или не поддерживается */
  }
}
