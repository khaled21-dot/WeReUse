// A stand-in for src/api/index.js used by the tests (no real network calls).
import { vi } from 'vitest';

export const authApi = { register: vi.fn(), verifyEmail: vi.fn(), resendCode: vi.fn(), login: vi.fn(), logout: vi.fn(), me: vi.fn() };
export const verificationApi = { resubmit: vi.fn(), idCard: vi.fn() };
export const adminApi = {
  stats: vi.fn(),
  idCard: vi.fn(),
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  promote: vi.fn(),
  complaints: vi.fn(),
  updateComplaint: vi.fn(),
  reports: vi.fn(),
  updateReport: vi.fn(),
  moderate: vi.fn(),
};
export const profileApi = {
  update: vi.fn(),
  changePassword: vi.fn(),
  requestEmailChange: vi.fn(),
  confirmEmailChange: vi.fn(),
  resendEmailChange: vi.fn(),
  cancelEmailChange: vi.fn(),
};
export const notificationApi = { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() };
export const categoryApi = { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), listActive: vi.fn() };
export const chatApi = { start: vi.fn(), list: vi.fn(), unreadCount: vi.fn(), get: vi.fn(), messages: vi.fn(), send: vi.fn(), answer: vi.fn(), markRead: vi.fn() };
export const listingApi = { list: vi.fn(), mine: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() };
export const ratingApi = { forSeller: vi.fn() };
export const complaintApi = { create: vi.fn(), mine: vi.fn() };
export const userApi = { profile: vi.fn(), rate: vi.fn(), removeRating: vi.fn(), report: vi.fn(), myReports: vi.fn() };

export const ok = (data) => Promise.resolve({ data: { success: true, data } });
export const fail = (status, body = {}) =>
  Promise.reject({ response: { status, data: { success: false, ...body } } });

export function resetApiMocks() {
  [authApi, verificationApi, adminApi, profileApi, notificationApi, categoryApi, listingApi, chatApi, ratingApi, complaintApi, userApi].forEach((group) =>
    Object.values(group).forEach((fn) => fn.mockReset())
  );
  authApi.me.mockImplementation(() => fail(401, { message: 'Please log in to continue.' }));
  authApi.resendCode.mockImplementation(() => ok({ resendAfterSeconds: 60 }));
  authApi.logout.mockImplementation(() => Promise.resolve({ data: { success: true } }));
  verificationApi.idCard.mockImplementation(() => Promise.resolve({ data: new Blob(['img']) }));
  adminApi.idCard.mockImplementation(() => Promise.resolve({ data: new Blob(['admin-img']) }));
  notificationApi.list.mockImplementation(() => ok({ notifications: [], unreadCount: 0 }));
  ratingApi.forSeller.mockImplementation(() => ok({ summary: { average: 0, count: 0 }, ratings: [] }));
  adminApi.stats.mockImplementation(() => ok({ stats: { pending: 0, verified: 0, rejected: 0, total: 0 } }));
}