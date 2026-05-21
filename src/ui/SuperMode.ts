import { t, onLangChange } from '@/i18n';
import { el } from './utils';

/**
 * Супер-режим — UI с превью операций. v1: показывает доступные функции,
 * проводит юзера через сценарии. Реальная работа делается через ffmpeg.wasm
 * (ленивая загрузка) — обёртки в `@/cleaners/ffmpeg`.
 *
 * Здесь специально аккуратно подключается «тяжёлый» код через dynamic import,
 * чтобы он не попадал в основной бандл.
 */
export function createSuperMode(): HTMLElement {
  const root = el('div', { className: 'mx-auto w-full max-w-4xl space-y-6' });

  const header = el('div', { className: 'flex items-center justify-between' });
  const back = el('a', {
    className: 'btn btn-ghost',
    attrs: { href: '#/' },
    text: t('super.back'),
  });
  const title = el('h2', { className: 'text-2xl font-semibold', text: t('super.title') });
  header.append(back, title, el('div'));
  root.append(header);

  const intro = el('p', { className: 'text-ink-300', text: t('super.intro') });
  root.append(intro);

  const grid = el('div', { className: 'grid gap-4 sm:grid-cols-2' });

  grid.append(
    sectionCard('super.section.images', [
      ['super.op.convert', 'Конвертировать HEIC/AVIF/JPG/PNG/WebP/TIFF и RAW→JPG'],
      ['super.op.resize', 'Уменьшить размер: Instagram, Stories, X, VK, Web, 4K, Custom'],
      ['super.op.compress', 'Подогнать вес под лимит площадки (бинарный поиск quality)'],
      ['super.op.crop', 'Соотношения: 1:1, 4:5, 9:16, 16:9, 3:2, 4:3'],
      ['super.op.rotate_lossless', 'JPEG-поворот без перекодирования (jpegtran-like)'],
    ]),
  );
  grid.append(
    sectionCard('super.section.video', [
      ['super.op.convert', 'MP4 ↔ MOV ↔ MKV ↔ WebM'],
      ['super.op.trim', 'Обрезать ролик по времени'],
      ['super.op.framegrab', 'Извлечь кадр как JPG/PNG'],
      ['super.op.gif', 'GIF из отрезка видео'],
      ['super.op.resize', 'Уменьшить до 1080p / 720p / 480p, повернуть 90°/180°/270°'],
    ]),
  );
  grid.append(
    sectionCard('super.section.audio', [
      ['super.op.extract_audio', 'Вытащить дорожку из видео (MP3/OGG/M4A)'],
      ['super.op.audio_convert', 'WAV / M4A / FLAC / OGG → MP3, выбор битрейта'],
    ]),
  );
  root.append(grid);

  // Кнопка загрузки ffmpeg по запросу
  const loadBox = el('div', { className: 'surface p-5' });
  const loadTitle = el('div', { className: 'text-base font-medium', text: t('ffmpeg.loading') });
  const loadHint = el('div', {
    className: 'mt-1 text-xs text-ink-400',
    text: 'Процессор загружается с CDN unpkg и кэшируется браузером — повторно не качается.',
  });
  const status = el('div', { className: 'mt-3 text-sm text-ink-300' });
  const btn = el('button', {
    className: 'btn btn-primary mt-3',
    text: 'Загрузить процессор сейчас',
    onClick: async () => {
      btn.setAttribute('disabled', 'true');
      status.textContent = t('ffmpeg.loading');
      try {
        await import('@/cleaners/ffmpeg');
        status.textContent = t('ffmpeg.cached');
      } catch (e) {
        status.textContent = `Ошибка: ${(e as Error).message}`;
        btn.removeAttribute('disabled');
      }
    },
  });
  loadBox.append(loadTitle, loadHint, btn, status);
  root.append(loadBox);

  onLangChange(() => {
    // Минимальный перерендер только надписей
    back.textContent = t('super.back');
    title.textContent = t('super.title');
    intro.textContent = t('super.intro');
  });

  return root;
}

function sectionCard(titleKey: string, ops: Array<[string, string]>): HTMLElement {
  const card = el('div', { className: 'surface p-5' });
  card.append(el('h3', { className: 'text-base font-semibold', text: t(titleKey) }));
  const list = el('ul', { className: 'mt-3 space-y-2 text-sm' });
  for (const [opKey, desc] of ops) {
    const li = el('li', { className: 'flex items-start gap-2' });
    li.append(el('span', { className: 'text-cyan', text: '•' }));
    const body = el('div', { className: 'flex-1' });
    body.append(el('div', { className: 'font-medium', text: t(opKey) }));
    body.append(el('div', { className: 'text-xs text-ink-400', text: desc }));
    li.append(body);
    list.append(li);
  }
  card.append(list);
  return card;
}
