import type { CleanerKind, FileTypeInfo, SupportedFamily } from '@/types';

/**
 * Определение формата по magic-bytes и расширению.
 *
 * Magic-bytes — основной источник правды, расширение/MIME используются
 * как подсказки для контейнерных RAW.
 */
export function detectFileType(bytes: Uint8Array, mime: string, name: string): FileTypeInfo {
  const ext = (name.split('.').pop() ?? '').toLowerCase();

  // --- JPEG ---
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return native('jpeg', 'image/jpeg', 'jpg', 'JPEG');
  }

  // --- PNG ---
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return native('png', 'image/png', 'png', 'PNG');
  }

  // --- GIF87a / GIF89a ---
  if (bytes.length >= 6) {
    const head = String.fromCharCode(...bytes.subarray(0, 6));
    if (head === 'GIF87a' || head === 'GIF89a') {
      return native('gif', 'image/gif', 'gif', 'GIF');
    }
  }

  // --- RIFF: WebP или WAV ---
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 // "RIFF"
  ) {
    const fourcc = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (fourcc === 'WEBP') {
      return native('webp', 'image/webp', 'webp', 'WebP');
    }
    if (fourcc === 'WAVE') {
      return ffmpeg('audio', 'audio/wav', 'wav', 'WAV');
    }
  }

  // --- ISO BMFF (HEIC/HEIF/AVIF/MP4/MOV) ---
  // Структура: [4 байта size][4 байта 'ftyp'][4 байта major brand]...
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    // HEIF/HEIC семейство
    if (
      brand === 'heic' ||
      brand === 'heix' ||
      brand === 'mif1' ||
      brand === 'msf1' ||
      brand === 'hevc' ||
      brand === 'heim' ||
      brand === 'heis'
    ) {
      return ffmpeg('heif', 'image/heic', 'heic', 'HEIC/HEIF');
    }
    // AVIF
    if (brand === 'avif' || brand === 'avis') {
      return ffmpeg('heif', 'image/avif', 'avif', 'AVIF');
    }
    // MP4 / MOV / M4A
    if (brand === 'qt  ') return ffmpeg('video', 'video/quicktime', 'mov', 'MOV');
    if (brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ') {
      return ffmpeg('audio', 'audio/mp4', 'm4a', 'M4A');
    }
    // MP4 brands
    if (
      brand === 'isom' ||
      brand === 'iso2' ||
      brand === 'mp41' ||
      brand === 'mp42' ||
      brand === 'avc1' ||
      brand === 'dash'
    ) {
      return ffmpeg('video', 'video/mp4', 'mp4', 'MP4');
    }
  }

  // --- Matroska / WebM ---
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    // EBML заголовок; различаем по mime/расширению
    if (mime === 'video/webm' || ext === 'webm') {
      return ffmpeg('video', 'video/webm', 'webm', 'WebM');
    }
    return ffmpeg('video', 'video/x-matroska', 'mkv', 'MKV');
  }

  // --- TIFF (Intel/Motorola) ---
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) {
    // RAW-форматы Canon CR2 = TIFF + спец.IFD
    if (ext === 'cr2' || ext === 'nef' || ext === 'arw' || ext === 'dng' || ext === 'raf') {
      return ffmpeg('raw', `image/x-${ext}`, ext, `RAW (${ext.toUpperCase()})`);
    }
    return ffmpeg('tiff', 'image/tiff', 'tif', 'TIFF');
  }

  // --- ID3 / MP3 ---
  if (
    bytes.length >= 3 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || // ID3
      (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)) // raw MP3 frame
  ) {
    return ffmpeg('audio', 'audio/mpeg', 'mp3', 'MP3');
  }

  // --- FLAC ---
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return ffmpeg('audio', 'audio/flac', 'flac', 'FLAC');
  }

  // --- OGG ---
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return ffmpeg('audio', 'audio/ogg', 'ogg', 'OGG');
  }

  // --- RAW по расширению, если magic не распознан ---
  const rawExts = new Set(['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw']);
  if (rawExts.has(ext)) {
    return ffmpeg('raw', `image/x-${ext}`, ext, `RAW (${ext.toUpperCase()})`);
  }

  // --- Fallback по mime ---
  if (mime.startsWith('image/')) {
    return ffmpeg('heif', mime, ext || 'img', mime.split('/')[1]?.toUpperCase() ?? 'Image');
  }
  if (mime.startsWith('video/')) {
    return ffmpeg('video', mime, ext || 'mp4', mime.split('/')[1]?.toUpperCase() ?? 'Video');
  }
  if (mime.startsWith('audio/')) {
    return ffmpeg('audio', mime, ext || 'audio', mime.split('/')[1]?.toUpperCase() ?? 'Audio');
  }

  return {
    family: 'unknown',
    mime: mime || 'application/octet-stream',
    ext: ext || 'bin',
    cleaner: 'unsupported',
    label: 'Неизвестный формат',
  };
}

function native(family: SupportedFamily, mime: string, ext: string, label: string): FileTypeInfo {
  return { family, mime, ext, cleaner: 'native' satisfies CleanerKind, label };
}

function ffmpeg(family: SupportedFamily, mime: string, ext: string, label: string): FileTypeInfo {
  return { family, mime, ext, cleaner: 'ffmpeg' satisfies CleanerKind, label };
}
