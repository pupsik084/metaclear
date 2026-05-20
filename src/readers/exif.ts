import type { GpsCoordinates, MetadataField, MetadataGroup, ReadMetadataResult } from '@/types';

/**
 * Минимальный EXIF/TIFF-парсер для UI-превью.
 *
 * НЕ для удаления — удаление делают cleaners. Здесь только чтение
 * полей, которые видит человек: GPS, дата, устройство, автор, серийник.
 *
 * Поддерживаем:
 *   - JPEG: APP1 "Exif\0\0" + TIFF IFD0/SubIFD/GPSIFD
 *   - Standalone TIFF: тот же парсер
 *   - PNG: tEXt / iTXt / eXIf
 *   - WebP: EXIF чанк (тот же TIFF)
 *
 * Принципы:
 *  - Не валим UI при битых данных: ловим и продолжаем.
 *  - Возвращаем плоский список полей + извлечённые «удобные» (GPS, дата, устройство).
 */

// ---- Public entry ----

export function readMetadata(bytes: Uint8Array, mime: string): ReadMetadataResult {
  try {
    if (mime === 'image/jpeg' || (bytes[0] === 0xff && bytes[1] === 0xd8)) {
      return readJpegMetadata(bytes);
    }
    if (mime === 'image/png' || isPngSignature(bytes)) {
      return readPngMetadata(bytes);
    }
    if (mime === 'image/webp' || isRiffWebp(bytes)) {
      return readWebpMetadata(bytes);
    }
    if (mime === 'image/tiff' || isTiffHeader(bytes, 0)) {
      const fields = parseTiff(bytes, 0).fields;
      return summarize(fields);
    }
  } catch {
    /* проглатываем — UI покажет «не удалось прочитать» */
  }
  return { fields: [], totalCount: 0 };
}

// ---- JPEG ----

function readJpegMetadata(bytes: Uint8Array): ReadMetadataResult {
  const fields: MetadataField[] = [];
  let i = 2; // после SOI
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1]!;
    if (marker === 0xda /* SOS */ || marker === 0xd9 /* EOI */) break;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const segLen = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    const segStart = i + 4;
    const segEnd = i + 2 + segLen;
    if (segEnd > bytes.length) break;

    // APP1 → EXIF или XMP
    if (marker === 0xe1) {
      // "Exif\0\0"
      if (
        segLen >= 8 &&
        bytes[segStart] === 0x45 &&
        bytes[segStart + 1] === 0x78 &&
        bytes[segStart + 2] === 0x69 &&
        bytes[segStart + 3] === 0x66 &&
        bytes[segStart + 4] === 0x00 &&
        bytes[segStart + 5] === 0x00
      ) {
        const tiffStart = segStart + 6;
        const sub = parseTiff(bytes.subarray(tiffStart, segEnd), 0);
        fields.push(...sub.fields);
      } else if (
        segLen >= 29 &&
        readAscii(bytes, segStart, 28) === 'http://ns.adobe.com/xap/1.0/'
      ) {
        const xmp = readAscii(bytes, segStart + 29, segEnd - segStart - 29);
        pushXmpFields(xmp, fields);
      }
    }

    // APP13 — Photoshop IRB (часто содержит IPTC)
    if (marker === 0xed) {
      pushFieldIfNew(fields, {
        group: 'other',
        key: 'photoshop_irb',
        label: 'Photoshop IRB (IPTC)',
        value: 'присутствует',
      });
    }

    // COM
    if (marker === 0xfe) {
      const text = readAscii(bytes, segStart, segEnd - segStart);
      if (text) {
        pushFieldIfNew(fields, {
          group: 'description',
          key: 'jpeg_comment',
          label: 'JPEG комментарий',
          value: text,
        });
      }
    }

    i = segEnd;
  }
  return summarize(fields);
}

// ---- PNG ----

