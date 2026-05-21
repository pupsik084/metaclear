import type { CleanResult } from '@/types';

/**
 * Удаление метаданных из PNG без перекодирования.
 *
 * Структура PNG: 8-байтная сигнатура + последовательность чанков:
 *   [LEN(4)][TYPE(4)][DATA(LEN)][CRC(4)]
 *
 * Критичность чанка определяется регистром первого байта TYPE:
 *   заглавная — critical, строчная — ancillary.
 *
 * Что мы вырезаем (ancillary с метаданными):
 *   - tEXt, zTXt, iTXt (текстовые поля)
 *   - eXIf (EXIF в PNG)
 *   - tIME (последнее изменение)
 *   - prVW, prVD, dSIG, и любые непризнанные ancillary с возможными метаданными
 *
 * Что оставляем:
 *   - Все critical: IHDR, PLTE, IDAT, IEND
 *   - Известные безопасные ancillary: tRNS, gAMA, cHRM, sRGB, iCCP, sBIT, bKGD,
 *     hIST, pHYs, sPLT, acTL, fcTL, fdAT (для APNG)
 *
 * Подход: явный whitelist для известных. Непризнанные ancillary режем
 * (безопаснее для приватности — лучше удалить лишнее, чем оставить).
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const KEEP_CHUNKS: ReadonlySet<string> = new Set([
  // critical
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  // безопасные ancillary
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP', // цветовой профиль — нужен для корректной цветопередачи
  'sBIT',
  'bKGD',
  'hIST',
  'pHYs',
  'sPLT',
  // APNG
  'acTL',
  'fcTL',
  'fdAT',
]);

const REMOVABLE_CHUNKS: ReadonlySet<string> = new Set([
  'tEXt',
  'zTXt',
  'iTXt',
  'eXIf',
  'tIME',
  'prVW', // preview, Adobe
  'prVD',
  'dSIG',
]);

/** CRC-32 по таблице (стандарт PNG / ISO 3309). */
function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function cleanPng(input: Uint8Array): CleanResult {
  if (input.length < PNG_SIGNATURE.length) {
    throw new Error('Файл слишком короткий для PNG.');
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (input[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Не похоже на PNG (неверная сигнатура).');
    }
  }

  const out: number[] = [...PNG_SIGNATURE];
  let i = PNG_SIGNATURE.length;
  let removed = 0;
  const removedTypes: string[] = [];

  while (i + 8 <= input.length) {
    const len = readU32BE(input, i);
    const typeStart = i + 4;
    const dataStart = i + 8;
    const dataEnd = dataStart + len;
    const crcEnd = dataEnd + 4;

    if (crcEnd > input.length) {
      throw new Error('Обрыв PNG: чанк выходит за пределы файла.');
    }

    const type = String.fromCharCode(
      input[typeStart]!,
      input[typeStart + 1]!,
      input[typeStart + 2]!,
      input[typeStart + 3]!,
    );

    const isCritical = (input[typeStart]! & 0x20) === 0; // заглавная буква => critical
    const inKeep = KEEP_CHUNKS.has(type);
    const inRemove = REMOVABLE_CHUNKS.has(type);

    // Решение:
    //  - critical всегда оставляем
    //  - явный whitelist — оставляем
    //  - явный remove-list — удаляем
    //  - неизвестные ancillary — удаляем
    const keep = isCritical || inKeep || (!inRemove && false);

    if (keep) {
      for (let k = i; k < crcEnd; k++) out.push(input[k]!);
    } else {
      removed++;
      removedTypes.push(type);
    }

    i = crcEnd;
    if (type === 'IEND') break;
  }

  // Гарантия IEND
  const hasIend =
    out.length >= 12 &&
    String.fromCharCode(
      out[out.length - 8]!,
      out[out.length - 7]!,
      out[out.length - 6]!,
      out[out.length - 5]!,
    ) === 'IEND';
  if (!hasIend) {
    const iendData = new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44]);
    const crc = crc32(iendData, 4, 8);
    out.push(...iendData);
    out.push((crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff);
  }

  const result = new Uint8Array(out);
  return {
    output: result,
    outputMime: 'image/png',
    outputExt: 'png',
    inputSize: input.length,
    outputSize: result.length,
    removedFieldsCount: removed,
    notes: removed > 0 ? [`Удалено чанков: ${removed} (${removedTypes.join(', ')})`] : [],
  };
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}
