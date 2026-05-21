import './styles/main.css';
import { mountApp } from './app';
import { applyTheme, getSettings } from './ui/settings';

// Применяем тему ASAP, до первого рендера, чтобы не было «вспышки»
applyTheme(getSettings().theme);

const root = document.getElementById('app');
if (!root) throw new Error('#app element not found');
mountApp(root);

// PWA: регистрация SW (через vite-plugin-pwa)
if ('serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
