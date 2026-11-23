// Shared by the models, the validators and the controllers of the rating & complaint module.

// The complaint box (students -> admins)
exports.COMPLAINT_CATEGORIES = ['scam', 'payment', 'technical', 'account', 'other'];
exports.COMPLAINT_STATUSES = ['open', 'in_review', 'resolved', 'dismissed'];

// Rating a student from their profile
exports.MAX_RATING_COMMENT = 500;

// Reporting another student (the admins' report box), and blocking / removing accounts
exports.REPORT_REASONS = ['scam', 'harassment', 'fake_listing', 'spam', 'inappropriate', 'impersonation', 'other'];
exports.REPORT_STATUSES = ['open', 'reviewing', 'action_taken', 'dismissed'];
exports.MAX_SUSPENSION_DAYS = 365;
