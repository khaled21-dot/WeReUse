/**
 * Private storage for university ID card images (NFR: private, access-controlled).
 * Files live in server/storage/id-cards, which is never exposed as a static folder.
 * They can only be read through GET /api/verification/id-card/:userId
 * (owner or admin). To move to Cloudinary/S3 later, only this file has to change.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { STORAGE_DIR } = require('../config/env');

const ID_DIR = path.join(STORAGE_DIR, 'id-cards');
fs.mkdirSync(ID_DIR, { recursive: true, mode: 0o700 });

// Product photos. Also NOT a static folder: they are served by GET /api/listings/images/:file,
// which needs a login.
const LISTING_DIR = path.join(STORAGE_DIR, 'listings');
fs.mkdirSync(LISTING_DIR, { recursive: true, mode: 0o700 });

// Profile photos (avatars). Served by GET /api/profile/avatars/:file, which needs a login.
const AVATAR_DIR = path.join(STORAGE_DIR, 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true, mode: 0o700 });

/** Saves a profile photo under a random name and returns that file name. */
async function saveAvatar(buffer, ext) {
  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.promises.writeFile(path.join(AVATAR_DIR, filename), buffer, { mode: 0o600, flag: 'wx' });
  return filename;
}

/** Deletes a profile photo. Missing files are ignored. */
async function deleteAvatar(filename) {
  if (!filename) return;
  try {
    await fs.promises.unlink(path.join(AVATAR_DIR, path.basename(filename)));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not delete profile photo:', err.message);
  }
}

/** Saves the buffer under a random name and returns that file name. */
async function saveIdCard(buffer, ext) {
  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.promises.writeFile(path.join(ID_DIR, filename), buffer, { mode: 0o600, flag: 'wx' });
  return filename;
}

/** Deletes a stored file. Missing files are ignored. */
async function deleteIdCard(filename) {
  if (!filename) return;
  try {
    await fs.promises.unlink(path.join(ID_DIR, path.basename(filename)));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not delete ID card file:', err.message);
  }
}

/** Saves one product photo under a random name and returns that file name. */
async function saveListingImage(buffer, ext) {
  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.promises.writeFile(path.join(LISTING_DIR, filename), buffer, { mode: 0o600, flag: 'wx' });
  return filename;
}

/** Deletes product photos (a list of file names). Missing files are ignored. */
async function deleteListingImages(filenames = []) {
  await Promise.all(
    filenames.map(async (filename) => {
      try {
        await fs.promises.unlink(path.join(LISTING_DIR, path.basename(filename)));
      } catch (err) {
        if (err.code !== 'ENOENT') console.error('Could not delete listing image:', err.message);
      }
    })
  );
}

module.exports = {
  ID_DIR,
  LISTING_DIR,
  AVATAR_DIR,
  saveIdCard,
  deleteIdCard,
  saveListingImage,
  deleteListingImages,
  saveAvatar,
  deleteAvatar,
};