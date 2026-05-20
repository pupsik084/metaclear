import type { CleanResult, FileTypeInfo } from '@/types';

/**
 * Ленивая обёртка над ffmpeg.wasm.
 *
 * Загружает core (~25 МБ) только при первом вызове. После загрузки
 * браузер кэширует wasm. Используется только в Супер-режиме и для
 * форматов, которые нативно не разобрать.
 */

type FfmpegProgressEvent = { progress: number; time: number };

interface FfmpegLib {
  FFmpeg: new () => FfmpegInstance;
}

interface FfmpegInstance {
  load(opts: { coreURL: string; wasmURL: string; workerURL?: string }): Promise<void>;
  loaded: boolean;
  on(event: 'progress', cb: (e: FfmpegProgressEvent) => void): void;
  on(event: 'log', cb: (e: { message: string }) => void): void;
  off?(event: string, cb: (...args: unknown[]) => void): void;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<void>;
  exec(args: string[]): Promise<number>;
}

let cached: FfmpegInstance | null = null;
let loading: Promise<FfmpegInstance> | null = null;

const CORE_VERSION = '0.12.6';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

async function getFfmpeg(
  onProgress?: (p: { phase: string; ratio?: number }) => void,
): Promise<FfmpegInstance> {
  if (cached) return cached;
  if (loading) return loading;

  loading = (async () => {
    onProgress?.({ phase: 'ffmpeg:import' });
    const mod = (await import('@ffmpeg/ffmpeg')) as unknown as FfmpegLib;
    const ffmpeg = new mod.FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
      onProgress?.({ phase: 'ffmpeg:exec', ratio: Math.max(0, Math.min(1, progress)) });
    });

    onProgress?.({ phase: 'ffmpeg:load' });
    await ffmpeg.load({
      coreURL: `${CORE_BASE}/ffmpeg-core.js`,
      wasmURL: `${CORE_BASE}/ffmpeg-core.wasm`,
    });

    cached = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/** Очистка метаданных через ffmpeg -c copy без перекодирования. */
export async function cleanWithFfmpeg(
  input: Uint8Array,
  type: FileTypeInfo,
  onProgress?: (p: { phase: string; ratio?: number }) => void,
): Promise<CleanResult> {
  const ffmpeg = await getFfmpeg(onProgress);

  const ext = type.ext || guessExt(type.mime);
  const inputName = `input.${ext}`;
  const outputExt = pickOutputExt(type);
  const outputName = `output.${outputExt}`;

  onProgress?.({ phase: 'ffmpeg:write' });
  await ffmpeg.writeFile(inputName, input);

  // Для RAW: ffmpeg может декодировать через image2 → выходом будет JPG.
  // Для всего остального — copy.
  const args = buildArgs(inputName, outputName, type);
  onProgress?.({ phase: 'ffmpeg:exec', ratio: 0 });
  const code = await ffmpeg.exec(args);
  if (code !== 0) {
    throw new Error(`ffmpeg вышел с кодом ${code}. Возможно, формат не поддерживается этим билдом ffmpeg.wasm.`);
  }

  onProgress?.({ phase: 'ffmpeg:read' });
  const out = await ffmpeg.readFile(outputName);
  const data = out instanceof Uint8Array ? out : new TextEncoder().encode(out);

  // Уборка
  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
  } catch {
    // не критично
  }

  return {
    output: data,
    outputMime: pickOutputMime(type, outputExt),
    outputExt,
    inputSize: input.length,
    outputSize: data.length,
    notes: ['Обработка через ffmpeg.wasm: -map_metadata -1 -map_chapters -1 -c copy'],
  };
}

function buildArgs(input: string, output: string, type: FileTypeInfo): string[] {
  if (type.family === 'raw') {
    // RAW → JPG: декодируем + выкидываем метаданные (re-encode неизбежен)
    return [
      '-i',
      input,
      '-map_metadata',
      '-1',
      '-frames:v',
      '1',
      '-q:v',
      '2',
      output,
    ];
  }
  return [
    '-i',
    input,
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-c',
    'copy',
    output,
  ];
}

function pickOutputExt(type: FileTypeInfo): string {
  if (type.family === 'raw') return 'jpg';
  return type.ext || guessExt(type.mime);
}

function pickOutputMime(type: FileTypeInfo, ext: string): string {
  if (type.family === 'raw') return 'image/jpeg';
  return type.mime || `application/${ext}`;
}

function guessExt(mime: string): string {
  const part = mime.split('/')[1] ?? 'bin';
  return part.split(';')[0] ?? 'bin';
}

/** Используется в тестах и в UI «выгрузить ffmpeg из памяти». */
export function resetFfmpegForTests(): void {
  cached = null;
  loading = null;
}
