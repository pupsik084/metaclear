import type { CleanResult } from '@/types';

/**
 * Удаление метаданных из JPEG без перекодирования.
 *
 * Структура JPEG: последовательность сегментов вида FF Xx [LL LL ...payload],
 * затем SOS (FF DA), за которым идёт энтропийно закодированный поток до EOI (FF D9).
 *
 * Что мы вырезаем:
 *  - APP0..APP15 (FF E0..FF EF) — EXIF, JFIF (опц.), XMP, Photoshop IRB, ICC, MPF и пр.
 *  - COM (FF FE) — комментарии.
 *
 * Что оставляем:
 *  - SOI (FF D8), EOI (FF D9)
 *  - DQT (DB), DHT (C4), DAC (CC)
 *  - SOF0..SOF15 (C0..CF, кроме C4, C8, CC) — start of frame
 *  - SOS (DA) — start of scan + сжатый поток + restart markers (D0..D7)
 *  - DRI (DD), DNL (DC)
 *
 * Особенность: после SOS идёт энтропийный поток, в котором байт 0xFF
 * за которым следует 0x00 — это «stuffed» байт (часть данных), а
 * 0xFF Dx (D0..D7) — restart marker. Любое другое FF Xx внутри потока
 * означает следующий сегмент, обычно EOI.
 *
 * Возвращаем lossless-копию без вырезанных метаданных и без JFIF APP0
 * (JFIF APP0 не несёт метаданных, но его удаление меняет совместимость —
 * мы его сохраняем).
 */

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;

const APP0 = 0xe0;
const APP15 = 0xef;

const RST_MIN = 0xd0;
const RST_MAX = 0xd7;

const TPEM = 0x01; // TEM (Temporary, no payload)

function isStandaloneMarker(code: number): boolean {
  // Маркеры без payload: SOI, EOI, RSTn, TEM
  return code === SOI || code === EOI || (code >= RST_MIN && code <= RST_MAX) || code === TPEM;
}

function isAppOrCom(code: number): boolean {
  return (code >= APP0 && code <= APP15) || code === COM;
}

export function cleanJpeg(input: Uint8Array): CleanResult {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== SOI) {
    throw new Error('Не похоже на JPEG (нет SOI).');
  }

  const out: number[] = [0xff, SOI];
  let i = 2;
  let removed = 0;
  let jfifKept = false;
  const removedMarkers: string[] = [];

  while (i < input.length) {
    // Заполнители 0xFF FF между сегментами игнорируем-как-fill
    while (i < input.length && input[i] === 0xff && input[i + 1] === 0xff) i++;

    if (input[i] !== 0xff) {
      throw new Error(`Ожидался маркер 0xFF на позиции ${i}, получено 0x${input[i]!.toString(16)}`);
    }
    const marker = input[i + 1]!;

    // Standalone маркеры (SOI/EOI/RSTn/TEM) — копируем как есть
    if (isStandaloneMarker(marker)) {
      out.push(0xff, marker);
      i += 2;
      if (marker === EOI) break;
      continue;
    }

    // SOS — копируем сегмент SOS + весь энтропийный поток до следующего ненулевого маркера (обычно EOI)
    if (marker === SOS) {
      const segLen = (input[i + 2]! << 8) | input[i + 3]!;
      const sosEnd = i + 2 + segLen;
      for (let k = i; k < sosEnd; k++) out.push(input[k]!);
      i = sosEnd;
      // Копируем энтропийный поток
      while (i < input.length) {
        const b = input[i]!;
        if (b !== 0xff) {
          out.push(b);
          i++;
          continue;
        }
        const next = input[i + 1]!;
        if (next === 0x00) {
          // byte-stuffed 0xFF — данные
          out.push(0xff, 0x00);
          i += 2;
          continue;
        }
        if (next >= RST_MIN && next <= RST_MAX) {
          out.push(0xff, next);
          i += 2;
          continue;
        }
        if (next === 0xff) {
          // fill, пропускаем (но также сохраним один 0xFF на всякий)
          out.push(0xff);
          i++;
          continue;
        }
        // Любой другой маркер — выходим из потока, основная петля разберёт
        break;
      }
      continue;
    }

    // Прочие сегменты имеют 2 байта длины
    if (i + 4 > input.length) {
      throw new Error('Обрыв JPEG: нет длины сегмента.');
    }
    const segLen = (input[i + 2]! << 8) | input[i + 3]!;
    const segEnd = i + 2 + segLen;
    if (segEnd > input.length) {
      throw new Error('Обрыв JPEG: длина сегмента выходит за границы.');
    }

    const shouldStrip = isAppOrCom(marker);
    // Сохраняем JFIF APP0 (идентификатор "JFIF\0") — это не метаданные,
    // а минимальный заголовок совместимости. Всё остальное в APPn — режем.
    if (shouldStrip && marker === APP0 && segLen >= 7) {
      const idStart = i + 4;
      const id =
        String.fromCharCode(
          input[idStart]!,
          input[idStart + 1]!,
          input[idStart + 2]!,
          input[idStart + 3]!,
        ) + String.fromCharCode(input[idStart + 4]!);
      if (id === 'JFIF\0' && !jfifKept) {
        for (let k = i; k < segEnd; k++) out.push(input[k]!);
        jfifKept = true;
        i = segEnd;
        continue;
      }
    }

    if (shouldStrip) {
      removed++;
      removedMarkers.push(`0xFF${marker.toString(16).toUpperCase().padStart(2, '0')}`);
      i = segEnd;
      continue;
    }

    // Копируем сегмент полностью
    for (let k = i; k < segEnd; k++) out.push(input[k]!);
    i = segEnd;
  }

  // Гарантия наличия EOI
  if (out.length < 4 || out[out.length - 2] !== 0xff || out[out.length - 1] !== EOI) {
    out.push(0xff, EOI);
  }

  const result = new Uint8Array(out);
  return {
    output: result,
    outputMime: 'image/jpeg',
    outputExt: 'jpg',
    inputSize: input.length,
    outputSize: result.length,
    removedFieldsCount: removed,
    notes:
      removed > 0 ? [`Удалено сегментов APPn/COM: ${removed} (${removedMarkers.join(', ')})`] : [],
  };
}