function readPngMetadata(bytes: Uint8Array): ReadMetadataResult {
  const fields: MetadataField[] = [];
  let i = 8;
  while (i + 8 <= bytes.length) {
    const len = readU32BE(bytes, i);
    const type = readAscii(bytes, i + 4, 4);
    const dataStart = i + 8;
    const dataEnd = dataStart + len;
    if (dataEnd > bytes.length) break;

    if (type === 'tEXt') {
      const nullIdx = findByte(bytes, dataStart, dataEnd, 0);
      if (nullIdx > 0) {
        const k = readAscii(bytes, dataStart, nullIdx - dataStart);
        const v = readAscii(bytes, nullIdx + 1, dataEnd - nullIdx - 1);
        fields.push(textFieldFromPngKey(k, v));
      }
    } else if (type === 'iTXt') {
      // keyword\0 compFlag(1) compMethod(1) langTag\0 transKeyword\0 text
      const k0 = findByte(bytes, dataStart, dataEnd, 0);
      if (k0 > 0) {
        const k = readAscii(bytes, dataStart, k0 - dataStart);
        // Пропустим compFlag + compMethod + langTag + translatedKeyword
        let p = k0 + 1 + 2;
        const lang0 = findByte(bytes, p, dataEnd, 0);
        if (lang0 < 0) {
          i = dataEnd + 4;
          continue;
        }
        p = lang0 + 1;
        const trans0 = findByte(bytes, p, dataEnd, 0);
        if (trans0 < 0) {
          i = dataEnd + 4;
          continue;
        }
        const v = readAscii(bytes, trans0 + 1, dataEnd - trans0 - 1);
        fields.push(textFieldFromPngKey(k, v));
      }
    } else if (type === 'eXIf') {
      const sub = parseTiff(bytes.subarray(dataStart, dataEnd), 0);
      fields.push(...sub.fields);
    } else if (type === 'tIME') {
      if (len >= 7) {
        const y = readU16BE(bytes, dataStart);
        const mo = bytes[dataStart + 2]!;
        const d = bytes[dataStart + 3]!;
        const h = bytes[dataStart + 4]!;
        const mi = bytes[dataStart + 5]!;
        const s = bytes[dataStart + 6]!;
        fields.push({
          group: 'datetime',
          key: 'png_time',
          label: 'PNG время изменения',
          value: `${y}-${pad2(mo)}-${pad2(d)} ${pad2(h)}:${pad2(mi)}:${pad2(s)} UTC`,
          raw: { y, mo, d, h, mi, s },
        });
      }
    }

    i = dataEnd + 4; // + crc
    if (type === 'IEND') break;
  }
  return summarize(fields);
}

function textFieldFromPngKey(k: string, v: string): MetadataField {
  const key = k.toLowerCase();
  if (key === 'author' || key === 'artist') {
    return { group: 'author', key: 'author', label: 'Автор', value: v };
  }
  if (key === 'copyright') {
    return { group: 'author', key: 'copyright', label: 'Copyright', value: v };
  }
  if (key === 'software' || key === 'creation software' || key === 'creator') {
    return { group: 'software', key: 'software', label: 'ПО', value: v };
  }
  if (key === 'description' || key === 'comment') {
    return { group: 'description', key: 'description', label: 'Описание', value: v };
  }
  return { group: 'other', key: `png:${k}`, label: `PNG ${k}`, value: v };
}

// ---- WebP ----

function readWebpMetadata(bytes: Uint8Array): ReadMetadataResult {
  const fields: MetadataField[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const fourcc = readAscii(bytes, i, 4);
    const size = readU32LE(bytes, i + 4);
    const dataStart = i + 8;
    const dataEnd = dataStart + size;
    const padded = dataEnd + (size & 1);
    if (padded > bytes.length) break;

    if (fourcc === 'EXIF') {
      const sub = parseTiff(bytes.subarray(dataStart, dataEnd), 0);
      fields.push(...sub.fields);
    } else if (fourcc === 'XMP ') {
      const xmp = readAscii(bytes, dataStart, dataEnd - dataStart);
      pushXmpFields(xmp, fields);
    }
    i = padded;
  }
  return summarize(fields);
}

// ---- TIFF / EXIF core ----

interface TiffReadResult {
  fields: MetadataField[];
  gps?: GpsCoordinates;
  capturedAt?: string;
  device?: string;
}

function parseTiff(bytes: Uint8Array, offset: number): TiffReadResult {
  const fields: MetadataField[] = [];
  if (!isTiffHeader(bytes, offset)) return { fields };
  const littleEndian = bytes[offset] === 0x49;

  const ifd0Off = readU32(bytes, offset + 4, littleEndian);
  if (ifd0Off === 0 || offset + ifd0Off >= bytes.length) return { fields };

  parseIfd(bytes, offset, offset + ifd0Off, littleEndian, fields, 'IFD0', new Set());
  return summarizeTiff(fields);
}

