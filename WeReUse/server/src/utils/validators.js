const { z } = require('zod');
const AppError = require('./AppError');
const { LISTING_TYPES, CONDITIONS, USED_UNITS, LISTING_STATUSES, MAX_PRICE } = require('./listingConstants');
const { MAX_MESSAGE_LENGTH, MAX_EXCHANGE_ITEM_LENGTH, OFFER_KINDS, OFFER_ACTIONS } = require('./chatConstants');
const {
  MAX_RATING_COMMENT,
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  REPORT_REASONS,
  REPORT_STATUSES,
  MAX_SUSPENSION_DAYS,
} = require('./supportConstants');

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
// ---- categories (admin) ----
const categoryName = z
  .string(text('Category name'))
  .trim()
  .min(2, 'Category name must be at least 2 characters')
  .max(50, 'Category name is too long (50 characters maximum)')
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}\s&,.'()/+-]*$/u, "Use letters, numbers, spaces and & , . ' ( ) / + - only");
const isActive = z.boolean({ invalid_type_error: 'isActive must be true or false' });

const createCategorySchema = z.object({ name: categoryName, isActive: isActive.optional() });
const updateCategorySchema = z.object({ name: categoryName.optional(), isActive: isActive.optional() });
const listCategoriesSchema = z.object({
  status: z.enum(['all', 'active', 'disabled']).default('all'),
  search: z.string().trim().max(50).default(''),
});

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

// ---- listings (products for sale / exchange / donation) ----
const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);
const objectId = (label) =>
  z.string(text(label)).trim().regex(/^[a-f\d]{24}$/i, `Choose a valid ${label.toLowerCase()}`);
