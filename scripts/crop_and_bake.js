const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function writePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeRgbaToPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const ihdrChunk = writePngChunk('IHDR', ihdr);

  const raw = Buffer.alloc(height * (1 + width * 4));
  let off = 0;
  for (let y = 0; y < height; y++) {
    raw[off++] = 0; // filter None
    rgbaBuffer.copy(raw, off, y * width * 4, (y + 1) * width * 4);
    off += width * 4;
  }
  const idatChunk = writePngChunk('IDAT', zlib.deflateSync(raw));
  const iendChunk = writePngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function decodePngToRgba(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let width, height;
  const idat = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.slice(offset + 8, offset + 8 + len);
    offset += 12 + len;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(16);
      height = buf.readUInt32BE(20);
    } else if (type === 'IDAT') {
      idat.push(data);
    }
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);

  let rawOff = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rawOff++];
    const prevRowOff = (y - 1) * stride;
    const curRowOff = y * stride;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[curRowOff + x - bpp] : 0;
      const b = y > 0 ? out[prevRowOff + x] : 0;
      const c = (x >= bpp && y > 0) ? out[prevRowOff + x - bpp] : 0;
      let val = raw[rawOff++];

      if (filter === 1) val = (val + a) & 0xff;
      else if (filter === 2) val = (val + b) & 0xff;
      else if (filter === 3) val = (val + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        val = (val + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 0xff;
      }
      out[curRowOff + x] = val;
    }
  }
  return { width, height, data: out };
}

function cropRgba(img, startY, endY) {
  const newHeight = endY - startY + 1;
  const newBuffer = Buffer.alloc(img.width * newHeight * 4);
  img.data.copy(newBuffer, 0, startY * img.width * 4, (endY + 1) * img.width * 4);
  return { width: img.width, height: newHeight, data: newBuffer };
}

function rgbaToEscPosRaster(img, targetWidth = 576, sliceHeight = 48) {
  const targetHeight = Math.round(img.height * targetWidth / img.width);
  const bytesPerLine = Math.ceil(targetWidth / 8);
  const bytes = [];

  // Align Center
  bytes.push(0x1B, 0x61, 0x01);

  for (let y = 0; y < targetHeight; y += sliceHeight) {
    const sliceH = Math.min(sliceHeight, targetHeight - y);
    const xL = bytesPerLine % 256;
    const xH = Math.floor(bytesPerLine / 256);
    const yL = sliceH % 256;
    const yH = Math.floor(sliceH / 256);

    bytes.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

    for (let sy = 0; sy < sliceH; sy++) {
      const curY = y + sy;
      const srcY = Math.min(img.height - 1, Math.floor(curY * img.height / targetHeight));

      for (let col = 0; col < bytesPerLine; col++) {
        let byteVal = 0;
        for (let b = 0; b < 8; b++) {
          const curX = col * 8 + b;
          if (curX < targetWidth) {
            const srcX = Math.min(img.width - 1, Math.floor(curX * img.width / targetWidth));
            const idx = (srcY * img.width + srcX) * 4;
            const r = img.data[idx];
            const g = img.data[idx + 1];
            const bPix = img.data[idx + 2];
            const a = img.data[idx + 3];
            const lum = 0.299 * r + 0.587 * g + 0.114 * bPix;

            if (a > 128 && lum < 200) {
              byteVal |= (1 << (7 - b));
            }
          }
        }
        bytes.push(byteVal);
      }
    }
  }

  return Buffer.from(bytes);
}

// 1. Process header.png: remove top stray black line and blank 40px margin
const hRaw = decodePngToRgba(path.join(__dirname, '../header.png'));
const hCropped = cropRgba(hRaw, 42, 268);
fs.writeFileSync(path.join(__dirname, '../header.png'), encodeRgbaToPng(hCropped.width, hCropped.height, hCropped.data));
console.log('header.png cropped:', hRaw.width, 'x', hRaw.height, '->', hCropped.width, 'x', hCropped.height);

// 2. Process footer.png: tight trim
const fRaw = decodePngToRgba(path.join(__dirname, '../footer.png'));
const fCropped = cropRgba(fRaw, 5, 220);
fs.writeFileSync(path.join(__dirname, '../footer.png'), encodeRgbaToPng(fCropped.width, fCropped.height, fCropped.data));
console.log('footer.png cropped:', fRaw.width, 'x', fRaw.height, '->', fCropped.width, 'x', fCropped.height);

// 3. Bake graphics to ESC/POS raster
const hRaster = rgbaToEscPosRaster(hCropped, 576, 48);
console.log('Cropped header raster size:', hRaster.length, 'bytes');

const fRaster = rgbaToEscPosRaster(fCropped, 576, 48);
console.log('Cropped footer raster size:', fRaster.length, 'bytes');

const outJs = `/**
 * Pre-compiled ESC/POS 1-bit raster graphics for Dr. Akram Clinic
 * High-speed instant printing with zero browser rendering overhead.
 */
window.PREBAKED_HEADER_BASE64 = "${hRaster.toString('base64')}";
window.PREBAKED_FOOTER_BASE64 = "${fRaster.toString('base64')}";
`;

fs.writeFileSync(path.join(__dirname, '../graphics.js'), outJs);
console.log('graphics.js updated successfully! Total bytes:', outJs.length);
