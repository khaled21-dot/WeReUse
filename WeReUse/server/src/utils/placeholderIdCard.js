/**
 * Generates a simple stand-in "ID card" PNG (no external libraries) so the seed script can
 * create an admin without needing a real photo. Replace it with the real ID card photo:
 *   ADMIN_ID_CARD=/full/path/to/photo.jpg npm run seed:admin
 */
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function createPlaceholderIdCard(width = 640, height = 400) {
  const pixels = Buffer.alloc(height * (1 + width * 3));
  const rect = (x0, y0, x1, y1, [r, g, b]) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const o = y * (1 + width * 3) + 1 + x * 3;
        pixels[o] = r;
        pixels[o + 1] = g;
        pixels[o + 2] = b;
      }
    }
  };

  rect(0, 0, width, height, [247, 249, 252]); //   card
  rect(0, 0, width, 72, [11, 63, 107]); //          header band
  rect(0, height - 14, width, height, [255, 215, 0]); // gold edge
  rect(36, 112, 196, 300, [205, 214, 224]); //      photo box
  rect(226, 120, 560, 138, [150, 164, 178]); //     text lines
  rect(226, 160, 500, 176, [190, 200, 212]);
  rect(226, 198, 540, 214, [190, 200, 212]);
  rect(226, 236, 440, 252, [190, 200, 212]);
  rect(226, 274, 520, 290, [190, 200, 212]);
  // every scanline starts with filter byte 0 (already zero from Buffer.alloc)

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { createPlaceholderIdCard };
