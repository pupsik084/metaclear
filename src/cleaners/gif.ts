import type { CleanResult } from '@/types';

/**
 * Удаление метаданных из GIF (87a/89a) без перекодирования.
 *
 * Структура GIF:
 *   Header "GIF87a" / "GIF89a" (6 байт)
 *   Logical Screen Descriptor (7 байт)
 *   [Global Color Table] (опц., 3*2^(N+1) байт)
 *   [Blocks: Image / Extension] ...
 *   Trailer 0x3B
 *
 * Extensions начинаются с 0x21 за которым идёт label:
 *   0xF9 — Graphic Control (НЕ удалять, влияет на отображение)
 *   0xFE — Comment (УДАЛИТЬ)
 *   0xFF — Application (XMP, NETSCAPE2.0 для loop animation)
 *           NETSCAPE2.0 / ANIMEXTS1.0 — оставляем (нужно для зацикливания)
 *           Всё остальное (включая XMP "XMP DataXMP") — удаляем
 *   0x01 — Plain Text (УДАЛИТЬ)
 *
 * Image Descriptor начинается с 0x2C.
 * Sub-blocks: [N][N bytes]... [0 терминатор].
 */

const EXTENSION_INTRODUCER = 0x21;
const IMAGE_SEPARATOR = 0x2c;
const TRAILER = 0x3b;

const LABEL_GRAPHIC_CONTROL = 0xf9;
const LABEL_COMMENT = 0xfe;
const LABEL_APPLICATION = 0xff;
const LABEL_PLAIN_TEXT = 0x01;

const KEEP_APP_IDS: ReadonlySet<string> = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

export function cleanGif(input: Uint8Array): CleanResult {
  if (input.length < 13) {
    throw new Error('Файл слишком короткий для GIF.');
  }
  const sig = String.fromCharCode(...input.subarray(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') {
    throw new Error('Не похоже на GIF.');
  }

  const out: number[] = [];
  // Header + LSD
  for (let k = 0; k < 13; k++) out.push(input[k]!);

  const packed = input[10]!;
  const hasGCT = (packed & 0x80) !== 0;
  const gctSize = hasGCT ? 3 * Math.pow(2, (packed & 0x07) + 1) : 0;

  let i = 13;
  if (gctSize > 0) {
    for (let k = i; k < i + gctSize; k++) out.push(input[k]!);
    i += gctSize;
  }

  let removed = 0;
  const removedExts: string[] = [];

  while (i < input.length) {
    const b = input[i]!;
    if (b === TRAILER) {
      out.push(b);
      i++;
      break;
    }
    if (b === IMAGE_SEPARATOR) {
      // Image Descriptor — копируем полностью включая local color table и sub-blocks
      const end = scanImageBlock(input, i);
      for (let k = i; k < end; k++) out.push(input[k]!);
      i = end;
      continue;
    }
    if (b === EXTENSION_INTRODUCER) {
      const label = input[i + 1]!;
      const blockEnd = scanSubBlocks(input, i + 2);
      const fullEnd = blockEnd; // включая нулевой терминатор

      const keep = decideKeepExtension(input, i, label);
      if (keep) {
        for (let k = i; k < fullEnd; k++) out.push(input[k]!);
      } else {
        removed++;
        removedExts.push(extensionName(label));
      }
      i = fullEnd;
      continue;
    }
    // Неизвестный байт — на всякий случай прерываем (битый файл)
    break;
  }

  // Гарантия trailer
  if (out[out.length - 1] !== TRAILER) out.push(TRAILER);

  const result = new Uint8Array(out);
  return {
    output: result,
    outputMime: 'image/gif',
    outputExt: 'gif',
    inputSize: input.length,
    outputSize: result.length,
    removedFieldsCount: removed,
    notes: removed > 0 ? [`Удалено расширений GIF: ${removed} (${removedExts.join(', ')})`] : [],
  };
}

function decideKeepExtension(bytes: Uint8Array, start: number, label: number): boolean {
  if (label === LABEL_GRAPHIC_CONTROL) return true; // влияет на кадр
  if (label === LABEL_PLAIN_TEXT) return false;
  if (label === LABEL_COMMENT) return false;
  if (label === LABEL_APPLICATION) {
    // Application Extension: 0x21 0xFF, затем 0x0B (11), затем 11 байт идентификатор
    const idStart = start + 3;
    if (idStart + 11 > bytes.length) return false;
    const id = String.fromCharCode(...bytes.subarray(idStart, idStart + 11));
    return KEEP_APP_IDS.has(id);
  }
  return false;
}

function extensionName(label: number): string {
  if (label === LABEL_GRAPHIC_CONTROL) return 'GCE';
  if (label === LABEL_COMMENT) return 'Comment';
  if (label === LABEL_APPLICATION) return 'Application';
  if (label === LABEL_PLAIN_TEXT) return 'PlainText';
  return `0x${label.toString(16)}`;
}

function scanSubBlocks(bytes: Uint8Array, start: number): number {
  let i = start;
  while (i < bytes.length) {
    const size = bytes[i]!;
    if (size === 0) return i + 1;
    i += 1 + size;
  }
  return bytes.length;
}

function scanImageBlock(bytes: Uint8Array, start: number): number {
  // Image Descriptor — 10 байт от 0x2C
  let i = start + 10;
  if (i > bytes.length) return bytes.length;
  const packed = bytes[start + 9]!;
  const hasLCT = (packed & 0x80) !== 0;
  if (hasLCT) {
    const lctSize = 3 * Math.pow(2, (packed & 0x07) + 1);
    i += lctSize;
  }
  // LZW Minimum Code Size (1 байт)
  i += 1;
  // Image data sub-blocks
  i = scanSubBlocks(bytes, i);
  return i;
}
