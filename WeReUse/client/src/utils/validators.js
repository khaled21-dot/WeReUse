// These rules mirror the server (server/src/utils/validators.js). The server always
// re-checks everything - this file only gives instant feedback while typing.

export const MAX_FILE_MB = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]{1,79}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REG_RE = /^[A-Z0-9][A-Z0-9\-/]{4,24}$/;

export function validateName(value) {
  const v = value.trim();
  if (!v) return 'Full name is required';
  if (v.length < 2) return 'Full name is too short';
  if (!NAME_RE.test(v)) return "Use letters, spaces, . ' or - only";
  return '';
}

export function validateEmail(value) {
  const v = value.trim();
  if (!v) return 'Email is required';
  if (v.length > 254 || !EMAIL_RE.test(v)) return 'Enter a valid email address';
  return '';
}

export function validatePassword(value) {
  if (!value) return 'Password is required';
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Password needs at least one letter and one number';
  return '';
}

export function validateConfirmPassword(value, password) {
  if (!value) return 'Please confirm your password';
  if (value !== password) return 'Passwords do not match';
  return '';
}

export function validateRegNumber(value) {
  const v = value.trim().toUpperCase();
  if (!v) return 'University registration number is required';
  if (!REG_RE.test(v)) return 'Use 5-25 letters, numbers, "-" or "/" (example: 241-35-032)';
  return '';
}

// Bangladeshi mobile numbers: 01712345678, +8801712345678, 8801712-345678 ...
const PHONE_RE = /^01[3-9]\d{8}$/;

export function normalizePhone(value) {
  let digits = value.replace(/[\s-]/g, '');
  if (digits.startsWith('+880')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('880')) digits = `0${digits.slice(3)}`;
  return digits;
}

export function validatePhone(value) {
  const v = value.trim();
  if (!v) return 'Phone number is required';
  if (!PHONE_RE.test(normalizePhone(v))) return 'Enter a valid mobile number, for example 01712345678';
  return '';
}

export function validateCode(value) {
  return /^\d{6}$/.test(value.trim()) ? '' : 'Enter the 6-digit code';
}

export function validateIdFile(file) {
  if (!file) return 'Please upload a photo of your university ID card';
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPG or PNG images are allowed';
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `The image is too large (maximum ${MAX_FILE_MB} MB)`;
  if (file.size === 0) return 'That file is empty';
  return '';
}

export function validateRegisterForm(values, file) {
  const errors = {
    name: validateName(values.name),
    email: validateEmail(values.email),
    universityRegNumber: validateRegNumber(values.universityRegNumber),
    password: validatePassword(values.password),
    confirmPassword: validateConfirmPassword(values.confirmPassword, values.password),
    idCard: validateIdFile(file),
  };
  if (values.department.trim().length > 80) errors.department = 'Department is too long';
  if (values.batch.trim().length > 20) errors.batch = 'Batch is too long';
  return Object.fromEntries(Object.entries(errors).filter(([, msg]) => msg));
}

/** 0 (empty) .. 4 (strong) - used by the strength meter */
export function passwordStrength(value) {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[A-Za-z]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value) || value.length >= 12) score += 1;
  return Math.max(1, score);
}
