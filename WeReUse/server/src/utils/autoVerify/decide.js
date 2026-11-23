'use strict';
/**
 * The automatic version of what an admin does by eye: compare the ID card photo with the
 * name and registration number the student typed.
 *
 * This file is PURE: it gets the text that was read from the card and the student's details, and
 * returns a decision. No database, no files, no network - so it is easy to test.
 *
 * decision:
 *   "approved"  the registration number AND the name are on the card
 *   "rejected"  clear evidence that the card is not theirs / not readable as asked (reason is shown to the student)
 *   "review"    not sure -> an admin decides (or "rejected" when onUncertain is "reject")
 */

const DEFAULTS = {
  minNameScore: 0.75, // share of the account name's words that must be found on the card to approve
  rejectBelowNameScore: 0.4, // below this the name clearly is not on the card
  keywords: [], // words that identify the university on the card (e.g. ["daffodil"]); empty = not checked
  // true: the keyword MUST be read for an automatic approval. false (default): it is only extra evidence,
  // because university names are usually printed in a stylised logo font that OCR often cannot read.
  // The registration number and the name are what really tie the card to the student.
  requireUniversity: false,
  regPattern: null, // RegExp the registration number (letters+digits only) must match; null = not checked
  onUncertain: 'review', // "review" (send to an admin) or "reject" (ask the student to try again)
  minChars: 30, // fewer readable characters than this = the photo could not be read
  minConfidence: 40, // OCR confidence (0-100) below this = the photo could not be read
};

