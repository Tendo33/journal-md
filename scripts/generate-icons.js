#!/usr/bin/env node
// 生成占位图标 assets/icon-{16,32,48,128}.png：深蓝圆角方块 + 白色「文稿」+ 三行横线。
// TODO(designer): 这是占位图，正式图标由设计提供（PRD §4.1：用论文/期刊意象，不用日记本）。
// 只用 Node 内置 zlib 写 PNG，不引入依赖。用法：npm run icons
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [29, 78, 137];
const FG = [255, 255, 255];
const LINE = [29, 78, 137];

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n += 1) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function pixel(size, x, y) {
  const s = size;
  const r = s * 0.2;
  // 圆角外部透明
  const cx = Math.min(Math.max(x + 0.5, r), s - r);
  const cy = Math.min(Math.max(y + 0.5, r), s - r);
  if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) return [0, 0, 0, 0];
  const px = (x + 0.5) / s;
  const py = (y + 0.5) / s;
  const inPage = px > 0.26 && px < 0.74 && py > 0.18 && py < 0.82;
  if (!inPage) return [...BG, 255];
  const lineH = Math.max(1 / s, 0.06);
  for (const ly of [0.36, 0.5, 0.64]) {
    const right = ly === 0.64 ? 0.56 : 0.66;
    if (py >= ly - lineH / 2 && py < ly + lineH / 2 && px > 0.34 && px < right) return [...LINE, 255];
  }
  return [...FG, 255];
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const p = pixel(size, x, y);
      p.forEach((v, i) => { raw[y * (size * 4 + 1) + 1 + x * 4 + i] = v; });
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { png };

if (require.main === module) {
  const out = path.resolve(__dirname, '..', 'assets');
  fs.mkdirSync(out, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    fs.writeFileSync(path.join(out, `icon-${size}.png`), png(size));
    console.log(`assets/icon-${size}.png`);
  }
}
