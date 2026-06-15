const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICONS_DIR = path.join(__dirname, '..', 'icons');

function crc32(data) {
  let crc = 0xffffffff;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const crcVal = crc32(typeData);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeData, crcBuf]);
}

function createPNG(width, height, pixelData) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rawData.push(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2], pixelData[idx + 3]);
    }
  }
  
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function drawIcon(size) {
  const data = new Uint8Array(size * size * 4);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      
      const r = size * 0.18;
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      
      let isInside = true;
      if (x < r && y < r) {
        const dist = Math.sqrt((r - x) ** 2 + (r - y) ** 2);
        if (dist > r) isInside = false;
      } else if (x >= size - r && y < r) {
        const dist = Math.sqrt((x - (size - r - 1)) ** 2 + (r - y) ** 2);
        if (dist > r) isInside = false;
      } else if (x < r && y >= size - r) {
        const dist = Math.sqrt((r - x) ** 2 + (y - (size - r - 1)) ** 2);
        if (dist > r) isInside = false;
      } else if (x >= size - r && y >= size - r) {
        const dist = Math.sqrt((x - (size - r - 1)) ** 2 + (y - (size - r - 1)) ** 2);
        if (dist > r) isInside = false;
      }
      
      if (!isInside) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
        continue;
      }
      
      const t = (x + y) / (2 * size);
      const r1 = Math.round(0x66 + (0x76 - 0x66) * t);
      const g1 = Math.round(0x7e + (0x4b - 0x7e) * t);
      const b1 = Math.round(0xea + (0xa2 - 0xea) * t);
      
      data[idx] = r1;
      data[idx + 1] = g1;
      data[idx + 2] = b1;
      data[idx + 3] = 255;
      
      const cx = size * 0.5;
      const cy = size * 0.45;
      const cdist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const outerR = size * 0.28;
      const innerR = size * 0.23;
      
      if (cdist < outerR && cdist > innerR) {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 230;
      }
      
      const handX = size * 0.5;
      const handStartY = size * 0.28;
      const handMidY = size * 0.45;
      const handEndX = size * 0.62;
      const handEndY = size * 0.54;
      
      const lw = Math.max(2, size * 0.05);
      
      const d1 = distToLine(x, y, handX, handStartY, handX, handMidY);
      if (d1 < lw) {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 230;
      }
      
      const d2 = distToLine(x, y, handX, handMidY, handEndX, handEndY);
      if (d2 < lw) {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 230;
      }
      
      const checkCx = size * 0.7;
      const checkCy = size * 0.7;
      const checkR = size * 0.14;
      const checkDist = Math.sqrt((x - checkCx) ** 2 + (y - checkCy) ** 2);
      
      if (checkDist < checkR) {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 255;
      }
      
      const chkP1x = size * 0.64;
      const chkP1y = size * 0.7;
      const chkP2x = size * 0.68;
      const chkP2y = size * 0.74;
      const chkP3x = size * 0.77;
      const chkP3y = size * 0.65;
      const chkLw = Math.max(1.5, size * 0.035);
      
      const dchk1 = distToLine(x, y, chkP1x, chkP1y, chkP2x, chkP2y);
      const dchk2 = distToLine(x, y, chkP2x, chkP2y, chkP3x, chkP3y);
      if ((dchk1 < chkLw || dchk2 < chkLw) && checkDist < checkR) {
        data[idx] = 0x66;
        data[idx + 1] = 0x7e;
        data[idx + 2] = 0xea;
        data[idx + 3] = 255;
      }
    }
  }
  
  return data;
}

function distToLine(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) param = dot / lenSq;
  
  let xx, yy;
  
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  
  return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
}

function generate() {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }
  
  const sizes = [16, 48, 128];
  
  sizes.forEach(size => {
    const pixels = drawIcon(size);
    const png = createPNG(size, size, pixels);
    const filePath = path.join(ICONS_DIR, `icon${size}.png`);
    fs.writeFileSync(filePath, png);
    console.log(`✅ 生成 icon${size}.png (${size}x${size})`);
  });
  
  console.log('\n🎉 所有图标生成完成！已保存到 icons/ 目录');
}

generate();