// Letters an OCR engine often mistakes for digits. Only used when the registration number is all digits.
const LOOKALIKE = { O: '0', Q: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' };

const compact = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const toDigits = (s) => s.replace(/[OQILSBZG]/g, (c) => LOOKALIKE[c]);
const plain = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** "exact" (also when only look-alike characters differ), "near" (one wrong character) or "none". */
function matchRegNumber(text, regKey) {
  if (!regKey) return 'none';
  const hay = compact(text);
  if (hay.includes(regKey)) return 'exact';

  const allDigits = /^[0-9]+$/.test(regKey);
  const fixed = allDigits ? toDigits(hay) : hay;
  if (allDigits && fixed.includes(regKey)) return 'exact';

  if (regKey.length >= 8) {
    const len = regKey.length;
    for (let i = 0; i + len <= fixed.length; i += 1) {
      let wrong = 0;
      for (let j = 0; j < len && wrong <= 1; j += 1) if (fixed[i + j] !== regKey[j]) wrong += 1;
      if (wrong <= 1) return 'near';
    }
  }
  return 'none';
}

const words = (s) => plain(s).split(/[^a-z]+/).filter((w) => w.length >= 2);
const allowedTypos = (len) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

/** Share (0..1) of the account name's words found on the card, allowing OCR typos. null = cannot be checked. */
function nameScore(text, name) {
  const wanted = words(name);
  if (wanted.length === 0) return null; // e.g. a name written only in Bangla letters
  const onCard = [...new Set(words(text))];
  const glued = plain(text).replace(/[^a-z]/g, '');
  const found = wanted.filter(
    (w) =>
      onCard.includes(w) ||
      (w.length >= 5 && glued.includes(w)) ||
      onCard.some((c) => Math.abs(c.length - w.length) <= 2 && levenshtein(w, c) <= allowedTypos(w.length))
  );
  return found.length / wanted.length;
}

/** true / false, or null when no keywords are configured. */
function matchUniversity(text, keywords) {
  if (!keywords || keywords.length === 0) return null;
  const glued = plain(text).replace(/[^a-z]/g, '');
  const onCard = words(text);
  return keywords.some((k) => {
    const kw = plain(k).replace(/[^a-z]/g, '');
    if (!kw) return false;
    if (glued.includes(kw)) return true;
    return kw.length >= 6 && onCard.some((c) => Math.abs(c.length - kw.length) <= 1 && levenshtein(c, kw) <= 1);
  });
}

// What the student reads. No names or numbers read from the card are repeated back.
const REASONS = {
  bad_format: (reg) => `The registration number ${reg} is not in the format used by the university. Please check it and submit again.`,
  unreadable: () =>
    'We could not read the text on your ID card photo. Please upload a clear, well-lit, in-focus photo of the whole card (no glare, all four corners visible).',
  reg_and_name_missing: (reg) =>
    `We could not find your registration number (${reg}) or your name on the ID card photo. Please check the number you entered and upload a clear photo of your university ID card.`,
  name_mismatch: () =>
    'The name on the ID card does not seem to match the name on your account. Your account name must be the name printed on your card.',
  reg_not_found: (reg) => `We could not find the registration number ${reg} on your ID card photo. Check the number you typed and upload a clearer photo.`,
  reg_unsure: (reg) => `The registration number on your card does not clearly match ${reg}. Check the number you typed and upload a clearer photo.`,
  name_unsure: () =>
    'We could not clearly confirm that the name on the ID card matches your account name. Upload a clearer photo, and make sure your account name is the name printed on your card.',
  university_missing: () => 'We could not recognise this as your university ID card. Please upload a photo of the card itself.',
};

const pct = (n) => (n === null ? 'unknown' : `${Math.round(n * 100)}%`);

function summarize(checks, headline) {
  return `${headline} Readable: ${checks.readable ? 'yes' : 'no'}; registration number: ${checks.regNumber}; name match: ${pct(
    checks.nameScore
  )}${checks.university === null ? '' : `; university name: ${checks.university ? 'found' : 'not found'}`}.`;
}

/** Only the typed number is looked at - used to refuse impossible numbers without reading the photo. */
function checkFormat(regNumber, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const regKey = compact(regNumber);
  if (cfg.regPattern && !cfg.regPattern.test(regKey)) {
    const checks = { readable: null, regNumber: 'none', nameScore: null, university: null };
    return {
      decision: 'rejected',
      code: 'bad_format',
      reason: REASONS.bad_format(regNumber),
      summary: summarize(checks, 'Auto-check rejected the registration number format.'),
      checks,
    };
  }
  return null;
}

/**
 * @param {{text: string, confidence: number}} reading   what was read from the ID card photo
 * @param {{name: string, regNumber: string}}  student    what the student typed
 * @param {object} options                                 see DEFAULTS
 */
function decide(reading, student, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const text = String((reading && reading.text) || '');
  const confidence = Number((reading && reading.confidence) || 0);
  const regKey = compact(student.regNumber);

  const badFormat = checkFormat(student.regNumber, cfg);
  if (badFormat) return badFormat;

  const finish = (decision, code, checks, headline) => ({
    decision,
    code,
    reason: decision === 'rejected' ? REASONS[code](student.regNumber) : '',
    summary: summarize(checks, headline),
    checks,
  });
  // "not sure": an admin looks at it, unless the school chose to ask the student to try again instead
  const unsure = (code, checks) =>
    finish(cfg.onUncertain === 'reject' ? 'rejected' : 'review', code, checks, 'Auto-check could not decide.');
  const hardReject = (code, checks) => finish('rejected', code, checks, 'Auto-check rejected the ID card.');

  const readable = compact(text).length >= cfg.minChars && confidence >= cfg.minConfidence;
  if (!readable) {
    return unsure('unreadable', { readable: false, regNumber: 'none', nameScore: null, university: null });
  }

  const reg = matchRegNumber(text, regKey);
  const score = nameScore(text, student.name);
  const checks = {
    readable: true,
    regNumber: reg,
    nameScore: score === null ? null : Math.round(score * 100) / 100,
    university: matchUniversity(text, cfg.keywords),
  };
  const nameKnown = score !== null;

  const universityOk = checks.university !== false || !cfg.requireUniversity;
  if (reg === 'exact' && nameKnown && score >= cfg.minNameScore && universityOk) {
    return finish('approved', 'ok', checks, 'Auto-check approved the ID card.');
  }
  if (nameKnown && score < cfg.rejectBelowNameScore) {
    if (reg === 'none') return hardReject('reg_and_name_missing', checks);
    if (reg === 'exact') return hardReject('name_mismatch', checks);
  }
  if (reg === 'none') return unsure('reg_not_found', checks);
  if (reg === 'near') return unsure('reg_unsure', checks);
  if (!nameKnown || score < cfg.minNameScore) return unsure('name_unsure', checks);
  return unsure('university_missing', checks);
}

module.exports = { DEFAULTS, decide, checkFormat, matchRegNumber, nameScore, matchUniversity, levenshtein, compact };