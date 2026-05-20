/**
 * Общие типы для metaclear.
 *
 * Принцип: всё, что пересекает границы модулей, описано здесь.
 * Никаких `any` в публичных API.
 */

export type SupportedFamily =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'heif' // включает HEIC, HEIF, AVIF
  | 'tiff'
  | 'raw' // CR2/CR3/NEF/ARW/DNG/RAF и т.п.
  | 'video'
  | 'audio'
  | 'unknown';

export type CleanerKind = 'native' | 'ffmpeg' | 'unsupported';

export interface FileTypeInfo {
  family: SupportedFamily;
  mime: string;
  ext: string;
  cleaner: CleanerKind;
  /** Человекочитаемая метка (для UI). */
  label: string;
}

/** Поле метаданных, найденное в файле (для UI-превью). */
export interface MetadataField {
  /** Стабильный ключ группы: gps, datetime, device, author, serial, thumbnail, raw. */
  group: MetadataGroup;
  /** Машинно-читаемый ключ внутри группы. */
  key: string;
  /** Человекочитаемая метка. */
  label: string;
  /** Значение в человекочитаемой форме. */
  value: string;
  /** Сырое значение (для отладки и сырого списка). */
  raw?: unknown;
}

export type MetadataGroup =
  | 'gps'
  | 'datetime'
  | 'device'
  | 'author'
  | 'serial'
  | 'thumbnail'
  | 'description'
  | 'software'
  | 'other';

export interface GpsCoordinates {
  /** Десятичные градусы, юг — отрицательный. */
  latitude: number;
  /** Десятичные градусы, запад — отрицательный. */
  longitude: number;
  /** Высота в метрах над уровнем моря, если есть. */
  altitude?: number;
}

export interface ReadMetadataResult {
  /** Все найденные поля, плоско. */
  fields: MetadataField[];
  /** Извлечённые GPS-координаты для мини-карты. */
  gps?: GpsCoordinates;
  /** Дата съёмки (ISO 8601, локальное время без сдвига если неизвестно). */
  capturedAt?: string;
  /** Модель устройства (короткая строка для UI). */
  device?: string;
  /** Сырое количество распознанных полей (для счётчика «Показать все NN»). */
  totalCount: number;
}

export interface CleanResult {
  /** Очищенный файл. */
  output: Uint8Array;
  /** MIME-тип результата (обычно совпадает с входом). */
  outputMime: string;
  /** Расширение результата без точки. */
  outputExt: string;
  /** Размер входа в байтах. */
  inputSize: number;
  /** Размер выхода в байтах. */
  outputSize: number;
  /** Сколько полей метаданных было удалено (если посчитано). */
  removedFieldsCount?: number;
  /** Опциональные диагностические заметки (например, «убран EXIF, APP1»). */
  notes?: string[];
}

export interface ProcessingItem {
  id: string;
  file: File;
  type: FileTypeInfo;
  status: 'idle' | 'reading' | 'ready' | 'cleaning' | 'done' | 'error';
  metadata?: ReadMetadataResult;
  result?: CleanResult;
  error?: string;
  /** URL для скачивания (object URL). */
  downloadUrl?: string;
  /** Имя файла на выходе (с суффиксом _clean). */
  outputName?: string;
}
