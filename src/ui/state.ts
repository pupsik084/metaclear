import type { ProcessingItem, ReadMetadataResult, CleanResult } from '@/types';
import { detectFileType } from '@/cleaners/detect';
import { readMetadata } from '@/readers';
import { autoDeleteMs, getSettings, onSettingsChange } from './settings';
import { makeId, suggestCleanName } from './utils';

const listeners = new Set<(items: ProcessingItem[]) => void>();
const items: Map<string, ProcessingItem> = new Map();
const autoDeleteTimers = new Map<string, number>();

onSettingsChange(() => {
  // При смене политики авто-удаления — переустанавливаем таймеры для уже очищенных
  for (const it of items.values()) {
    if (it.status === 'done') scheduleAutoDelete(it.id);
  }
});

function emit(): void {
  const arr = Array.from(items.values());
  for (const cb of listeners) cb(arr);
}

export function onItemsChange(cb: (items: ProcessingItem[]) => void): () => void {
  listeners.add(cb);
  cb(Array.from(items.values()));
  return () => listeners.delete(cb);
}

export function getItems(): ProcessingItem[] {
  return Array.from(items.values());
}

export async function addFiles(files: FileList | File[]): Promise<void> {
  const list = Array.from(files);
  for (const file of list) {
    const id = makeId();
    const bytes = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const type = detectFileType(bytes, file.type, file.name);
    const item: ProcessingItem = {
      id,
      file,
      type,
      status: 'reading',
    };
    items.set(id, item);
    emit();

    // Прочитать метаданные для UI (только превью)
    void readForItem(id);
  }
}

async function readForItem(id: string): Promise<void> {
  const item = items.get(id);
  if (!item) return;
  try {
    const head = new Uint8Array(await item.file.arrayBuffer());
    const meta: ReadMetadataResult = readMetadata(head, item.type.mime);
    item.metadata = meta;
    item.status = 'ready';
  } catch (e) {
    item.status = 'error';
    item.error = (e as Error).message;
  }
  items.set(id, item);
  emit();
}

export async function cleanItem(id: string): Promise<void> {
  const item = items.get(id);
  if (!item) return;
  if (item.type.cleaner === 'unsupported') {
    item.status = 'error';
    item.error = 'Формат не поддерживается';
    emit();
    return;
  }
  item.status = 'cleaning';
  emit();

  try {
    const { cleanFile } = await import('@/cleaners');
    const result: CleanResult = await cleanFile(item.file, item.type);
    item.result = result;
    item.outputName = suggestCleanName(item.file.name, result.outputExt);
    const blob = new Blob([result.output as BlobPart], { type: result.outputMime });
    item.downloadUrl = URL.createObjectURL(blob);
    item.status = 'done';
    scheduleAutoDelete(id);
  } catch (e) {
    item.status = 'error';
    item.error = (e as Error).message;
  }
  items.set(id, item);
  emit();
}

export async function cleanAll(): Promise<void> {
  // Последовательно, чтобы не перегружать память и ffmpeg-инстанс
  for (const it of items.values()) {
    if (it.status === 'ready' && it.type.cleaner !== 'unsupported') {
      await cleanItem(it.id);
    }
  }
}

export function removeItem(id: string): void {
  const item = items.get(id);
  if (!item) return;
  if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
  items.delete(id);
  const tmr = autoDeleteTimers.get(id);
  if (tmr) {
    clearTimeout(tmr);
    autoDeleteTimers.delete(id);
  }
  emit();
}

export function removeAll(): void {
  for (const id of Array.from(items.keys())) removeItem(id);
}

export function markDownloaded(id: string): void {
  const settings = getSettings();
  const policy = autoDeleteMs(settings.autoDelete);
  if (policy === 'immediate') {
    removeItem(id);
  }
}

function scheduleAutoDelete(id: string): void {
  const old = autoDeleteTimers.get(id);
  if (old) {
    clearTimeout(old);
    autoDeleteTimers.delete(id);
  }
  const settings = getSettings();
  const policy = autoDeleteMs(settings.autoDelete);
  if (policy === 'never' || policy === 'immediate') return;
  const ms = policy;
  const tmr = window.setTimeout(() => {
    removeItem(id);
  }, ms);
  autoDeleteTimers.set(id, tmr);
}
