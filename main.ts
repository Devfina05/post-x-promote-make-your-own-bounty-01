// Make your own bounty — promo image generator.
//
// make.fun bounty: post-x-promote-make-your-own-bounty-01
// "Promote make.fun's make-your-own-bounty post on X"
//
// This program draws the photo that goes with the X post: a 1200x675
// poster for make.fun's make-your-own-bounty feature — headline, prize
// card, sponsor link and the entrant's play code.
//
// Standard library only (node:fs, node:path, node:zlib). No network, no
// randomness: every pixel comes from fixed constants and a seeded PRNG, so
// two runs produce byte-identical output.
//
// Usage:
//   node main.ts
// Writes promo.png into $MAKEFUN_OUTPUT_DIR (default /output). If a
// POST.json sits next to this program (the grader's /bot dir), it is
// copied to the output dir as well.

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- canvas

const W = 1200;
const H = 675;

type RGB = [number, number, number];

const WHITE: RGB = [255, 255, 255];
const GOLD: RGB = [255, 209, 102];
const CYAN: RGB = [34, 211, 238];
const PINK: RGB = [244, 114, 182];
const VIOLET: RGB = [167, 139, 250];
const GREEN: RGB = [52, 211, 153];
const LAVENDER: RGB = [205, 191, 234];
const MUTED: RGB = [158, 143, 208];

// RGBA pixel buffer, row-major.
const px = new Uint8Array(W * H * 4);

function blend(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 4;
  if (a >= 255) {
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
    return;
  }
  const inv = 255 - a;
  px[i] = (c[0] * a + px[i] * inv) / 255;
  px[i + 1] = (c[1] * a + px[i + 1] * inv) / 255;
  px[i + 2] = (c[2] * a + px[i + 2] * inv) / 255;
  px[i + 3] = 255;
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB, a = 255): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) blend(i, j, c, a);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB, a: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) blend(x, y, c, a);
    }
  }
}

// Soft radial glow: many concentric circles fading out (fine steps so no
// banding rings are visible).
function glow(cx: number, cy: number, r: number, c: RGB, maxA: number): void {
  const steps = 48;
  for (let s = steps; s >= 1; s--) {
    const rr = Math.round((r * s) / steps);
    const f = 1 - s / steps;
    const a = Math.round(maxA * f * f * f);
    fillCircle(cx, cy, rr, c, a);
  }
}

function roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB, a: number): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const dx = Math.max(x + r - i, 0, i - (x + w - r - 1));
      const dy = Math.max(y + r - j, 0, j - (y + h - r - 1));
      if (dx * dx + dy * dy <= r * r) blend(i, j, c, a);
    }
  }
}

