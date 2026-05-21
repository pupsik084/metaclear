import { getLang, onLangChange, setLang, t } from '@/i18n';
import { getSettings, openSettingsModal, updateSettings } from './settings';
import { el } from './utils';

export function createHeader(logoSvg: string): HTMLElement {
  const header = el('header', {
    className: 'mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6',
  });

  // Лого + название
  const left = el('a', {
    className: 'flex items-center gap-2 text-ink-100 hover:text-cyan',
    attrs: { href: '#/' },
  });
  const logo = el('div', {
    className: 'h-8 w-8 [&_svg]:h-full [&_svg]:w-full',
    html: logoSvg,
  });
  left.append(logo);
  left.append(el('span', { className: 'text-lg font-semibold tracking-tight', text: 'metaclear' }));
  header.append(left);

  // Правый блок
  const right = el('nav', { className: 'flex items-center gap-1 sm:gap-2' });

  // Language toggle
  const langBtn = el('button', {
    className: 'btn btn-ghost px-2 py-1 text-xs uppercase',
    attrs: { 'aria-label': t('header.lang') },
  });
  const refreshLang = (): void => {
    langBtn.textContent = getLang() === 'ru' ? 'EN' : 'RU';
  };
  refreshLang();
  langBtn.addEventListener('click', () => {
    setLang(getLang() === 'ru' ? 'en' : 'ru');
    refreshLang();
  });
  onLangChange(refreshLang);
  right.append(langBtn);

  // Theme toggle
  const themeBtn = el('button', {
    className: 'btn btn-ghost px-2 py-1',
    attrs: { 'aria-label': t('header.theme.dark') },
  });
  const refreshTheme = (): void => {
    const cur = getSettings().theme;
    themeBtn.innerHTML =
      cur === 'dark'
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  };
  refreshTheme();
  themeBtn.addEventListener('click', () => {
    const cur = getSettings().theme;
    updateSettings({ theme: cur === 'dark' ? 'light' : 'dark' });
    refreshTheme();
  });
  right.append(themeBtn);

  // Super-mode link
  const superLink = el('a', {
    className: 'btn btn-outline hidden sm:inline-flex',
    attrs: { href: '#/super' },
    text: t('header.super'),
  });
  onLangChange(() => {
    superLink.textContent = t('header.super');
  });
  right.append(superLink);

  // Settings
  const settingsBtn = el('button', {
    className: 'btn btn-ghost px-2 py-1',
    attrs: { 'aria-label': t('header.settings') },
    onClick: () => openSettingsModal(),
  });
  settingsBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
  right.append(settingsBtn);

  header.append(right);
  return header;
}
