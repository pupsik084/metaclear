/**
 * Синтетические fixtures для тестов.
 *
 * Создаём минимально валидные файлы с метаданными прямо в памяти —
 * никаких реальных пользовательских данных в репо.
 */

// ---- helpers ----

function concat(...arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function u8(...bytes: number[]): Uint8Array {
  return Uint8Array.from(bytes);
}

function u16BE(n: number): Uint8Array {
  return Uint8Array.from([(n >> 8) & 0xff, n & 0xff]);
}

function u32BE(n: number): Uint8Array {
  return Uint8Array.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function u32LE(n: number): Uint8Array {
  return Uint8Array.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// CRC-32 (PNG)
const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- JPEG ----

/**
 * Минимальный валидный JPEG (single 8x8 pixel grayscale) с APP0 JFIF,
 * APP1 EXIF (мусорный payload), COM-сегментом и одним пиксельным SOS.
 *
 * Цель — проверить, что cleaner вырежет APP1+COM, оставит JFIF и
 * не повредит SOI/SOF/DQT/DHT/SOS/EOI/энтропийный поток.
 */
export function jpegWithExif(): Uint8Array {
  // SOI
  const soi = u8(0xff, 0xd8);

  // APP0 JFIF
  const jfifId = ascii('JFIF\0');
  const jfifPayload = u8(
    0x01,
    0x01, // version
    0x00, // units
    0x00,
    0x48, // X density
    0x00,
    0x48, // Y density
    0x00,
    0x00, // thumbnail w/h
  );
  const jfifBody = concat(jfifId, jfifPayload);
  const app0 = concat(u8(0xff, 0xe0), u16BE(jfifBody.length + 2), jfifBody);

  // APP1 EXIF (Exif\0\0 + TIFF II + минимальный IFD)
  // II*\0 ifd_off=8, ifd: count=1, tag=0x010F (Make), type=ASCII, count=4, val="cam\0"
  const exifId = ascii('Exif\0\0');
  const tiff = concat(
    u8(0x49, 0x49, 0x2a, 0x00),
    u32LE(8),
    Uint8Array.from([0x01, 0x00]), // entry count = 1 LE
    Uint8Array.from([0x0f, 0x01]), // tag 0x010F LE = Make
    Uint8Array.from([0x02, 0x00]), // type ASCII
    u32LE(4), // count
    ascii('cam\0'), // 4 bytes inline
    u32LE(0), // next IFD = 0
  );
  const app1Body = concat(exifId, tiff);
  const app1 = concat(u8(0xff, 0xe1), u16BE(app1Body.length + 2), app1Body);

  // COM
  const comBody = ascii('A comment we want stripped');
  const com = concat(u8(0xff, 0xfe), u16BE(comBody.length + 2), comBody);

  // DQT (luma quant, all 16)
  const dqtBody = concat(u8(0x00), new Uint8Array(64).fill(16));
  const dqt = concat(u8(0xff, 0xdb), u16BE(dqtBody.length + 2), dqtBody);

  // SOF0 (Y 8x8, 1 component grayscale)
  const sof0Body = concat(
    u8(0x08), // precision
    u16BE(8), // height
    u16BE(8), // width
    u8(0x01), // num components
    u8(0x01, 0x11, 0x00), // Y: id=1, sampling 1x1, quant table 0
  );
  const sof0 = concat(u8(0xff, 0xc0), u16BE(sof0Body.length + 2), sof0Body);

  // DHT (минимальные таблицы — DC и AC luma из стандарта Annex K)
  const dhtBody = concat(
    u8(0x00), // table class 0, dest id 0 (DC0)
    // bits: 0,1,5,1,1,1,1,1,1,0,0,0,0,0,0,0
    u8(0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0),
    // values
    u8(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11),
  );
  const dht = concat(u8(0xff, 0xc4), u16BE(dhtBody.length + 2), dhtBody);
  const dhtAcBody = concat(
    u8(0x10), // table class 1, dest 0 (AC0)
    u8(0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d),
    u8(
      0x01,
      0x02,
      0x03,
      0x00,
      0x04,
      0x11,
      0x05,
      0x12,
      0x21,
      0x31,
      0x41,
      0x06,
      0x13,
      0x51,
      0x61,
      0x07,
      0x22,
      0x71,
      0x14,
      0x32,
      0x81,
      0x91,
      0xa1,
      0x08,
      0x23,
      0x42,
      0xb1,
      0xc1,
      0x15,
      0x52,
      0xd1,
      0xf0,
      0x24,
      0x33,
      0x62,
      0x72,
      0x82,
      0x09,
      0x0a,
      0x16,
      0x17,
      0x18,
      0x19,
      0x1a,
      0x25,
      0x26,
      0x27,
      0x28,
      0x29,
      0x2a,
      0x34,
      0x35,
      0x36,
      0x37,
      0x38,
      0x39,
      0x3a,
      0x43,
      0x44,
      0x45,
      0x46,
      0x47,
      0x48,
      0x49,
      0x4a,
      0x53,
      0x54,
      0x55,
      0x56,
      0x57,
      0x58,
      0x59,
      0x5a,
      0x63,
      0x64,
      0x65,
      0x66,
      0x67,
      0x68,
      0x69,
      0x6a,
      0x73,
      0x74,
      0x75,
      0x76,
      0x77,
      0x78,
      0x79,
      0x7a,
      0x83,
      0x84,
      0x85,
      0x86,
      0x87,
      0x88,
      0x89,
      0x8a,
      0x92,
      0x93,
      0x94,
      0x95,
      0x96,
      0x97,
      0x98,
      0x99,
      0x9a,
      0xa2,
      0xa3,
      0xa4,
      0xa5,
      0xa6,
      0xa7,
      0xa8,
      0xa9,
      0xaa,
      0xb2,
      0xb3,
      0xb4,
      0xb5,
      0xb6,
      0xb7,
      0xb8,
      0xb9,
      0xba,
      0xc2,
      0xc3,
      0xc4,
      0xc5,
      0xc6,
      0xc7,
      0xc8,
      0xc9,
      0xca,
      0xd2,
      0xd3,
      0xd4,
      0xd5,
      0xd6,
      0xd7,
      0xd8,
      0xd9,
      0xda,
      0xe1,
      0xe2,
      0xe3,
      0xe4,
      0xe5,
      0xe6,
      0xe7,
      0xe8,
      0xe9,
      0xea,
      0xf1,
      0xf2,
      0xf3,
      0xf4,
      0xf5,
      0xf6,
      0xf7,
      0xf8,
      0xf9,
      0xfa,
    ),
  );
  const dhtAc = concat(u8(0xff, 0xc4), u16BE(dhtAcBody.length + 2), dhtAcBody);

  // SOS + crafted entropy data (dummy stream, may not actually decode but маркеры валидны)
  const sosHdr = concat(
    u8(0x01), // 1 component
    u8(0x01, 0x00), // component 1, DC/AC ids
    u8(0x00, 0x3f, 0x00), // spectral start/end, approx
  );
  const sos = concat(u8(0xff, 0xda), u16BE(sosHdr.length + 2), sosHdr);
  // Энтропийные данные: единственный 0xFF должен быть stuffed как 0xFF 0x00.
  const entropy = u8(0xfc, 0xff, 0x00, 0x12, 0x34);
  const eoi = u8(0xff, 0xd9);

  return concat(soi, app0, app1, com, dqt, sof0, dht, dhtAc, sos, entropy, eoi);
}

// ---- PNG ----

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = ascii(type);
  const len = u32BE(data.length);
  const crc = u32BE(crc32(concat(typeBytes, data)));
  return concat(len, typeBytes, data, crc);
}

export function pngWithTextChunks(): Uint8Array {
  const sig = u8(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

  // IHDR: 1x1, bit depth 8, color type 0 (grayscale)
  const ihdr = pngChunk('IHDR', concat(u32BE(1), u32BE(1), u8(0x08, 0x00, 0x00, 0x00, 0x00)));

  // tEXt: "Author\0Some author"
  const textData = concat(ascii('Author'), u8(0x00), ascii('Some author'));
  const text = pngChunk('tEXt', textData);

  // tIME: 2024-01-01 12:00:00 UTC
  const time = pngChunk('tIME', concat(u16BE(2024), u8(0x01, 0x01, 0x0c, 0x00, 0x00)));

  // eXIf — пустой TIFF II*\0 + offset to empty IFD0=8, count=0, next=0
  const exif = pngChunk(
    'eXIf',
    concat(u8(0x49, 0x49, 0x2a, 0x00), u32LE(8), u8(0x00, 0x00), u32LE(0)),
  );

  // IDAT с минимальным валидным zlib для 1x1 grayscale (заранее вычисленный поток)
  // Это zlib-обёрнутый deflate стрим для 1-байтового scanline: [filter=0][pixel=0x00].
  // Получено из zlib.compress(b'\x00\x00') стандарта.
  const idat = pngChunk(
    'IDAT',
    Uint8Array.from([0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01]),
  );

  // IEND
  const iend = pngChunk('IEND', new Uint8Array(0));

  return concat(sig, ihdr, text, time, exif, idat, iend);
}

// ---- WebP ----

export function webpWithExif(): Uint8Array {
  // VP8L: lossless WebP минимальный 1x1 pixel.
  // Структура VP8L payload: 0x2f signature, width-1 (14 bits), height-1 (14 bits),
  // alpha (1 bit), version (3 bits), потом данные.
  // Для теста используем заранее вычисленный валидный VP8L (1x1 чёрный).
  const vp8lData = Uint8Array.from([
    0x2f, 0x00, 0x00, 0x00, 0x00, 0x88, 0x88, 0x08, 0x07, 0x00, 0x00, 0x00,
  ]);

  // VP8X с флагами EXIF (bit 3) + XMP (bit 2) выставлены
  const vp8x = chunk('VP8X', concat(u8(0b00001100, 0, 0, 0), u8(0, 0, 0), u8(0, 0, 0)));

  // EXIF chunk (мусорный, главное — есть)
  const exif = chunk('EXIF', ascii('II*\0\x08\x00\x00\x00\x00\x00\x00\x00'));

  // XMP chunk
  const xmp = chunk('XMP ', ascii('<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>'));

  const vp8l = chunk('VP8L', vp8lData);

  const body = concat(vp8x, exif, xmp, vp8l);
  const riff = concat(ascii('RIFF'), u32LE(body.length + 4), ascii('WEBP'), body);
  return riff;
}

function chunk(fourcc: string, data: Uint8Array): Uint8Array {
  const padded = data.length & 1 ? concat(data, u8(0)) : data;
  return concat(ascii(fourcc), u32LE(data.length), padded);
}

// ---- GIF ----

export function gifWithComment(): Uint8Array {
  // Header GIF89a
  const header = ascii('GIF89a');
  // LSD: 1x1, no GCT, packed=0, bgIndex=0, ratio=0
  const lsd = concat(u16LE(1), u16LE(1), u8(0x00, 0x00, 0x00));

  // Comment Extension (вырезать) — sub-block: размер=10, потом 10 байт, потом терминатор 0x00
  const comment = concat(u8(0x21, 0xfe, 10), ascii('hello GIF!'), u8(0x00));

  // Application Extension XMP (вырезать) — id=11 байт + sub-block 5 байт + терминатор
  const xmp = concat(u8(0x21, 0xff, 11), ascii('XMP DataXMP'), u8(5), ascii('abbbc'), u8(0x00));

  // Application Extension NETSCAPE2.0 (оставить — нужно для loop)
  const netscape = concat(
    u8(0x21, 0xff, 11),
    ascii('NETSCAPE2.0'),
    u8(3, 0x01, 0x00, 0x00),
    u8(0x00),
  );

  // Image Descriptor (0x2C), 0,0, 1x1, no LCT
  const imgDesc = concat(u8(0x2c), u16LE(0), u16LE(0), u16LE(1), u16LE(1), u8(0x00));
  // LZW min code size 2, sub-block: 2 bytes, terminator
  const imgData = u8(0x02, 0x02, 0x44, 0x01, 0x00);

  const trailer = u8(0x3b);

  return concat(header, lsd, comment, xmp, netscape, imgDesc, imgData, trailer);
}

function u16LE(n: number): Uint8Array {
  return Uint8Array.from([n & 0xff, (n >>> 8) & 0xff]);
}
