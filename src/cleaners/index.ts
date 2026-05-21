import type { CleanResult, FileTypeInfo, SupportedFamily } from '@/types';
import { detectFileType } from './detect';
import { cleanJpeg } from './jpeg';
import { cleanPng } from './png';
import { cleanWebp } from './webp';
import { cleanGif } from './gif';

export { detectFileType } from './detect';

/**
 * Главная точка входа очистки.
 *
 * Стратегия:
 *  - JPEG/PNG/WebP/GIF — нативные парсеры, мгновенно.
 *  - Всё остальное — через ffmpeg.wasm (ленивая загрузка).
 *
 * ffmpeg здесь импортируется динамически, чтобы основной экран не тащил wasm.
 */
export async function cleanFile(
  file: File,
  type: FileTypeInfo,
  onProgress?: (p: { phase: string; ratio?: number }) => void,
): Promise<CleanResult> {
  const buf = new Uint8Array(await file.arrayBuffer());

  switch (type.family) {
    case 'jpeg':
      onProgress?.({ phase: 'native:jpeg' });
      return cleanJpeg(buf);
    case 'png':
      onProgress?.({ phase: 'native:png' });
      return cleanPng(buf);
    case 'webp':
      onProgress?.({ phase: 'native:webp' });
      return cleanWebp(buf);
    case 'gif':
      onProgress?.({ phase: 'native:gif' });
      return cleanGif(buf);
    case 'heif':
    case 'tiff':
    case 'raw':
    case 'video':
    case 'audio': {
      onProgress?.({ phase: 'ffmpeg:load' });
      const { cleanWithFfmpeg } = await import('./ffmpeg');
      return cleanWithFfmpeg(buf, type, onProgress);
    }
    case 'unknown':
    default:
      throw new Error(`Неподдерживаемый формат: ${type.mime || 'unknown'}`);
  }
}

export function familyFromMime(mime: string): SupportedFamily {
  return detectFileType(new Uint8Array(), mime, '').family;
}
