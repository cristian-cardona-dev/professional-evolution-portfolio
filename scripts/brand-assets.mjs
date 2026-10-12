#!/usr/bin/env node
/**
 * brand-assets.mjs — generate the binary brand assets with zero dependencies.
 *
 * Run manually: `npm run assets:generate` (root). It is intentionally NOT part
 * of the web build: the output is committed once and the build copies it from
 * `web/public/`, so a build never needs a PNG encoder.
 *
 * Outputs (both idempotent — running twice writes byte-identical files):
 *   - web/public/favicon.ico   32x32 + 16x16 PNG frames, dark bg, "CC" monogram
 *   - web/public/og-cover.png  1200x630 social card
 *
 * How it works:
 *   - A minimal PNG encoder (IHDR / IDAT via `zlib.deflateSync` / IEND, with a
 *     CRC32 table). No image library, no network.
 *   - A minimal ICO container writer (ICONDIR / ICONDIRENTRY) that embeds the
 *     PNG frames directly, which every current browser understands.
 *   - A tiny 5x7 bitmap font covering A-Z, 0-9, space, hyphen, dot and slash —
 *     enough for the two strings the assets actually draw.
 *
 * The palette matches the site tokens: dark background #0a192f, accent #64ffda,
 * with #112240 for the card border and #ccd6f6 / #98a2c2 for the type ramp.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'web', 'public');

/* ---------------------------------------------------------------------- */
/* PNG encoder                                                             */
/* ---------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (as PNG specifies) over a buffer. */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One length-prefixed, CRC-suffixed PNG chunk. */
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** Encode an RGBA byte buffer (width*height*4) as an 8-bit RGBA PNG. */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive
  ihdr[12] = 0; // interlace: none

  // Every scanline is prefixed by its filter byte (0 = none). The image is flat
  // enough that adaptive filtering would not pay for itself, and a constant
  // filter keeps the output deterministic across runs.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------------- */
/* ICO container                                                           */
/* ---------------------------------------------------------------------- */

/**
 * Build an .ico from PNG frames. Each entry stores the frame's own PNG bytes,
 * which is the format Vista and every later Windows/browser accepts.
 */
function encodeIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const entries = frames.map((frame) => {
    const entry = Buffer.alloc(16);
    entry[0] = frame.width >= 256 ? 0 : frame.width;
    entry[1] = frame.height >= 256 ? 0 : frame.height;
    entry[2] = 0; // palette size (0 = truecolour)
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(frame.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += frame.png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.png)]);
}

/* ---------------------------------------------------------------------- */
/* Tiny RGBA canvas + 5x7 bitmap font                                      */
/* ---------------------------------------------------------------------- */

function createCanvas(width, height, background) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = background[0];
    data[i * 4 + 1] = background[1];
    data[i * 4 + 2] = background[2];
    data[i * 4 + 3] = background[3] ?? 255;
  }
  return { width, height, data };
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const i = (y * canvas.width + x) * 4;
  canvas.data[i] = color[0];
  canvas.data[i + 1] = color[1];
  canvas.data[i + 2] = color[2];
  canvas.data[i + 3] = color[3] ?? 255;
}

function fillRect(canvas, x, y, w, h, color) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) setPixel(canvas, px, py, color);
  }
}