function parseIfd(
  bytes: Uint8Array,
  tiffStart: number,
  ifdAbs: number,
  le: boolean,
  out: MetadataField[],
  ifdName: 'IFD0' | 'Exif' | 'GPS' | 'Interop',
  visited: Set<number>,
): void {
  if (visited.has(ifdAbs) || ifdAbs + 2 > bytes.length) return;
  visited.add(ifdAbs);

  const count = readU16(bytes, ifdAbs, le);
  if (ifdAbs + 2 + count * 12 > bytes.length) return;

  for (let n = 0; n < count; n++) {
    const entry = ifdAbs + 2 + n * 12;
    const tag = readU16(bytes, entry, le);
    const type = readU16(bytes, entry + 2, le);
    const cnt = readU32(bytes, entry + 4, le);
    const valOff = entry + 8;

    // Special: sub-IFDs (тег → IFD)
    if (ifdName === 'IFD0' && tag === 0x8769) {
      const sub = readU32(bytes, valOff, le);
      parseIfd(bytes, tiffStart, tiffStart + sub, le, out, 'Exif', visited);
      continue;
    }
    if (ifdName === 'IFD0' && tag === 0x8825) {
      const sub = readU32(bytes, valOff, le);
      parseIfd(bytes, tiffStart, tiffStart + sub, le, out, 'GPS', visited);
      continue;
    }
    if (ifdName === 'Exif' && tag === 0xa005) {
      const sub = readU32(bytes, valOff, le);
      parseIfd(bytes, tiffStart, tiffStart + sub, le, out, 'Interop', visited);
      continue;
    }

    const value = readEntryValue(bytes, tiffStart, valOff, type, cnt, le);
    const named = nameTag(ifdName, tag, value);
    if (named) out.push(named);
  }
}

