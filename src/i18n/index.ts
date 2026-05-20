import ru from './ru.json';
import en from './en.json';

export type Lang = 'ru' | 'en';
export type Dict = Record<string, string>;

const dicts: Record<Lang, Dict> = {
  ru: ru as Dict,
  en: en as Dict,
};

const STORAGE_KEY = 'metaclear.lang';

let current: Lang = detectInitial();
const listeners = new Set<(lang: Lang) => void>();

function detectInitial(): Lang {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ru' || stored === 'en') return stored;
  }
  if (typeof navigator !== 'undefined') {
    const n = navigator.language || (navigator.languages && navigator.languages[0]) || 'en';
    if (n.toLowerCase().startsWith('ru')) return 'ru';
  }
  return 'en';
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (current === lang) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', lang);
  }
  for (const cb of listeners) cb(lang);
}

export function onLangChange(cb: (lang: Lang) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = dicts[current];
  const raw = dict[key] ?? dicts.en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`,
  );
}
