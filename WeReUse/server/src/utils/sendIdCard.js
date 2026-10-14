const AppError = require('./AppError');
const { ID_DIR } = require('./fileStore');

/**
 * Streams a private ID card image to the response.
 * Authorisation (who may see it) must already have been checked by the caller.
 * "root" keeps Express from rejecting the path if a parent folder name starts with a dot.
 */
function sendIdCard(res, next, filename) {
  const isPng = filename.toLowerCase().endsWith('.png');
  res.sendFile(
    filename,
    {
      root: ID_DIR,
      cacheControl: false,
      etag: false,
      lastModified: false,
      headers: {
        'Content-Type': isPng ? 'image/png' : 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    },
    (err) => {
      if (err && !res.headersSent) next(new AppError('ID card not found.', 404));
    }
  );
}

module.exports = sendIdCard;
