const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

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
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        val = (val + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 0xff;
      }
      out[curRowOff + x] = val;
    }
  }
  return { width, height, data: out };
}

function rgbaToEscPosRaster(img, targetWidth = 576, sliceHeight = 48) {
  const targetHeight = Math.round(img.height * targetWidth / img.width);
  const bytesPerLine = Math.ceil(targetWidth / 8);
  const bytes = [];

  // ESC @, ESC a 1
  bytes.push(0x1B, 0x40, 0x1B, 0x61, 0x01);

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

const hImg = decodePngToRgba(path.join(__dirname, '../header.png'));
const hRaster = rgbaToEscPosRaster(hImg, 576, 48);
console.log('Header raster size:', hRaster.length, 'bytes');

const fImg = decodePngToRgba(path.join(__dirname, '../footer.png'));
const fRaster = rgbaToEscPosRaster(fImg, 576, 48);
console.log('Footer raster size:', fRaster.length, 'bytes');

const outJs = `/**
 * Pre-compiled ESC/POS 1-bit raster graphics for Dr. Akram Clinic
 * High-speed instant printing with zero browser rendering overhead.
 */
window.PREBAKED_HEADER_BASE64 = "${hRaster.toString('base64')}";
window.PREBAKED_FOOTER_BASE64 = "${fRaster.toString('base64')}";
`;

fs.writeFileSync(path.join(__dirname, '../graphics.js'), outJs);
console.log('graphics.js written successfully! Total JS size:', outJs.length);
