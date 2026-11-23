import api from './client.js';

export const authApi = {
  register: (formData) => api.post('/auth/register', formData),
  verifyEmail: (email, code) => api.post('/auth/verify-email', { email, code }), // step 2: creates the account
  resendCode: (email) => api.post('/auth/resend-code', { email }),
  login: (body) => api.post('/auth/login', body),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export const verificationApi = {
  resubmit: (formData) => api.post('/verification/resubmit', formData),
  // Returns the image as a Blob. It needs the login cookie, so it cannot be a plain <img src>.
  idCard: (userId) => api.get(`/verification/id-card/${userId}`, { responseType: 'blob' }),
};

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  idCard: (adminId) => api.get(`/admin/id-card/${adminId}`, { responseType: 'blob' }), // the admin's own ID card
  list: (params) => api.get('/admin/verifications', { params }),
  approve: (id) => api.patch(`/admin/verifications/${id}/approve`),
  promote: (studentId, phone) => api.post(`/admin/students/${studentId}/promote`, { phone }), // student -> admin
  reject: (id, reason) => api.patch(`/admin/verifications/${id}/reject`, { reason }),
  // complaint box
  complaints: (params) => api.get('/admin/complaints', { params }), //                { status, page, limit }
  updateComplaint: (id, body) => api.patch(`/admin/complaints/${id}`, body), //       { status, adminResponse? }
  // report box + blocking / removing students
  reports: (params) => api.get('/admin/reports', { params }), //                      { status, page, limit }
  updateReport: (id, body) => api.patch(`/admin/reports/${id}`, body), //             { status, adminNote? }
  moderate: (userId, body) => api.post(`/admin/users/${userId}/moderate`, body), //   { action: suspend|ban|restore, days?, reason?, reportId? }
};

export const notificationApi = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const profileApi = {
  update: (body) => api.patch('/profile', body),
  changePassword: (body) => api.post('/profile/password', body),
  requestEmailChange: (body) => api.post('/profile/email/request', body),
  confirmEmailChange: (code) => api.post('/profile/email/confirm', { code }),
  resendEmailChange: () => api.post('/profile/email/resend'),
  cancelEmailChange: () => api.delete('/profile/email'),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.post('/profile/avatar', form);
  },
  removeAvatar: () => api.delete('/profile/avatar'),
};

export const categoryApi = {
  list: (params) => api.get('/admin/categories', { params }), // READ   (admin: all categories)
  create: (body) => api.post('/admin/categories', body), //       CREATE
  update: (id, body) => api.patch(`/admin/categories/${id}`, body), // UPDATE (rename / enable / disable)
  remove: (id) => api.delete(`/admin/categories/${id}`), //        DELETE
  listActive: () => api.get('/categories'), // any logged-in student: ACTIVE categories only
};

export const listingApi = {
  list: (params) => api.get('/listings', { params }), //             browse + search + filter (any logged-in user)
  mine: (params) => api.get('/listings/mine', { params }), //        the logged-in student's own items
  get: (id) => api.get(`/listings/${id}`),
  create: (formData) => api.post('/listings', formData), //          verified students only (multipart: text + photos)
  setStatus: (id, status) => api.patch(`/listings/${id}/status`, { status }), // "available" | "closed"
  update: (id, formData) => api.patch(`/listings/${id}`, formData), //  owner only (multipart: text + keepImages + new photos)
  remove: (id) => api.delete(`/listings/${id}`),
};

export const chatApi = {
  start: (listingId) => api.post('/conversations', { listingId }), //         open (or reopen) a chat about an item
  list: () => api.get('/conversations'), //                                    my inbox
  unreadCount: () => api.get('/conversations/unread-count'), //                number for the navbar badge
  get: (id) => api.get(`/conversations/${id}`),
  messages: (id, params) => api.get(`/conversations/${id}/messages`, { params }), // { before, limit }
  send: (id, body) => api.post(`/conversations/${id}/messages`, body), //     { text } or { offer: { kind, amount | item }, text? }
  answer: (id, messageId, action) => api.patch(`/conversations/${id}/messages/${messageId}/offer`, { action }), // accept | decline | withdraw
  markRead: (id) => api.post(`/conversations/${id}/read`),
};

// ---- ratings and the complaint box ----
export const ratingApi = {
  forSeller: (sellerId) => api.get(`/ratings/seller/${sellerId}`),
};

export const complaintApi = {
  create: (body) => api.post('/complaints', body), // { category, subject, description }
  mine: () => api.get('/complaints/mine'),
};

// ---- public student profiles, ratings and reports ----
export const userApi = {
  profile: (id) => api.get(`/users/${id}`),
  rate: (id, body) => api.put(`/users/${id}/rating`, body), // { stars, comment? } - one rating per student, can be changed
  removeRating: (id) => api.delete(`/users/${id}/rating`),
  report: (id, body) => api.post(`/users/${id}/report`, body), // { reason, details }
  myReports: () => api.get('/users/reports/mine'),
};
