import { onLangChange, t } from '@/i18n';
import { el } from './utils';

const GITHUB_URL = 'https://github.com/pupsik084/metaclear';
const TELEGRAM_URL = 'https://t.me/metaclear1';

export function createFooter(): HTMLElement {
  const footer = el('footer', {
    className:
      'mx-auto mt-12 w-full max-w-6xl border-t border-white/5 px-4 py-6 text-sm text-ink-400 sm:px-6',
  });

  const row = el('div', { className: 'flex flex-wrap items-center justify-between gap-3' });

  const text = el('span', {});
  const links = el('div', { className: 'flex items-center gap-3' });

  const tg = el('a', {
    className: 'inline-flex items-center gap-1 hover:text-cyan',
    attrs: { href: TELEGRAM_URL, target: '_blank', rel: 'noopener noreferrer' },
  });
  tg.append(
    el('span', {
      html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.5 4.2 18.4 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7L17.8 5.6c.4-.3-.1-.5-.6-.2L7.7 11.7l-4.2-1.3c-.9-.3-.9-.9.2-1.4l16.4-6.3c.8-.3 1.5.2 1.4 1.5z"/></svg>`,
    }),
  );
  tg.append(el('span', { text: t('footer.channel') }));

  const gh = el('a', {
    className: 'inline-flex items-center gap-1 hover:text-cyan',
    attrs: { href: GITHUB_URL, target: '_blank', rel: 'noopener noreferrer' },
  });
  gh.append(
    el('span', {
      html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.3 11.3 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z"/></svg>`,
    }),
  );
  gh.append(el('span', { text: t('footer.github') }));

  const refresh = (): void => {
    text.textContent = t('footer.text');
    const tgLabel = tg.querySelector('span:last-child');
    if (tgLabel) tgLabel.textContent = t('footer.channel');
    const ghLabel = gh.querySelector('span:last-child');
    if (ghLabel) ghLabel.textContent = t('footer.github');
  };
  refresh();
  onLangChange(refresh);

  links.append(tg, gh);
  row.append(text, links);
  footer.append(row);
  return footer;
}

export function createPrivacyBanner(): HTMLElement {
  const banner = el('div', {
    className:
      'mx-auto mb-4 flex w-full max-w-6xl items-center gap-2 rounded-xl border border-cyan/20 bg-cyan/5 px-4 py-2 text-sm text-cyan',
  });
  banner.append(
    el('span', {
      html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    }),
  );
  const text = el('span', { className: 'flex-1' });
  const link = el('a', {
    className: 'underline hover:text-cyan-dark',
    attrs: {
      href: 'https://github.com/pupsik084/metaclear',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
  });
  const refresh = (): void => {
    text.textContent = t('privacy.banner');
    link.textContent = t('privacy.source_link');
  };
  refresh();
  onLangChange(refresh);
  banner.append(text, link);
  return banner;
}
