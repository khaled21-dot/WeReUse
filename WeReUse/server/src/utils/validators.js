const { z } = require('zod');
const AppError = require('./AppError');

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]{1,79}$/u;
const REG_RE = /^[A-Z0-9][A-Z0-9\-/]{4,24}$/;
const REG_MESSAGE = 'Use 5-25 letters, numbers, "-" or "/" (example: 241-35-032)';

const text = (label) => ({
  required_error: `${label} is required`,
  invalid_type_error: `${label} must be text`,
});

const email = z
  .string(text('Email'))
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Enter a valid email address');

const password = z
  .string(text('Password'))
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password is too long (72 bytes maximum)')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password needs at least one letter and one number');

const regNumber = z
  .string(text('University registration number'))
  .trim()
  .toUpperCase()
  .regex(REG_RE, REG_MESSAGE);

const fullName = z
  .string(text('Full name'))
  .trim()
  .min(2, 'Full name is required')
  .regex(NAME_RE, "Use letters, spaces, . ' or - only");

// Bangladeshi mobile numbers: 01712345678, +8801712345678, 8801712-345678 ... are all stored as 01712345678
const PHONE_RE = /^01[3-9]\d{8}$/;
const normalizePhone = (value) => {
  let digits = value.replace(/[\s-]/g, '');
  if (digits.startsWith('+880')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('880')) digits = `0${digits.slice(3)}`;
  return digits;
};
const phone = z
  .string(text('Phone number'))
  .trim()
  .transform(normalizePhone)
  .refine((v) => PHONE_RE.test(v), 'Enter a valid mobile number, for example 01712345678');

const registerSchema = z
  .object({
    name: fullName,
    email,
    password,
    confirmPassword: z.string(text('Password confirmation')),
    universityRegNumber: regNumber,
    department: z.string(text('Department')).trim().max(80, 'Department is too long').optional().default(''),
    batch: z.string(text('Batch')).trim().max(20, 'Batch is too long').optional().default(''),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Used when an existing admin creates another admin account (and by the seed script)
const createAdminSchema = z.object({
  name: fullName,
  email,
  phone,
  universityRegNumber: regNumber,
  password,
});

// Body of POST /api/admin/students/:id/promote - the new admin's phone number
const promoteSchema = z.object({ phone });

// ---- e-mail verification ----
const sixDigitCode = z.string(text('Code')).trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
const verifyEmailSchema = z.object({ email, code: sixDigitCode });
const emailOnlySchema = z.object({ email });

// ---- profile ----
const updateStudentProfileSchema = z.object({
  name: fullName.optional(),
  department: z.string(text('Department')).trim().max(80, 'Department is too long').optional(),
  batch: z.string(text('Batch')).trim().max(20, 'Batch is too long').optional(),
});
const updateAdminProfileSchema = z.object({ name: fullName.optional(), phone: phone.optional() });

const changePasswordSchema = z
  .object({
    currentPassword: z.string(text('Current password')).min(1, 'Current password is required').max(200),
    newPassword: password,
    confirmPassword: z.string(text('Password confirmation')),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'Choose a password that is different from your current one',
    path: ['newPassword'],
  });

const requestEmailChangeSchema = z.object({
  newEmail: email,
  password: z.string(text('Password')).min(1, 'Password is required').max(200),
});
const confirmEmailChangeSchema = z.object({ code: sixDigitCode });

const loginSchema = z.object({
  email: z.string(text('Email')).trim().toLowerCase().min(1, 'Email is required').max(254),
  password: z.string(text('Password')).min(1, 'Password is required').max(200),
});

const resubmitSchema = z.object({
  // optional: lets the student fix a wrongly typed registration number
  universityRegNumber: z.preprocess((v) => (v === '' ? undefined : v), regNumber.optional()),
});

const rejectSchema = z.object({
  reason: z
    .string(text('Reason'))
    .trim()
    .min(5, 'Please give a reason (at least 5 characters)')
    .max(500, 'Reason is too long (500 characters maximum)'),
});

const verificationListSchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected', 'all']).default('pending'),
  search: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** Validates `data` against `schema`; throws a 400 AppError with per-field messages. */
function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;

  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  throw new AppError('Please fix the highlighted fields.', 400, { errors, code: 'VALIDATION_ERROR' });
}

module.exports = {
  parse,
  registerSchema,
  createAdminSchema,
  promoteSchema,
  verifyEmailSchema,
  emailOnlySchema,
  updateStudentProfileSchema,
  updateAdminProfileSchema,
  changePasswordSchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
  loginSchema,
  resubmitSchema,
  rejectSchema,
  verificationListSchema,
};
