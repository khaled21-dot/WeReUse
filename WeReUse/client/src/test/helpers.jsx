import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { RealtimeContext } from '../context/RealtimeContext';

// `realtime` (optional) is a fake live connection: { connected, unread, subscribe, refreshUnread } - see fakeRealtime()
export function renderApp(route = '/', { realtime } = {}) {
  const app = <App />;
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthProvider>{realtime ? <RealtimeContext.Provider value={realtime}>{app}</RealtimeContext.Provider> : app}</AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

/** A stand-in for the Socket.IO connection: call push('message:new', payload) to simulate the server. */
export function fakeRealtime(over = {}) {
  const handlers = new Map();
  return {
    connected: true,
    unread: 0,
    refreshUnread: async () => {},
    subscribe: (event, fn) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event).delete(fn);
    },
    push: (event, payload) => (handlers.get(event) || new Set()).forEach((fn) => fn(payload)),
    ...over,
  };
}

export const makeUser = (over = {}) => ({
  id: 'u1',
  name: 'Rahim Uddin',
  email: 'rahim@example.com',
  department: 'CSE',
  batch: '42',
  universityRegNumber: '241-35-100',
  verificationStatus: 'pending',
  rejectionReason: '',
  verificationSubmittedAt: '2026-10-01T10:00:00.000Z',
  reviewedAt: null,
  role: 'student',
  status: 'active',
  hasIdCard: true,
  isVerifiedBadge: false,
  emailVerifiedAt: '2026-10-01T10:00:00.000Z',
  pendingEmail: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  ...over,
});

// Admins come from the separate `admins` collection: they have a phone number and the golden badge,
// but no verification status.
export const makeAdmin = (over = {}) => ({
  id: 'a1',
  name: 'Site Admin',
  email: 'admin@wereuse.com',
  phone: '01700000000',
  universityRegNumber: 'ADMIN-0001',
  adminBadge: { label: 'Admin', color: '#FFD700' },
  role: 'admin',
  status: 'active',
  hasIdCard: true,
  pendingEmail: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  ...over,
});

export const pngFile = (name = 'id.png') => new File([new Uint8Array(2048)], name, { type: 'image/png' });