'use strict';

/**
 * Generates simple branded PNG app icons (no external deps) so the PWA is
 * installable. Draws a dark rounded background with a centered "J".
 * Run once: node scripts/make-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function makeIcon(size) {
  const bg = [11, 18, 32]; // #0b1220
  const fg = [91, 157, 255]; // #5b9dff
  const W = size, H = size;
  // RGBA raw buffer
  const px = Buffer.alloc(W * H * 4);
  const cx = W / 2, cy = H / 2;
  const stroke = Math.max(2, Math.round(size * 0.06));
  // letter "J" geometry (simple): vertical bar + bottom hook
  const barX = W * 0.58;
  const top = H * 0.28, bottom = H * 0.66;
  const hookLeft = W * 0.34;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = bg;
      // vertical stem
      if (x > barX - stroke && x < barX + stroke && y > top && y < bottom) c = fg;
      // bottom curve of J
      const onHook =
        y > bottom - stroke && y < bottom + stroke && x > hookLeft && x < barX + stroke;
      const leftTurn =
        x > hookLeft - stroke && x < hookLeft + stroke && y > bottom - H * 0.12 && y < bottom + stroke;
      if (onHook || leftTurn) c = fg;

      const i = (y * W + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }

  return encodePng(W, H, px);
}

// Encode an RGBA pixel buffer into a PNG Buffer.
function encodePng(W, H, px) {
  const raw = Buffer.alloc(H * (W * 4 + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0; // filter byte
    px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const idat = zlib.deflateSync(raw);
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// CRC32
const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Transparent outline icon (white "J") for Teams.
function makeOutline(size) {
  const W = size, H = size;
  const px = Buffer.alloc(W * H * 4); // all transparent
  const stroke = Math.max(2, Math.round(size * 0.09));
  const barX = W * 0.58, top = H * 0.26, bottom = H * 0.66, hookLeft = W * 0.34;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const stem = x > barX - stroke && x < barX + stroke && y > top && y < bottom;
    const hook = y > bottom - stroke && y < bottom + stroke && x > hookLeft && x < barX + stroke;
    const turn = x > hookLeft - stroke && x < hookLeft + stroke && y > bottom - H * 0.12 && y < bottom + stroke;
    if (stem || hook || turn) { const i = (y * W + x) * 4; px[i] = px[i + 1] = px[i + 2] = 255; px[i + 3] = 255; }
  }
  return encodePng(W, H, px);
}

const dir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(dir, `icon-${size}.png`), makeIcon(size));
  console.log('wrote', `icon-${size}.png`);
}

// Teams app-package icons
const teamsDir = path.join(__dirname, '..', 'deploy', 'teams');
fs.mkdirSync(teamsDir, { recursive: true });
fs.writeFileSync(path.join(teamsDir, 'color.png'), makeIcon(192));
fs.writeFileSync(path.join(teamsDir, 'outline.png'), makeOutline(32));
console.log('wrote', 'deploy/teams/color.png + outline.png');
