import type { CleanResult } from '@/types';

/**
 * Удаление метаданных из WebP без перекодирования.
 *
 * WebP — это RIFF-контейнер: 'RIFF' [size32 LE] 'WEBP' [chunks...].
 * Чанки: 4-байт FourCC + 4-байт LE size + payload (выровнен по 2 байтам).
 *
 * Что мы вырезаем:
 *   - EXIF, XMP , ICCP (если без него цвет не критичен — оставляем по умолчанию)
 *
 * Что оставляем:
 *   - VP8 / VP8L / VP8X (заголовок features)
 *   - ANIM / ANMF (анимация)
 *   - ALPH (альфа)
 *   - ICCP (цветовой профиль — оставляем, как и в PNG, чтобы сохранить цвета)
 *
 * Внутри VP8X задаются флаги наличия EXIF/XMP/ICCP (биты 3,2,5).
 * Их обнуляем, если мы вырезали соответствующие чанки.
 */

const REMOVE_FOURCC: ReadonlySet<string> = new Set(['EXIF', 'XMP ']);

export function cleanWebp(input: Uint8Array): CleanResult {
  if (input.length < 12) {
    throw new Error('Файл слишком короткий для WebP.');
  }
  if (
    String.fromCharCode(input[0]!, input[1]!, input[2]!, input[3]!) !== 'RIFF' ||
    String.fromCharCode(input[8]!, input[9]!, input[10]!, input[11]!) !== 'WEBP'
  ) {
    throw new Error('Не похоже на WebP RIFF.');
  }

  const out: number[] = [];
  // 'RIFF', placeholder size, 'WEBP'
  out.push(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);

  let i = 12;
  let removed = 0;
  const removedFourcc: string[] = [];
  let vp8xOffsetInOutput = -1;
  let removedExif = false;
  let removedXmp = false;

  while (i + 8 <= input.length) {
    const fourcc = String.fromCharCode(input[i]!, input[i + 1]!, input[i + 2]!, input[i + 3]!);
    const size = readU32LE(input, i + 4);
    const dataStart = i + 8;
    const dataEnd = dataStart + size;
    const padded = dataEnd + (size & 1); // выравнивание по 2 байтам

    if (padded > input.length) {
      // битый чанк — обрезаем
      break;
    }

    if (REMOVE_FOURCC.has(fourcc)) {
      removed++;
      removedFourcc.push(fourcc.trim());
      if (fourcc === 'EXIF') removedExif = true;
      if (fourcc === 'XMP ') removedXmp = true;
      i = padded;
      continue;
    }

    if (fourcc === 'VP8X') {
      vp8xOffsetInOutput = out.length + 8; // позиция первого байта payload в выходе
    }

    for (let k = i; k < padded; k++) out.push(input[k]!);
    i = padded;
  }

  // Если был VP8X, чистим биты флагов EXIF (bit 3) / XMP (bit 2)
  if (vp8xOffsetInOutput >= 0 && (removedExif || removedXmp)) {
    const flagsIndex = vp8xOffsetInOutput; // первый байт payload — флаги
    if (flagsIndex < out.length) {
      let flags = out[flagsIndex]!;
      if (removedExif) flags &= ~(1 << 3);
      if (removedXmp) flags &= ~(1 << 2);
      out[flagsIndex] = flags;
    }
  }

  // Записать итоговый размер RIFF (всё после первых 8 байт)
  const totalSize = out.length - 8;
  out[4] = totalSize & 0xff;
  out[5] = (totalSize >>> 8) & 0xff;
  out[6] = (totalSize >>> 16) & 0xff;
  out[7] = (totalSize >>> 24) & 0xff;

  const result = new Uint8Array(out);
  return {
    output: result,
    outputMime: 'image/webp',
    outputExt: 'webp',
    inputSize: input.length,
    outputSize: result.length,
    removedFieldsCount: removed,
    notes: removed > 0 ? [`Удалено чанков WebP: ${removed} (${removedFourcc.join(', ')})`] : [],
  };
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}
