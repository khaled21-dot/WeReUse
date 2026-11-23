// Labels and helpers for the rating & complaint screens (complaint box, reports, admin moderation).

export const COMPLAINT_CATEGORIES = [
  { value: 'scam', label: 'Scam or fraud', hint: 'A student cheated you or tried to' },
  { value: 'payment', label: 'Money problem', hint: 'A deal or a payment between students went wrong' },
  { value: 'technical', label: 'Something is broken', hint: 'A page or button does not work' },
  { value: 'account', label: 'My account', hint: 'Login, verification or profile' },
  { value: 'other', label: 'Something else', hint: '' },
];
export const COMPLAINT_CATEGORY_LABELS = Object.fromEntries(COMPLAINT_CATEGORIES.map((c) => [c.value, c.label]));

export const COMPLAINT_STATUS = {
  open: { label: 'Open', badge: 'bg-amber-100 text-amber-800' },
  in_review: { label: 'In review', badge: 'bg-blue-50 text-blue-800' },
  resolved: { label: 'Resolved', badge: 'bg-green-100 text-green-800' },
  dismissed: { label: 'Closed', badge: 'bg-paper text-ink-soft border border-line' },
};

/** Same rules as the server (server/src/utils/validators.js). The server always checks again. */
export function validateComplaint(v) {
  const errors = {};
  if (!v.category) errors.category = 'Choose what the complaint is about';
  const subject = v.subject.trim();
  if (subject.length < 5) errors.subject = 'Subject must be at least 5 characters';
  else if (subject.length > 120) errors.subject = 'Subject is too long (120 characters maximum)';
  const description = v.description.trim();
  if (description.length < 20) errors.description = 'Please describe the problem (at least 20 characters)';
  else if (description.length > 3000) errors.description = 'Description is too long (3000 characters maximum)';
  return errors;
}

// ---- reporting students ----
export const REPORT_REASONS = [
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'harassment', label: 'Harassment or threats' },
  { value: 'fake_listing', label: 'Fake or misleading items' },
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'other', label: 'Something else' },
];
export const REPORT_REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

export const REPORT_STATUS = {
  open: { label: 'Open', badge: 'bg-amber-100 text-amber-800' },
  reviewing: { label: 'Reviewing', badge: 'bg-blue-50 text-blue-800' },
  action_taken: { label: 'Action taken', badge: 'bg-green-100 text-green-800' },
  dismissed: { label: 'Dismissed', badge: 'bg-paper text-ink-soft border border-line' },
};

export const ACCOUNT_STATUS = {
  active: { label: 'Active', badge: 'bg-green-100 text-green-800' },
  suspended: { label: 'Blocked', badge: 'bg-amber-100 text-amber-800' },
  banned: { label: 'Removed', badge: 'bg-coral-50 text-coral-800' },
};