const wholeNumber = (label, min, max) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be at most ${max.toLocaleString('en-US')}`)
      .optional()
  );
const choice = (values, message) => z.enum(values, { errorMap: () => ({ message }) });

// Body of POST /api/listings (multipart: these text fields + up to 5 files named "images")
const createListingSchema = z
  .object({
    title: z
      .string(text('Title'))
      .trim()
      .min(3, 'Title must be at least 3 characters')
      .max(100, 'Title is too long (100 characters maximum)'),
    description: z
      .string(text('Description'))
      .trim()
      .min(10, 'Please describe the item (at least 10 characters)')
      .max(2000, 'Description is too long (2000 characters maximum)'),
    category: objectId('Category'),
    listingType: choice(LISTING_TYPES, 'Choose sell, exchange or donate'),
    price: wholeNumber('Price', 1, MAX_PRICE),
    exchangeFor: z.string(text('Exchange wish')).trim().max(200, 'Keep this under 200 characters').optional().default(''),
    condition: choice(CONDITIONS, 'Choose the condition of the item'),
    usedValue: wholeNumber('Used time', 1, 99),
    usedUnit: z.preprocess(emptyToUndefined, choice(USED_UNITS, 'Choose days, weeks, months or years').optional()),
  })
  .superRefine((d, ctx) => {
    if (d.listingType === 'sell' && d.price === undefined) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'Enter a price in taka' });
    }
    if (d.condition && d.condition !== 'new') {
      if (d.usedValue === undefined) {
        ctx.addIssue({ code: 'custom', path: ['usedValue'], message: 'Tell us how long you have used it' });
      }
      if (d.usedUnit === undefined) {
        ctx.addIssue({ code: 'custom', path: ['usedUnit'], message: 'Choose days, weeks, months or years' });
      }
    }
  })
  // keep only what makes sense for the chosen type / condition
  .transform((d) => ({
    title: d.title,
    description: d.description,
    category: d.category,
    listingType: d.listingType,
    price: d.listingType === 'sell' ? d.price : null,
    exchangeFor: d.listingType === 'exchange' ? d.exchangeFor : '',
    condition: d.condition,
    usedFor: d.condition === 'new' ? null : { value: d.usedValue, unit: d.usedUnit },
  }));

// Query string of GET /api/listings (search + filters). condition is a comma list: "good,like_new"
const listListingsSchema = z
  .object({
    search: z.string().trim().max(100).default(''),
    category: z.preprocess(emptyToUndefined, objectId('Category').optional()),
    condition: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .transform((v) => v.split(',').map((x) => x.trim()).filter(Boolean))
        .pipe(z.array(choice(CONDITIONS, 'Unknown condition')).max(CONDITIONS.length))
        .optional()
    ),
    type: z.preprocess(emptyToUndefined, choice(LISTING_TYPES, 'Unknown listing type').optional()),
    minPrice: wholeNumber('Minimum price', 0, MAX_PRICE),
    maxPrice: wholeNumber('Maximum price', 0, MAX_PRICE),
    sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(12),
  })
  .refine((d) => d.minPrice === undefined || d.maxPrice === undefined || d.minPrice <= d.maxPrice, {
    message: 'Maximum price must be at least the minimum price',
    path: ['maxPrice'],
  });

const mineListingsSchema = z.object({ status: z.enum(['all', ...LISTING_STATUSES]).default('all') });
const listingStatusSchema = z.object({ status: z.enum(LISTING_STATUSES, { errorMap: () => ({ message: 'Status must be available or closed' }) }) });

// ---- chat (conversations, messages and offers) ----
// Plain text only: no control characters, and no more than one blank line in a row.
const cleanMessage = (v) =>
  v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const startConversationSchema = z.object({ listingId: objectId('Item') });

const offerSchema = z.object({
  kind: choice(OFFER_KINDS, 'Choose a price offer or an exchange offer'),
  amount: wholeNumber('Offer', 1, MAX_PRICE),
  item: z.string(text('Exchange offer')).trim().max(MAX_EXCHANGE_ITEM_LENGTH, `Keep this under ${MAX_EXCHANGE_ITEM_LENGTH} characters`).optional(),
});

// Body of POST /api/conversations/:id/messages: a text message, or an offer (with an optional note)
const sendMessageSchema = z
  .object({
    text: z
      .string(text('Message'))
      .max(MAX_MESSAGE_LENGTH * 2, `Message is too long (${MAX_MESSAGE_LENGTH} characters maximum)`)
      .optional()
      .default('')
      .transform(cleanMessage)
      .pipe(z.string().max(MAX_MESSAGE_LENGTH, `Message is too long (${MAX_MESSAGE_LENGTH} characters maximum)`)),
    offer: offerSchema.optional(),
  })
  .superRefine((d, ctx) => {
    if (!d.offer && !d.text) ctx.addIssue({ code: 'custom', path: ['text'], message: 'Write a message first' });
    if (d.offer && d.offer.kind === 'price' && d.offer.amount === undefined) {
      ctx.addIssue({ code: 'custom', path: ['offer', 'amount'], message: 'Enter your offer in taka' });
    }
    if (d.offer && d.offer.kind === 'exchange' && !(d.offer.item && d.offer.item.length >= 2)) {
      ctx.addIssue({ code: 'custom', path: ['offer', 'item'], message: 'Say what you would give in exchange' });
    }
  });

const offerActionSchema = z.object({ action: choice(OFFER_ACTIONS, 'Choose accept, decline or withdraw') });

// GET /api/conversations/:id/messages?before=<messageId>&limit=30   (older messages, newest page first)
const messagesQuerySchema = z.object({
  before: z.preprocess(emptyToUndefined, objectId('Message').optional()),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

// ---- ratings and complaints ----
const plainText = (label, min, max) =>
  z
    .string(text(label))
    .transform(cleanMessage)
    .pipe(
      z
        .string()
        .min(min, min > 1 ? `${label} must be at least ${min} characters` : `${label} is required`)
        .max(max, `${label} is too long (${max} characters maximum)`)
    );

// optional text fields: blank (or only spaces) counts as "not given"
const blankToUndefined = (v) => (v === null || (typeof v === 'string' && !v.trim()) ? undefined : v);

// Editing an item: the same fields as posting, plus which of the current photos to keep (JSON list of file names)
const keepImagesSchema = z.preprocess(
  (v) => {
    if (v === undefined || v === '') return [];
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  },
  z.array(z.string().max(100), { invalid_type_error: 'Invalid photo list' }).max(5, 'You can keep up to 5 photos')
);

const ratingSchema = z.object({
  stars: z.coerce
    .number({ invalid_type_error: 'Choose 1 to 5 stars' })
    .int('Choose 1 to 5 stars')
    .min(1, 'Choose 1 to 5 stars')
    .max(5, 'Choose 1 to 5 stars'),
  comment: z.preprocess(blankToUndefined, plainText('Comment', 1, MAX_RATING_COMMENT).optional()).transform((v) => v || ''),
});

const createComplaintSchema = z.object({
  category: choice(COMPLAINT_CATEGORIES, 'Choose what the complaint is about'),
  subject: plainText('Subject', 5, 120).transform((v) => v.replace(/\s+/g, ' ')),
  description: plainText('Description', 20, 3000),
});

const complaintListSchema = z.object({
  status: z.enum(['all', ...COMPLAINT_STATUSES]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const complaintUpdateSchema = z.object({
  status: choice(COMPLAINT_STATUSES, 'Choose a valid status'),
  adminResponse: z.preprocess(blankToUndefined, plainText('Response', 1, 1000).optional()).transform((v) => v || ''),
});

// ---- reporting students, and admin moderation ----
const reportUserSchema = z.object({
  reason: choice(REPORT_REASONS, 'Choose a reason for the report'),
  details: plainText('Details', 10, 2000),
});

const reportListSchema = z.object({
  status: z.enum(['all', ...REPORT_STATUSES]).default('open'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const reportUpdateSchema = z.object({
  status: choice(REPORT_STATUSES, 'Choose a valid status'),
  adminNote: z.preprocess(blankToUndefined, plainText('Note', 1, 1000).optional()).transform((v) => v || ''),
});

// suspend = block for N days, ban = remove the account (no login, items hidden), restore = active again
const moderateUserSchema = z
  .object({
    action: choice(['suspend', 'ban', 'restore'], 'Choose block, remove or restore'),
    days: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number({ invalid_type_error: 'Days must be a number' })
        .int('Days must be a whole number')
        .min(1, 'Block for at least 1 day')
        .max(MAX_SUSPENSION_DAYS, `Block for at most ${MAX_SUSPENSION_DAYS} days`)
        .optional()
    ),
    reason: z.preprocess(blankToUndefined, plainText('Reason', 3, 300).optional()),
    reportId: z.preprocess(emptyToUndefined, objectId('Report').optional()),
  })
  .superRefine((d, ctx) => {
    if (d.action === 'suspend' && d.days === undefined) ctx.addIssue({ code: 'custom', path: ['days'], message: 'Choose how many days to block' });
    if (d.action !== 'restore' && !d.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason (the student will see it)' });
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
  createCategorySchema,
  updateCategorySchema,
  listCategoriesSchema,
  loginSchema,
  resubmitSchema,
  rejectSchema,
  verificationListSchema,
  createListingSchema,
  listListingsSchema,
  mineListingsSchema,
  listingStatusSchema,
  startConversationSchema,
  sendMessageSchema,
  offerActionSchema,
  messagesQuerySchema,
  ratingSchema,
  createComplaintSchema,
  complaintListSchema,
  complaintUpdateSchema,
  reportUserSchema,
  reportListSchema,
  reportUpdateSchema,
  moderateUserSchema,
  keepImagesSchema,
};