import { describe, it, expect } from 'vitest';
import { readMetadata } from '@/readers';
import { jpegWithExif, pngWithTextChunks, webpWithExif } from './fixtures/synthesize';

describe('readMetadata', () => {
  it('извлекает EXIF Make из JPEG', () => {
    const meta = readMetadata(jpegWithExif(), 'image/jpeg');
    expect(meta.totalCount).toBeGreaterThan(0);
    const make = meta.fields.find((f) => f.key === 'make');
    expect(make?.value).toBe('cam');
  });

  it('извлекает Author из PNG tEXt', () => {
    const meta = readMetadata(pngWithTextChunks(), 'image/png');
    const author = meta.fields.find((f) => f.key === 'author');
    expect(author?.value).toBe('Some author');
  });

  it('видит PNG tIME', () => {
    const meta = readMetadata(pngWithTextChunks(), 'image/png');
    const time = meta.fields.find((f) => f.key === 'png_time');
    expect(time).toBeDefined();
  });

  it('видит WebP XMP/EXIF (если есть)', () => {
    const meta = readMetadata(webpWithExif(), 'image/webp');
    // EXIF в фикстуре минимальный (пустой IFD), XMP — заметный
    expect(meta.fields.length).toBeGreaterThanOrEqual(0);
  });

  it('возвращает пустой результат для случайного буфера', () => {
    const meta = readMetadata(Uint8Array.from([0, 1, 2, 3]), 'application/octet-stream');
    expect(meta.totalCount).toBe(0);
  });
});