function readEntryValue(
  bytes: Uint8Array,
  tiffStart: number,
  valOffPos: number,
  type: number,
  count: number,
  le: boolean,
): unknown {
  // Размер типа
  const typeSize: Record<number, number> = {
    1: 1, // BYTE
    2: 1, // ASCII
    3: 2, // SHORT
    4: 4, // LONG
    5: 8, // RATIONAL
    7: 1, // UNDEFINED
    9: 4, // SLONG
    10: 8, // SRATIONAL
  };
  const sz = typeSize[type];
  if (sz === undefined) return undefined;
  const total = sz * count;
  const dataStart = total <= 4 ? valOffPos : tiffStart + readU32(bytes, valOffPos, le);
  if (dataStart < 0 || dataStart + total > bytes.length) return undefined;

  switch (type) {
    case 1:
    case 7:
      return bytes.subarray(dataStart, dataStart + total);
    case 2: {
      // ASCII (с нулевым терминатором)
      let s = '';
      for (let k = 0; k < count; k++) {
        const c = bytes[dataStart + k]!;
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s;
    }
    case 3: {
      const arr: number[] = [];
      for (let k = 0; k < count; k++) arr.push(readU16(bytes, dataStart + k * 2, le));
      return count === 1 ? arr[0] : arr;
    }
    case 4: {
      const arr: number[] = [];
      for (let k = 0; k < count; k++) arr.push(readU32(bytes, dataStart + k * 4, le));
      return count === 1 ? arr[0] : arr;
    }
    case 5: {
      const arr: number[] = [];
      for (let k = 0; k < count; k++) {
        const num = readU32(bytes, dataStart + k * 8, le);
        const den = readU32(bytes, dataStart + k * 8 + 4, le);
        arr.push(den === 0 ? 0 : num / den);
      }
      return count === 1 ? arr[0] : arr;
    }
    case 9: {
      const arr: number[] = [];
      for (let k = 0; k < count; k++) arr.push(readS32(bytes, dataStart + k * 4, le));
      return count === 1 ? arr[0] : arr;
    }
    case 10: {
      const arr: number[] = [];
      for (let k = 0; k < count; k++) {
        const num = readS32(bytes, dataStart + k * 8, le);
        const den = readS32(bytes, dataStart + k * 8 + 4, le);
        arr.push(den === 0 ? 0 : num / den);
      }
      return count === 1 ? arr[0] : arr;
    }
    default:
      return undefined;
  }
}

// ---- Известные теги ----

function nameTag(ifd: string, tag: number, value: unknown): MetadataField | null {
  const key = `${ifd}:0x${tag.toString(16).padStart(4, '0')}`;

  // IFD0
  if (ifd === 'IFD0') {
    if (tag === 0x010f) return mkText('device', 'make', 'Производитель', value, key);
    if (tag === 0x0110) return mkText('device', 'model', 'Модель устройства', value, key);
    if (tag === 0x0131) return mkText('software', 'software', 'ПО', value, key);
    if (tag === 0x013b) return mkText('author', 'artist', 'Автор', value, key);
    if (tag === 0x8298) return mkText('author', 'copyright', 'Copyright', value, key);
    if (tag === 0x010e) return mkText('description', 'image_description', 'Описание', value, key);
    if (tag === 0x0132) return mkText('datetime', 'datetime', 'Дата изменения', value, key);
    if (tag === 0xc62f) return mkText('serial', 'body_serial', 'Серийник корпуса', value, key);
  }
  // Exif IFD
  if (ifd === 'Exif') {
    if (tag === 0x9003) return mkText('datetime', 'datetime_original', 'Дата съёмки', value, key);
    if (tag === 0x9004)
      return mkText('datetime', 'datetime_digitized', 'Дата оцифровки', value, key);
    if (tag === 0x9290) return mkText('datetime', 'subsec_original', 'Доли секунды', value, key);
    if (tag === 0x9201) return mkText('other', 'shutter_speed', 'Выдержка', value, key);
    if (tag === 0x829a) return mkText('other', 'exposure_time', 'Экспозиция', value, key);
    if (tag === 0x829d) return mkText('other', 'f_number', 'Диафрагма', value, key);
    if (tag === 0x8827) return mkText('other', 'iso', 'ISO', value, key);
    if (tag === 0x920a) return mkText('other', 'focal_length', 'Фокусное расстояние', value, key);
    if (tag === 0xa432) return mkText('device', 'lens_info', 'Объектив (тех.)', value, key);
    if (tag === 0xa433) return mkText('device', 'lens_make', 'Произв. объектива', value, key);
    if (tag === 0xa434) return mkText('device', 'lens_model', 'Объектив', value, key);
    if (tag === 0xa435) return mkText('serial', 'lens_serial', 'Серийник объектива', value, key);
    if (tag === 0xa431) return mkText('serial', 'body_serial_exif', 'Серийник камеры', value, key);
  }
  // GPS IFD — собираем координаты отдельно через специальный маркер
  if (ifd === 'GPS') {
    if (tag === 0x0001) return mkText('gps', 'gps_lat_ref', 'GPS широта (направление)', value, key);
    if (tag === 0x0002) return mkText('gps', 'gps_lat', 'GPS широта', value, key);
    if (tag === 0x0003)
      return mkText('gps', 'gps_lon_ref', 'GPS долгота (направление)', value, key);
    if (tag === 0x0004) return mkText('gps', 'gps_lon', 'GPS долгота', value, key);
    if (tag === 0x0005) return mkText('gps', 'gps_alt_ref', 'GPS высота (знак)', value, key);
    if (tag === 0x0006) return mkText('gps', 'gps_alt', 'GPS высота', value, key);
    if (tag === 0x0007) return mkText('gps', 'gps_time', 'GPS время', value, key);
    if (tag === 0x001d) return mkText('gps', 'gps_date', 'GPS дата', value, key);
    if (tag === 0x001f) return mkText('gps', 'gps_dop', 'GPS точность (DOP)', value, key);
  }

  return null;
}

function mkText(
  group: MetadataGroup,
  key: string,
  label: string,
  value: unknown,
  rawKey: string,
): MetadataField {
  return {
    group,
    key,
    label,
    value: formatValue(value),
    raw: { rawKey, value },
  };
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map((x) => formatValue(x)).join(', ');
  if (v instanceof Uint8Array) return `<${v.length} байт>`;
  return String(v);
}

// ---- Summarize ----

function summarize(fields: MetadataField[]): ReadMetadataResult {
  // Координаты
  let gps: GpsCoordinates | undefined;
  const latArr = pickRaw(fields, 'gps_lat');
  const lonArr = pickRaw(fields, 'gps_lon');
  const latRef = pickValueText(fields, 'gps_lat_ref');
  const lonRef = pickValueText(fields, 'gps_lon_ref');
  if (latArr && lonArr) {
    const lat = dmsToDecimal(latArr, latRef === 'S');
    const lon = dmsToDecimal(lonArr, lonRef === 'W');
    if (lat !== null && lon !== null) {
      gps = { latitude: lat, longitude: lon };
      const altArr = pickRaw(fields, 'gps_alt');
      if (typeof altArr === 'number') {
        gps.altitude = altArr;
      }
    }
  }

  const captured =
    pickValueText(fields, 'datetime_original') ||
    pickValueText(fields, 'datetime_digitized') ||
    pickValueText(fields, 'datetime') ||
    pickValueText(fields, 'png_time');

  const make = pickValueText(fields, 'make');
  const model = pickValueText(fields, 'model');
  const device = [make, model].filter(Boolean).join(' ').trim() || undefined;

  return {
    fields,
    gps,
    capturedAt: captured ? normalizeExifDate(captured) : undefined,
    device,
    totalCount: fields.length,
  };
}

function summarizeTiff(fields: MetadataField[]): TiffReadResult {
  const r = summarize(fields);
  return { fields: r.fields, gps: r.gps, capturedAt: r.capturedAt, device: r.device };
}

function pickRaw(fields: MetadataField[], key: string): unknown {
  for (const f of fields) {
    if (f.key === key) {
      const raw = f.raw as { value?: unknown } | undefined;
      return raw?.value;
    }
  }
  return undefined;
}

function pickValueText(fields: MetadataField[], key: string): string {
  for (const f of fields) {
    if (f.key === key) return f.value;
  }
  return '';
}

function dmsToDecimal(value: unknown, negative: boolean): number | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [d, m, s] = value as [number, number, number];
  if (
    typeof d !== 'number' ||
    typeof m !== 'number' ||
    typeof s !== 'number' ||
    Number.isNaN(d) ||
    Number.isNaN(m) ||
    Number.isNaN(s)
  ) {
    return null;
  }
  const dec = d + m / 60 + s / 3600;
  return negative ? -dec : dec;
}

