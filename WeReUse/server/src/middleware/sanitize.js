/**
 * Defence-in-depth against NoSQL operator injection (e.g. {"email": {"$ne": null}}).
 * Removes any key that starts with "$" or contains "." from body, query and params.
 * (Zod validation additionally rejects non-string values, so this is a second layer.)
 */
function clean(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 10) return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else {
      clean(obj[key], depth + 1);
    }
  }
}

module.exports = function sanitize(req, res, next) {
  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
};
