import { describe, it, expect } from 'vitest';
import { cleanJpeg } from '@/cleaners/jpeg';
import { cleanPng } from '@/cleaners/png';
import { cleanWebp } from '@/cleaners/webp';
import { cleanGif } from '@/cleaners/gif';
import { detectFileType } from '@/cleaners/detect';
import {
  jpegWithExif,
  pngWithTextChunks,
  webpWithExif,
  gifWithComment,
} from './fixtures/synthesize';

describe('cleanJpeg', () => {
  const input = jpegWithExif();

  it('возвращает валидный JPEG (SOI + EOI)', () => {
    const { output } = cleanJpeg(input);
    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xd8);
    expect(output[output.length - 2]).toBe(0xff);
    expect(output[output.length - 1]).toBe(0xd9);
  });

  it('удаляет APP1 (EXIF) и COM', () => {
    const { output } = cleanJpeg(input);
    expect(hasMarker(output, 0xe1)).toBe(false);
    expect(hasMarker(output, 0xfe)).toBe(false);
  });

  it('сохраняет APP0 JFIF (заголовок совместимости)', () => {
    const { output } = cleanJpeg(input);
    expect(hasMarker(output, 0xe0)).toBe(true);
  });

  it('размер выходного файла меньше входного', () => {
    const { output, inputSize, outputSize } = cleanJpeg(input);
    expect(outputSize).toBeLessThan(inputSize);
    expect(outputSize).toBe(output.length);
  });

  it('сохраняет SOF/DQT/DHT/SOS', () => {
    const { output } = cleanJpeg(input);
    expect(hasMarker(output, 0xc0)).toBe(true); // SOF0
    expect(hasMarker(output, 0xdb)).toBe(true); // DQT
    expect(hasMarker(output, 0xc4)).toBe(true); // DHT
    expect(hasMarker(output, 0xda)).toBe(true); // SOS
  });

  it('byte-stuffed 0xFF 0x00 в энтропийном потоке остаётся', () => {
    const { output } = cleanJpeg(input);
    let stuffedCount = 0;
    for (let i = 0; i < output.length - 1; i++) {
      if (output[i] === 0xff && output[i + 1] === 0x00) stuffedCount++;
    }
    expect(stuffedCount).toBeGreaterThanOrEqual(1);
  });

  it('бросает понятную ошибку для не-JPEG', () => {
    expect(() => cleanJpeg(Uint8Array.from([0x00, 0x01, 0x02]))).toThrow(/JPEG/);
  });
});

describe('cleanPng', () => {
  const input = pngWithTextChunks();

  it('возвращает валидный PNG (signature + IEND)', () => {
    const { output } = cleanPng(input);
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) expect(output[i]).toBe(sig[i]);
    expect(asAscii(output, output.length - 8, 4)).toBe('IEND');
  });

  it('удаляет tEXt, tIME, eXIf', () => {
    const { output } = cleanPng(input);
    expect(containsChunk(output, 'tEXt')).toBe(false);
    expect(containsChunk(output, 'tIME')).toBe(false);
    expect(containsChunk(output, 'eXIf')).toBe(false);
  });

  it('сохраняет IHDR и IDAT', () => {
    const { output } = cleanPng(input);
    expect(containsChunk(output, 'IHDR')).toBe(true);
    expect(containsChunk(output, 'IDAT')).toBe(true);
  });

  it('размер выхода меньше входа', () => {
    const { inputSize, outputSize } = cleanPng(input);
    expect(outputSize).toBeLessThan(inputSize);
  });
});

describe('cleanWebp', () => {
  const input = webpWithExif();

  it('возвращает валидный RIFF/WEBP', () => {
    const { output } = cleanWebp(input);
    expect(asAscii(output, 0, 4)).toBe('RIFF');
    expect(asAscii(output, 8, 4)).toBe('WEBP');
  });

  it('удаляет EXIF и XMP чанки', () => {
    const { output } = cleanWebp(input);
    expect(hasFourcc(output, 'EXIF')).toBe(false);
    expect(hasFourcc(output, 'XMP ')).toBe(false);
  });

  it('сохраняет VP8X и VP8L', () => {
    const { output } = cleanWebp(input);
    expect(hasFourcc(output, 'VP8X')).toBe(true);
    expect(hasFourcc(output, 'VP8L')).toBe(true);
  });

  it('обнуляет флаги EXIF/XMP в VP8X', () => {
    const { output } = cleanWebp(input);
    // Находим VP8X payload (первый байт payload = flags)
    let i = 12;
    while (i < output.length - 8) {
      const fourcc = asAscii(output, i, 4);
      const size = readU32LE(output, i + 4);
      if (fourcc === 'VP8X') {
        const flags = output[i + 8]!;
        expect(flags & (1 << 3)).toBe(0); // EXIF
        expect(flags & (1 << 2)).toBe(0); // XMP
        break;
      }
      i += 8 + size + (size & 1);
    }
  });
});