function hline(x0: number, x1: number, y: number, c: RGB, a: number): void {
  for (let x = x0; x <= x1; x++) blend(x, y, c, a);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(c0: RGB, c1: RGB, t: number): RGB {
  return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
}

// Deterministic PRNG (mulberry32) — fixed seed, no Math.random.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ font

// 5x7 bitmap font. Each glyph is 7 rows of 5 "0"/"1" characters.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "@": ["01110", "10001", "10111", "10101", "10110", "10000", "01110"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10000", "10000", "10000", "01110"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01000", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "11110", "10001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["00000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "11110", "10001", "11110", "10000", "10000"],
  q: ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["00100", "00100", "11111", "00100", "00100", "00100", "00100"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
};

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function drawText(text: string, x: number, y: number, scale: number, c: RGB, a = 255): void {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "1") {
          fillRect(cx + col * scale, y + row * scale, scale, scale, c, a);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(text: string, cx: number, y: number, scale: number, c: RGB, a = 255): void {
  drawText(text, cx - Math.floor(textWidth(text, scale) / 2), y, scale, c, a);
}

// Four-point sparkle (a plus with tapered arms).
function sparkle(cx: number, cy: number, r: number, c: RGB, a: number): void {
  for (let d = -r; d <= r; d++) {
    const w = Math.max(1, Math.round(r * 0.22 * (1 - Math.abs(d) / r)));
    for (let k = -w; k <= w; k++) {
      blend(cx + d, cy + k, c, a);
      blend(cx + k, cy + d, c, a);
    }
  }
}

// ------------------------------------------------------------------- png

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter: none
    raw.set(px.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ draw

function draw(): void {
  // Background: vertical gradient, deep indigo -> violet -> plum.
  const stops: [number, RGB][] = [
    [0, [11, 5, 30]],
    [0.55, [34, 16, 82]],
    [1, [61, 15, 95]],
  ];
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    let c: RGB;
    if (t < 0.55) {
      c = lerpColor(stops[0][1], stops[1][1], t / 0.55);
    } else {
      c = lerpColor(stops[1][1], stops[2][1], (t - 0.55) / 0.45);
    }
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
  }

  // Soft color glows.
  glow(1050, 90, 260, CYAN, 46);
  glow(140, 610, 300, PINK, 40);
  glow(700, 60, 170, GOLD, 30);

  // Faint dot grid.
  for (let y = 22; y < H; y += 44) {
    for (let x = 22; x < W; x += 44) {
      fillCircle(x, y, 2, WHITE, 14);
    }
  }

  // Confetti — seeded, deterministic.
  const rand = mulberry32(20261124);
  const palette: RGB[] = [GOLD, CYAN, PINK, VIOLET, GREEN, WHITE];
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * H);
    const s = 4 + Math.floor(rand() * 5);
    const c = palette[Math.floor(rand() * palette.length)];
    if (rand() < 0.3) {
      fillCircle(x, y, Math.max(2, Math.floor(s / 2)), c, 150);
    } else {
      fillRect(x, y, s, s, c, 150);
    }
  }

  // Wordmark.
  drawText("make.fun", 56, 46, 5, WHITE);
  sparkle(330, 52, 12, GOLD, 255);
  sparkle(356, 78, 7, CYAN, 255);

  // Top-right pill.
  const pillLabel = "SPONSOR A BOUNTY";
  const pillW = textWidth(pillLabel, 2) + 44;
  const pillX = W - 56 - pillW;
  roundRect(pillX, 42, pillW, 42, 21, CYAN, 255);
  roundRect(pillX + 2, 44, pillW - 4, 38, 19, [16, 10, 40], 255);
  drawText(pillLabel, pillX + 22, 55, 2, CYAN);

  // Headline.
  drawText("MAKE YOUR", 56, 158, 12, WHITE);
  drawText("OWN BOUNTY", 56, 258, 12, GOLD);
  sparkle(790, 190, 14, WHITE, 255);
  sparkle(760, 300, 9, CYAN, 255);

  // Gradient underline bar under the headline.
  for (let x = 0; x < 520; x++) {
    const c = lerpColor(CYAN, PINK, x / 520);
    for (let y = 0; y < 10; y++) blend(56 + x, 360 + y, c, 255);
  }

  // Subline.
  drawText("Got an idea? Put a price on it.", 56, 400, 3, WHITE);
  drawText("Agents build it. You pick the winner.", 56, 432, 3, LAVENDER);

  // Prize card.
  const cardX = 800;
  const cardY = 158;
  const cardW = 344;
  const cardH = 312;
  roundRect(cardX, cardY, cardW, cardH, 24, WHITE, 255);
  roundRect(cardX + 2, cardY + 2, cardW - 4, cardH - 4, 22, [26, 13, 58], 255);
  drawText("PRIZE POOL", cardX + 32, cardY + 28, 2, MUTED);
  drawText("$250", cardX + 32, cardY + 56, 11, GOLD);
  drawText("USDC - TOP 50 SHARE IT", cardX + 32, cardY + 148, 2, WHITE);
  for (let x = cardX + 32; x < cardX + cardW - 32; x++) {
    blend(x, cardY + 182, MUTED, 120);
  }
  const rows: [string, RGB][] = [
    ["1ST   $50", GOLD],
    ["2ND   $30", CYAN],
    ["3RD   $15", PINK],
  ];
  rows.forEach(([label, color], i) => {
    const ry = cardY + 202 + i * 28;
    fillRect(cardX + 32, ry, 14, 14, color, 255);
    drawText(label, cardX + 60, ry, 2, WHITE);
  });

  // Bottom pills: sponsor link + play code.
  const link = "make.fun/sponsor/new";
  const linkW = textWidth(link, 3) + 48;
  roundRect(56, 556, linkW, 54, 27, WHITE, 255);
  roundRect(58, 558, linkW - 4, 50, 25, [16, 10, 40], 255);
  drawText(link, 80, 574, 3, CYAN);

  const code = "PLAY CODE  c1qhnyx4";
  const codeW = textWidth(code, 3) + 48;
  const codeX = W - 56 - codeW;
  roundRect(codeX, 556, codeW, 54, 27, GOLD, 255);
  roundRect(codeX + 2, 558, codeW - 4, 50, 25, [16, 10, 40], 255);
  drawText("PLAY CODE  ", codeX + 24, 574, 3, GOLD);
  drawText("c1qhnyx4", codeX + 24 + textWidth("PLAY CODE  ", 3), 574, 3, WHITE);
}

// ------------------------------------------------------------------ main

function envDir(name: string, fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : fallback;
}

function main(): void {
  const botDir = envDir("MAKEFUN_BOT_DIR", "/bot");
  const outDir = envDir("MAKEFUN_OUTPUT_DIR", "/output");

  draw();
  const png = encodePNG();

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "promo.png");
  writeFileSync(outPath, png);

  // If the X post address has been recorded, hand it to the grader too.
  const postPath = join(botDir, "POST.json");
  if (existsSync(postPath)) {
    copyFileSync(postPath, join(outDir, "POST.json"));
  }

  process.stdout.write(`wrote ${outPath} (${png.length} bytes, ${W}x${H})\n`);
}

main();
