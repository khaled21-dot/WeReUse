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
};

export const categoryApi = {
  list: (params) => api.get('/admin/categories', { params }), // READ   (admin: all categories)
  create: (body) => api.post('/admin/categories', body), //       CREATE
  update: (id, body) => api.patch(`/admin/categories/${id}`, body), // UPDATE (rename / enable / disable)
  remove: (id) => api.delete(`/admin/categories/${id}`), //        DELETE
  listActive: () => api.get('/categories'), // any logged-in student: ACTIVE categories only
};