/* 5x7 glyphs. Each entry is seven rows of five columns ('#' = ink). */
const FONT = {
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  G: [' ### ', '#   #', '#    ', '# ###', '#   #', '#   #', ' ### '],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
  J: ['  ###', '   # ', '   # ', '   # ', '   # ', '#  # ', ' ##  '],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '#   #', '#   #', '#   #', '#   #'],
  N: ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  Q: [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #'],
  X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
  0: [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  1: ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  2: [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  3: ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### '],
  4: ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  5: ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  6: ['  ## ', ' #   ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  7: ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
  8: [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  9: [' ### ', '#   #', '#   #', ' ####', '    #', '   # ', ' ##  '],
  ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
  '-': ['     ', '     ', '     ', '#####', '     ', '     ', '     '],
  '.': ['     ', '     ', '     ', '     ', '     ', ' ##  ', ' ##  '],
  '/': ['    #', '    #', '   # ', '  #  ', ' #   ', '#    ', '#    '],
};

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;

/** Pixel width of `text` at `scale`, with `spacing` font-pixels between glyphs. */
function textWidth(text, scale, spacing) {
  if (text.length === 0) return 0;
  return (text.length * GLYPH_WIDTH + (text.length - 1) * spacing) * scale;
}

/** Draw `text` (uppercased) with its top-left ink corner at (x, y). */
function drawText(canvas, text, x, y, scale, color, spacing = 1) {
  let cursor = x;
  for (const raw of text.toUpperCase()) {
    const glyph = FONT[raw] ?? FONT[' '];
    for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
      for (let col = 0; col < GLYPH_WIDTH; col += 1) {
        if (glyph[row][col] !== '#') continue;
        fillRect(canvas, cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += (GLYPH_WIDTH + spacing) * scale;
  }
}

/** Largest integer scale at which `text` fits both dimensions (minimum 1). */
function fitScale(text, maxWidth, maxHeight, spacing) {
  let scale = 1;
  while (
    textWidth(text, scale + 1, spacing) <= maxWidth &&
    GLYPH_HEIGHT * (scale + 1) <= maxHeight
  ) {
    scale += 1;
  }
  return scale;
}

/* ---------------------------------------------------------------------- */
/* Assets                                                                  */
/* ---------------------------------------------------------------------- */

const DARK = [0x0a, 0x19, 0x2f, 255]; // #0a192f
const BORDER = [0x11, 0x22, 0x40, 255]; // #112240
const ACCENT = [0x64, 0xff, 0xda, 255]; // #64ffda
const LIGHT = [0xcc, 0xd6, 0xf6, 255]; // #ccd6f6
const SLATE = [0x98, 0xa2, 0xc2, 255]; // #98a2c2

/** Dark tile with the "CC" monogram centred, at the requested square size. */
function monogram(size) {
  const canvas = createCanvas(size, size, DARK);
  const spacing = 0; // no inter-glyph gap: the monogram reads as one mark
  const scale = fitScale('CC', size, size, spacing);
  const x = Math.round((size - textWidth('CC', scale, spacing)) / 2);
  const y = Math.round((size - GLYPH_HEIGHT * scale) / 2);
  drawText(canvas, 'CC', x, y, scale, ACCENT, spacing);
  return canvas;
}

function drawBorder(canvas, inset, thickness, color) {
  fillRect(canvas, inset, inset, canvas.width - inset * 2, thickness, color);
  fillRect(canvas, inset, canvas.height - inset - thickness, canvas.width - inset * 2, thickness, color);
  fillRect(canvas, inset, inset, thickness, canvas.height - inset * 2, color);
  fillRect(canvas, canvas.width - inset - thickness, inset, thickness, canvas.height - inset * 2, color);
}

/** 1200x630 Open Graph / Twitter card. */
function ogCover() {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height, DARK);

  drawBorder(canvas, 36, 3, BORDER);

  const centered = (text, scale, y, color) => {
    const x = Math.round((width - textWidth(text, scale, 1)) / 2);
    drawText(canvas, text, x, y, scale, color, 1);
  };

  centered('Cristian Cardona', 8, 232, ACCENT);
  centered('Evidence-backed professional evolution', 4, 330, LIGHT);
  centered('cristian-cardona-dev.github.io', 2, 552, SLATE);

  return canvas;
}

/* ---------------------------------------------------------------------- */
/* Emit                                                                    */
/* ---------------------------------------------------------------------- */

mkdirSync(OUT_DIR, { recursive: true });

const ico = encodeIco([
  { width: 32, height: 32, png: encodePng(32, 32, monogram(32).data) },
  { width: 16, height: 16, png: encodePng(16, 16, monogram(16).data) },
]);
const icoPath = join(OUT_DIR, 'favicon.ico');
writeFileSync(icoPath, ico);

const cover = ogCover();
const coverPng = encodePng(cover.width, cover.height, cover.data);
const coverPath = join(OUT_DIR, 'og-cover.png');
writeFileSync(coverPath, coverPng);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`brand-assets OK — favicon.ico ${kb(ico.length)} (32+16), og-cover.png ${kb(coverPng.length)}`);
