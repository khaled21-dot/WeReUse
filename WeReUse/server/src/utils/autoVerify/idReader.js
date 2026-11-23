'use strict';
/**
 * Reads the text printed on an ID card photo (OCR) with tesseract.js: free, runs on this server, and
 * the photo never leaves it. The first run downloads the English language data once (about 10 MB) and
 * keeps it in server/storage/ocr-cache.
 *
 * The package is loaded only when the first card is read, so the server still starts without it.
 * To use a different reader (or a fake in tests) call setReader(async (buffer) => ({ text, confidence })).
 */
const fs = require('fs');
const path = require('path');
const { STORAGE_DIR, AUTO_VERIFY_OCR_TIMEOUT_SECONDS } = require('../../config/env');

let custom = null;
let workerPromise = null;

const setReader = (fn) => {
  custom = fn;
};

function notInstalled() {
  const err = new Error('tesseract.js is not installed. Run  npm install tesseract.js  in the server folder.');
  err.appCode = 'OCR_NOT_INSTALLED';
  return err;
}

/** Is the OCR package available? (used for a start-up hint) */
function ocrInstalled() {
  try {
    require.resolve('tesseract.js');
    return true;
  } catch {
    return false;
  }
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      let tesseract;
      try {
        tesseract = require('tesseract.js');
      } catch {
        throw notInstalled();
      }
      const cachePath = path.join(STORAGE_DIR, 'ocr-cache');
      fs.mkdirSync(cachePath, { recursive: true });
      return tesseract.createWorker('eng', 1, { cachePath });
    })();
    workerPromise.catch(() => {
      workerPromise = null; // try again with the next card
    });
  }
  return workerPromise;
}

async function shutdownReader() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  const worker = await pending.catch(() => null);
  if (worker) await worker.terminate().catch(() => {});
}

// ---------- photo orientation ----------
// Phone photos of an ID card are often sideways or upside down, and Tesseract cannot read rotated text
// (it only reads text that runs left to right). Tesseract.js turns the image by the EXIF "Orientation"
// value it finds in the first bytes of a JPEG, but only in big-endian ("MM") EXIF - most Android phones
// write little-endian ("II") EXIF, which it ignores. So for a JPEG we put our own small big-endian EXIF
// block at the very start of the file and let Tesseract do the rotation. No image library is needed.
//   1 = as is, 8 = turn 90° anticlockwise, 6 = turn 90° clockwise, 3 = turn 180°
const ORIENTATIONS = [1, 8, 6, 3];
const isJpeg = (buf) => Buffer.isBuffer(buf) && buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;

/** The EXIF orientation Tesseract itself would use for this JPEG (1 when none). */
function exifOrientation(buf) {
  const head = Array.from(buf.subarray(0, 500)).join(' ');
  return parseInt((head.match(/1 18 0 3 0 0 0 1 0 (\d)/) || [])[1], 10) || 1;
}

/** The same JPEG with an EXIF block that tells Tesseract to turn it (see above). */
function withOrientation(buf, orientation) {
  // TIFF header (big-endian) + 1 IFD entry: tag 0x0112 Orientation, type SHORT, count 1, value
  const tiff = Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const length = body.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]), body]);
  return Buffer.concat([buf.subarray(0, 2), app1, buf.subarray(2)]);
}

/**
 * Which ways to read the photo, most likely first. The first entry (null) is the photo as uploaded;
 * the others only exist for JPEGs read by the real OCR engine.
 */
function orientationsFor(buffer) {
  if (custom || !isJpeg(buffer)) return [null];
  const own = exifOrientation(buffer);
  return [null, ...ORIENTATIONS.filter((o) => o !== own)];
}

/**
 * @param {Buffer} buffer
 * @param {{orientation?: number|null}} [options]  see orientationsFor()
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function readIdCard(buffer, { orientation = null } = {}) {
  if (custom) return custom(buffer);
  const image = orientation && isJpeg(buffer) ? withOrientation(buffer, orientation) : buffer;

  const worker = await getWorker();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Reading the ID card took too long.')), AUTO_VERIFY_OCR_TIMEOUT_SECONDS * 1000);
  });
  try {
    const result = await Promise.race([worker.recognize(image), timeout]);
    return { text: result.data.text || '', confidence: Number(result.data.confidence) || 0 };
  } catch (err) {
    if (/too long/.test(err.message)) await shutdownReader(); // the worker may be stuck: start a fresh one next time
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { readIdCard, orientationsFor, withOrientation, setReader, shutdownReader, ocrInstalled };