/**
 * Detects JPG / PNG by their "magic bytes" instead of trusting the file name or
 * the Content-Type header, which the client can fake. Returns "jpg", "png" or null.
 */
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, i) => buffer[i] === byte)) return 'png';
  return null;
}

module.exports = { detectImageType };
