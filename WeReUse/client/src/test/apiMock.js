// A stand-in for src/api/index.js used by the tests (no real network calls).
import { vi } from 'vitest';

export const authApi = { register: vi.fn(), verifyEmail: vi.fn(), resendCode: vi.fn(), login: vi.fn(), logout: vi.fn(), me: vi.fn() };
export const verificationApi = { resubmit: vi.fn(), idCard: vi.fn() };
export const adminApi = { stats: vi.fn(), idCard: vi.fn(), list: vi.fn(), approve: vi.fn(), reject: vi.fn(), promote: vi.fn() };
export const profileApi = {
  update: vi.fn(),
  changePassword: vi.fn(),
  requestEmailChange: vi.fn(),
  confirmEmailChange: vi.fn(),
  resendEmailChange: vi.fn(),
  cancelEmailChange: vi.fn(),
};
export const notificationApi = { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() };

export const ok = (data) => Promise.resolve({ data: { success: true, data } });
export const fail = (status, body = {}) =>
  Promise.reject({ response: { status, data: { success: false, ...body } } });

export function resetApiMocks() {
  [authApi, verificationApi, adminApi, profileApi, notificationApi].forEach((group) =>
    Object.values(group).forEach((fn) => fn.mockReset())
  );
  authApi.me.mockImplementation(() => fail(401, { message: 'Please log in to continue.' }));
  authApi.resendCode.mockImplementation(() => ok({ resendAfterSeconds: 60 }));
  authApi.logout.mockImplementation(() => Promise.resolve({ data: { success: true } }));
  verificationApi.idCard.mockImplementation(() => Promise.resolve({ data: new Blob(['img']) }));
  adminApi.idCard.mockImplementation(() => Promise.resolve({ data: new Blob(['admin-img']) }));
  notificationApi.list.mockImplementation(() => ok({ notifications: [], unreadCount: 0 }));
  adminApi.stats.mockImplementation(() => ok({ stats: { pending: 0, verified: 0, rejected: 0, total: 0 } }));
}