function normalizeExifDate(s: string): string {
  // EXIF: "YYYY:MM:DD HH:MM:SS"
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  return s;
}

// ---- XMP ----

function pushXmpFields(xmp: string, fields: MetadataField[]): void {
  // Грубо: вытаскиваем основные RDF-теги. XMP-парсинг полноценный не нужен.
  const tryMatch = (re: RegExp, group: MetadataGroup, key: string, label: string): void => {
    const m = xmp.match(re);
    if (m && m[1]) {
      const v = decodeHtmlEntities(m[1].trim());
      if (v) pushFieldIfNew(fields, { group, key, label, value: v });
    }
  };
  tryMatch(
    /<dc:creator>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/,
    'author',
    'xmp_creator',
    'Автор (XMP)',
  );
  tryMatch(
    /<dc:rights>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/,
    'author',
    'xmp_rights',
    'Copyright (XMP)',
  );
  tryMatch(
    /<xmp:CreatorTool>([^<]+)<\/xmp:CreatorTool>/,
    'software',
    'xmp_creator_tool',
    'ПО (XMP)',
  );
  tryMatch(
    /<exif:DateTimeOriginal>([^<]+)<\/exif:DateTimeOriginal>/,
    'datetime',
    'xmp_datetime',
    'Дата (XMP)',
  );
  tryMatch(/<tiff:Make>([^<]+)<\/tiff:Make>/, 'device', 'xmp_make', 'Производитель (XMP)');
  tryMatch(/<tiff:Model>([^<]+)<\/tiff:Model>/, 'device', 'xmp_model', 'Модель (XMP)');
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ---- helpers ----

function readU16(bytes: Uint8Array, o: number, le: boolean): number {
  return le ? readU16LE(bytes, o) : readU16BE(bytes, o);
}
function readU32(bytes: Uint8Array, o: number, le: boolean): number {
  return le ? readU32LE(bytes, o) : readU32BE(bytes, o);
}
function readS32(bytes: Uint8Array, o: number, le: boolean): number {
  const v = readU32(bytes, o, le);
  return v >= 0x80000000 ? v - 0x100000000 : v;
}
function readU16BE(b: Uint8Array, o: number): number {
  return ((b[o]! << 8) | b[o + 1]!) >>> 0;
}
function readU32BE(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}
function readU16LE(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8)) >>> 0;
}
function readU32LE(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}
function readAscii(b: Uint8Array, o: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && o + i < b.length; i++) s += String.fromCharCode(b[o + i]!);
  return s;
}
function findByte(b: Uint8Array, from: number, to: number, byte: number): number {
  for (let i = from; i < to; i++) if (b[i] === byte) return i;
  return -1;
}
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function isPngSignature(b: Uint8Array): boolean {
  return (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}
function isRiffWebp(b: Uint8Array): boolean {
  return (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  );
}
function isTiffHeader(b: Uint8Array, off: number): boolean {
  if (b.length < off + 4) return false;
  const ii = b[off] === 0x49 && b[off + 1] === 0x49 && b[off + 2] === 0x2a && b[off + 3] === 0x00;
  const mm = b[off] === 0x4d && b[off + 1] === 0x4d && b[off + 2] === 0x00 && b[off + 3] === 0x2a;
  return ii || mm;
}
function pushFieldIfNew(arr: MetadataField[], f: MetadataField): void {
  if (!arr.some((x) => x.group === f.group && x.key === f.key)) arr.push(f);
}
