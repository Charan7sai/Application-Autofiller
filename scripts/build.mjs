// Copies the PDF library into the extension, bundles the AI client and draws the icons.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

mkdirSync('extension/lib/vendor', { recursive: true });
mkdirSync('extension/icons', { recursive: true });

for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  copyFileSync(`node_modules/pdfjs-dist/build/${name}`, `extension/lib/vendor/${name}`);
}

await build({
  entryPoints: ['src/ai-parser.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  minify: true,
  outfile: 'extension/lib/ai-parser.js',
});

// Icon: a rounded blue page with a white text-line motif.
function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const head = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(head));
  return Buffer.concat([len, head, crc]);
}
function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.2;
  const inBox = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = Math.max(r - x - 0.5, x + 0.5 - (size - r), 0);
      const dy = Math.max(r - y - 0.5, y + 0.5 - (size - r), 0);
      const inside = dx * dx + dy * dy <= r * r;
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const line = inBox(u, v, 0.22, 0.24, 0.78, 0.34) || inBox(u, v, 0.22, 0.45, 0.78, 0.55) || inBox(u, v, 0.22, 0.66, 0.56, 0.76);
      const px = y * (size * 4 + 1) + 1 + x * 4;
      const color = line ? [255, 255, 255] : [37, 99, 235];
      raw[px] = color[0];
      raw[px + 1] = color[1];
      raw[px + 2] = color[2];
      raw[px + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const size of [16, 48, 128]) writeFileSync(`extension/icons/${size}.png`, icon(size));

console.log('Built extension/');