describe('cleanGif', () => {
  const input = gifWithComment();

  it('возвращает валидный GIF (header + trailer)', () => {
    const { output } = cleanGif(input);
    expect(asAscii(output, 0, 6)).toBe('GIF89a');
    expect(output[output.length - 1]).toBe(0x3b);
  });

  it('удаляет Comment Extension', () => {
    const { output } = cleanGif(input);
    expect(containsExtensionLabel(output, 0xfe)).toBe(false);
  });

  it('сохраняет NETSCAPE2.0 (нужно для loop animation)', () => {
    const { output } = cleanGif(input);
    expect(containsAppId(output, 'NETSCAPE2.0')).toBe(true);
  });

  it('удаляет XMP Application Extension', () => {
    const { output } = cleanGif(input);
    expect(containsAppId(output, 'XMP DataXMP')).toBe(false);
  });
});

describe('detectFileType', () => {
  it('распознаёт JPEG по magic', () => {
    const r = detectFileType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), '', 'photo.jpg');
    expect(r.family).toBe('jpeg');
    expect(r.cleaner).toBe('native');
  });

  it('распознаёт PNG по сигнатуре', () => {
    const r = detectFileType(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
      '',
      '',
    );
    expect(r.family).toBe('png');
  });

  it('распознаёт WebP по RIFF/WEBP', () => {
    const r = detectFileType(
      Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      '',
      '',
    );
    expect(r.family).toBe('webp');
  });

  it('распознаёт GIF', () => {
    const r = detectFileType(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), '', '');
    expect(r.family).toBe('gif');
  });

  it('распознаёт HEIC по ftyp brand', () => {
    const bytes = new Uint8Array(16);
    bytes.set([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
    const r = detectFileType(bytes, '', 'photo.heic');
    expect(r.family).toBe('heif');
    expect(r.cleaner).toBe('ffmpeg');
  });

  it('распознаёт RAW по расширению', () => {
    const r = detectFileType(new Uint8Array(8), '', 'photo.cr2');
    expect(r.family).toBe('raw');
  });

  it('возвращает unknown для мусора', () => {
    const r = detectFileType(Uint8Array.from([0x00, 0x01]), '', 'x.zzz');
    expect(r.family).toBe('unknown');
  });
});

// ---- helpers ----

function hasMarker(bytes: Uint8Array, marker: number): boolean {
  // Проходим по JPEG-структуре с учётом byte-stuffing
  let i = 2; // skip SOI
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const m = bytes[i + 1]!;
    if (m === 0x00 || m === 0xff) {
      i++;
      continue;
    }
    if (m === marker) return true;
    if (m === 0xda) {
      // достигли SOS — дальше энтропия
      // Маркер мог быть только до этой точки
      return marker === 0xda ? true : false;
    }
    i += 2;
    // Skip segment if has length
    if (m !== 0xd8 && m !== 0xd9 && !(m >= 0xd0 && m <= 0xd7)) {
      if (i + 2 > bytes.length) return false;
      const len = (bytes[i]! << 8) | bytes[i + 1]!;
      i += len;
    }
  }
  return false;
}

function asAscii(b: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[off + i]!);
  return s;
}

function containsChunk(bytes: Uint8Array, type: string): boolean {
  let i = 8;
  while (i + 8 <= bytes.length) {
    const len = (bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!;
    const t = asAscii(bytes, i + 4, 4);
    if (t === type) return true;
    i += 8 + (len >>> 0) + 4;
  }
  return false;
}

function hasFourcc(bytes: Uint8Array, fourcc: string): boolean {
  let i = 12;
  while (i + 8 <= bytes.length) {
    const t = asAscii(bytes, i, 4);
    const s = readU32LE(bytes, i + 4);
    if (t === fourcc) return true;
    i += 8 + s + (s & 1);
  }
  return false;
}

function readU32LE(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

function containsExtensionLabel(bytes: Uint8Array, label: number): boolean {
  for (let i = 13; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === label) return true;
  }
  return false;
}

function containsAppId(bytes: Uint8Array, id: string): boolean {
  for (let i = 13; i + 13 < bytes.length; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xff && bytes[i + 2] === 0x0b) {
      if (asAscii(bytes, i + 3, 11) === id) return true;
    }
  }
  return false;
}
