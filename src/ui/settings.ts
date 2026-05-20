import { getLang, onLangChange, setLang, t } from '@/i18n';

export type AutoDeleteMode = 'never' | 'immediate' | '1min' | '5min' | '30min';
export type Theme = 'dark' | 'light';

export interface Settings {
  autoDelete: AutoDeleteMode;
  theme: Theme;
}

const STORAGE_KEY = 'metaclear.settings';

const defaultSettings: Settings = {
  autoDelete: '5min',
  theme: 'dark',
};

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

function load(): Settings {
  if (typeof localStorage === 'undefined') return { ...defaultSettings };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      autoDelete: parsed.autoDelete ?? defaultSettings.autoDelete,
      theme: parsed.theme ?? defaultSettings.theme,
    };
  } catch {
    return { ...defaultSettings };
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* private mode */
  }
}

export function getSettings(): Readonly<Settings> {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  persist();
  if (patch.theme) applyTheme(current.theme);
  for (const cb of listeners) cb(current);
}

export function onSettingsChange(cb: (s: Settings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function applyTheme(theme: Theme): void {
  const html = document.documentElement;
  html.classList.toggle('dark', theme === 'dark');
  html.classList.toggle('light', theme === 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0f14' : '#f4f6f8');
}

export function autoDeleteMs(mode: AutoDeleteMode): number | 'immediate' | 'never' {
  switch (mode) {
    case 'never':
      return 'never';
    case 'immediate':
      return 'immediate';
    case '1min':
      return 60_000;
    case '5min':
      return 300_000;
    case '30min':
      return 1_800_000;
  }
}

// --- UI: модалка настроек ---

export function openSettingsModal(): void {
  const overlay = document.createElement('div');
  overlay.className =
    'fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm animate-fade-in';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const close = (): void => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const panel = document.createElement('div');
  panel.className = 'surface w-full max-w-md p-6';
  overlay.append(panel);

  const render = (): void => {
    panel.innerHTML = '';

    const h = document.createElement('h2');
    h.className = 'mb-4 text-lg font-semibold';
    h.textContent = t('settings.title');
    panel.append(h);

    panel.append(renderAutoDelete());
    panel.append(renderTheme());
    panel.append(renderLanguage());

    const footer = document.createElement('div');
    footer.className = 'mt-6 flex justify-end';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = t('settings.close');
    btn.addEventListener('click', close);
    footer.append(btn);
    panel.append(footer);
  };

  const renderAutoDelete = (): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.className = 'mb-5';
    const label = document.createElement('div');
    label.className = 'mb-2 text-sm font-medium';
    label.textContent = t('settings.autodelete.label');
    wrap.append(label);
    const sel = document.createElement('select');
    sel.className =
      'w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm focus:border-cyan focus:outline-none';
    const opts: Array<[AutoDeleteMode, string]> = [
      ['immediate', t('settings.autodelete.immediate')],
      ['1min', t('settings.autodelete.1min')],
      ['5min', t('settings.autodelete.5min')],
      ['30min', t('settings.autodelete.30min')],
      ['never', t('settings.autodelete.never')],
    ];
    for (const [v, lbl] of opts) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = lbl;
      sel.append(o);
    }
    sel.value = current.autoDelete;
    sel.addEventListener('change', () => {
      updateSettings({ autoDelete: sel.value as AutoDeleteMode });
    });
    wrap.append(sel);
    return wrap;
  };

  const renderTheme = (): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.className = 'mb-5';
    const label = document.createElement('div');
    label.className = 'mb-2 text-sm font-medium';
    label.textContent = t('settings.theme.label');
    wrap.append(label);
    const sel = document.createElement('select');
    sel.className =
      'w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm focus:border-cyan focus:outline-none';
    const opts: Array<[Theme, string]> = [
      ['dark', t('header.theme.dark')],
      ['light', t('header.theme.light')],
    ];
    for (const [v, lbl] of opts) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = lbl;
      sel.append(o);
    }
    sel.value = current.theme;
    sel.addEventListener('change', () => {
      updateSettings({ theme: sel.value as Theme });
    });
    wrap.append(sel);
    return wrap;
  };

  const renderLanguage = (): HTMLElement => {
    const wrap = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'mb-2 text-sm font-medium';
    label.textContent = t('settings.lang.label');
    wrap.append(label);
    const sel = document.createElement('select');
    sel.className =
      'w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm focus:border-cyan focus:outline-none';
    const opts: Array<['ru' | 'en', string]> = [
      ['ru', 'Русский'],
      ['en', 'English'],
    ];
    for (const [v, lbl] of opts) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = lbl;
      sel.append(o);
    }
    sel.value = getLang();
    sel.addEventListener('change', () => {
      setLang(sel.value as 'ru' | 'en');
    });
    wrap.append(sel);
    return wrap;
  };

  const unsub = onLangChange(() => render());
  overlay.addEventListener('remove', () => unsub());

  render();
  document.body.append(overlay);
}
