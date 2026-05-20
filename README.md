# metaclear

> Чистые файлы за один клик. Удаление метаданных из фото и видео — прямо в браузере, без загрузки на сервер.

[![CI](https://github.com/pupsik084/metaclear/actions/workflows/ci.yml/badge.svg)](https://github.com/pupsik084/metaclear/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Сайт:** [metaclear.vercel.app](https://metaclear.vercel.app) (после деплоя)
**Telegram-чат:** [t.me/metaclear1](https://t.me/metaclear1)

---

## Принципы

1. **Полная приватность** — файлы физически не покидают устройство. Вся обработка идёт в браузере (нативный JS + ffmpeg.wasm), сервер только раздаёт статику.
2. **Скорость** — для самых частых форматов (JPEG/PNG/WebP/GIF) написан свой парсер, очистка идёт мгновенно. Тяжёлый ffmpeg.wasm подгружается лениво.
3. **Без потерь** — lossless подход через `-c copy` (без перекодирования). Контейнер пересобирается с пустыми метаданными.

## Что чистится

| Семейство   | Форматы                           | Способ                     | Lossless?               |
| ----------- | --------------------------------- | -------------------------- | ----------------------- |
| Изображения | JPEG                              | нативный парсер сегментов  | да                      |
| Изображения | PNG                               | нативный парсер чанков     | да                      |
| Изображения | WebP                              | нативный парсер RIFF       | да                      |
| Изображения | GIF                               | нативный парсер блоков     | да                      |
| Изображения | HEIC/HEIF/AVIF                    | ffmpeg.wasm `-c copy`      | да                      |
| Изображения | TIFF                              | ffmpeg.wasm `-c copy`      | да                      |
| Видео       | MP4 / MOV / MKV / WebM            | ffmpeg.wasm `-c copy`      | да                      |
| Аудио       | MP3 / M4A / WAV / FLAC / OGG      | ffmpeg.wasm `-c copy`      | да                      |
| RAW (v1)    | CR2 / CR3 / NEF / ARW / DNG / RAF | ffmpeg.wasm → JPG без EXIF | **нет** (декодирование) |

### Что именно мы вырезаем

**JPEG:** все маркеры `APP1..APP15` (EXIF, XMP, ICC, Photoshop IRB, MPF и т.д.), `COM`. Сохраняем `SOI`, `JFIF APP0` (заголовок совместимости, не метаданные), `SOF`, `DQT`, `DHT`, `SOS`, `EOI`, энтропийный поток.

**PNG:** чанки `tEXt`, `zTXt`, `iTXt`, `eXIf`, `tIME`, неизвестные ancillary с метаданными. Сохраняем `IHDR`, `PLTE`, `IDAT`, `IEND`, цветовой профиль `iCCP`, прозрачность `tRNS`, гамму, sRGB, физические единицы.

**WebP:** RIFF-чанки `EXIF`, `XMP `, при этом флаги наличия EXIF/XMP в `VP8X` обнуляются. Сохраняем `VP8`/`VP8L`/`VP8X`, анимационные чанки `ANIM`/`ANMF`, альфу, цветовой профиль `ICCP`.

**GIF:** Application Extensions с XMP, Comment Extensions, Plain Text. Сохраняем Graphic Control (нужен для отображения), `NETSCAPE2.0`/`ANIMEXTS1.0` (нужны для зацикливания анимации).

## RAW-политика

- **На главном экране** RAW не обрабатывается. При drop'е RAW-файла показывается плашка «RAW-файлы обрабатываются в Супер-режиме → Открыть».
- **В Супер-режиме** через ffmpeg.wasm — конвертация в JPG без метаданных. Особенно надёжно для **DNG** (Adobe Digital Negative, открытый стандарт на базе TIFF).
- **Lossless RAW→RAW** (сохранение сырых данных сенсора с вырезанным EXIF/GPS/MakerNotes) — кандидат в v2. DNG будет первым в очереди.

## Стек

- **Vite** — сборка
- **TypeScript** — строгая типизация, без `any`/`getattr`/etc.
- **Tailwind CSS** — стили (тёмная по умолчанию, переключатель на светлую)
- **vite-plugin-pwa** — manifest, Service Worker, офлайн, кэширование ffmpeg.wasm
- **@ffmpeg/ffmpeg** + **@ffmpeg/util** — обработка тяжёлых форматов
- **client-zip** — лёгкая упаковка очищенных файлов в ZIP
- **Leaflet** — мини-карта для GPS-превью (OpenStreetMap, лениво подгружается)
- **vitest** — юнит-тесты парсеров

Деплой на **Vercel Hobby** (бесплатный план), все ~500 КБ HTML/JS/CSS кэшируются. ffmpeg-core берётся с unpkg CDN и кэшируется браузером.

## Разработка

```bash
npm install
npm run dev          # дев-сервер на http://localhost:5173
npm run build        # production-сборка в dist/
npm run preview      # локальный preview production-сборки
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run format       # prettier --write
```

### Структура

```
src/
├── main.ts           # точка входа
├── app.ts            # роутинг (главная ↔ /super) и общая раскладка
├── assets/           # лого, иконки (inline)
├── i18n/             # ru.json, en.json
├── cleaners/         # модули очистки метаданных
│   ├── jpeg.ts       # нативный парсер JPEG
│   ├── png.ts        # нативный парсер PNG
│   ├── webp.ts       # нативный парсер WebP
│   ├── gif.ts        # нативный парсер GIF
│   ├── ffmpeg.ts     # ленивая обёртка над ffmpeg.wasm
│   ├── detect.ts     # детектор формата по magic-bytes + расширению
│   └── index.ts      # роутер
├── readers/          # чтение метаданных (для UI-превью)
│   └── exif.ts
├── ui/
│   ├── DropZone.ts
│   ├── FileCard.ts
│   ├── MetaPreview.ts
│   ├── SuperMode.ts
│   ├── Header.ts
│   ├── Footer.ts
│   ├── Settings.ts
│   └── state.ts      # in-memory state очищенных файлов + авто-удаление
└── styles/
    └── main.css
```

## HTTP-заголовки

ffmpeg.wasm требует `SharedArrayBuffer`, что требует cross-origin isolation. В [`vercel.json`](./vercel.json) выставлены:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Приватность

- Файлы никуда не отправляются. Чтобы это проверить: открой DevTools → Network перед обработкой. Никаких POST/PUT с твоими файлами не будет — только GET за ffmpeg-core с unpkg при первом использовании Супер-режима.
- В UI есть настройка авто-удаления очищенных файлов из памяти страницы: сразу после скачивания / через 1 мин / 5 мин / 30 мин / до закрытия вкладки.
- Никакой аналитики, никаких cookies. Исходный код открыт.

## Лицензия

[MIT](LICENSE) — делай что хочешь, только включай copyright notice.
