import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => import('../test/apiMock.js'));

import AdminBadge from '../components/AdminBadge';
import { adminApi, authApi, notificationApi, ok, resetApiMocks } from '../test/apiMock.js';
import { makeAdmin, makeUser, renderApp } from '../test/helpers.jsx';

const emptyQueue = () => ok({ users: [], pagination: { page: 1, limit: 10, total: 0, pages: 1 } });

beforeEach(() => {
  resetApiMocks();
  adminApi.list.mockImplementation(emptyQueue);
});

describe('<AdminBadge />', () => {
  it('shows the text "Admin" in gold', () => {
    render(<AdminBadge badge={{ label: 'Admin', color: '#FFD700' }} />);
    const badge = screen.getByText('Admin');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ backgroundColor: '#FFD700' });
  });

  it('falls back to gold and the text "Admin" when the data is missing or invalid', () => {
    const { unmount } = render(<AdminBadge />);
    expect(screen.getByText('Admin')).toHaveStyle({ backgroundColor: '#FFD700' });
    unmount();

    render(<AdminBadge badge={{ label: '  ', color: 'red; background: url(x)' }} />);
    expect(screen.getByText('Admin')).toHaveStyle({ backgroundColor: '#FFD700' });
  });

  it('follows the colour and label stored for the admin', () => {
    render(<AdminBadge badge={{ label: 'Super Admin', color: '#E6BC00' }} />);
    expect(screen.getByText('Super Admin')).toHaveStyle({ backgroundColor: '#E6BC00' });
  });
});

describe('admin session', () => {
  beforeEach(() => authApi.me.mockImplementation(() => ok({ user: makeAdmin() })));

  it('shows the golden Admin badge in the navbar and in the profile section', async () => {
    renderApp('/admin');
    const profile = await screen.findByRole('region', { name: 'Your admin profile' });

    // one badge in the profile card, one in the navbar
    expect(within(profile).getByText('Admin')).toHaveStyle({ backgroundColor: '#FFD700' });
    const navbar = screen.getByRole('navigation', { name: 'Main' });
    expect(within(navbar).getByText('Admin')).toHaveStyle({ backgroundColor: '#FFD700' });
    expect(screen.getAllByText('Admin')).toHaveLength(2);
  });

  it('shows every admin detail: name, email, phone, registration number and ID card', async () => {
    renderApp('/admin');
    const profile = await screen.findByRole('region', { name: 'Your admin profile' });

    expect(within(profile).getByRole('heading', { name: 'Site Admin' })).toBeInTheDocument();
    expect(within(profile).getByText('admin@wereuse.com')).toBeInTheDocument();
    expect(within(profile).getByText('01700000000')).toBeInTheDocument();
    expect(within(profile).getByText('Reg. ADMIN-0001')).toBeInTheDocument();
    expect(await within(profile).findByAltText('Your university ID card')).toBeInTheDocument();
    expect(adminApi.idCard).toHaveBeenCalledWith('a1');
  });

  it('has no notification bell (only students get in-app notifications)', async () => {
    renderApp('/admin');
    await screen.findByRole('region', { name: 'Your admin profile' });
    expect(screen.queryByRole('button', { name: /Notifications/ })).not.toBeInTheDocument();
    expect(notificationApi.list).not.toHaveBeenCalled();
  });

  it('shows the reviewing admin with a badge inside a student\'s review panel', async () => {
    const reviewed = makeUser({
      id: 'u9',
      name: 'Tania Akter',
      verificationStatus: 'verified',
      reviewedAt: '2026-10-02T09:00:00.000Z',
      reviewedBy: { id: 'a2', name: 'Second Admin', adminBadge: { label: 'Admin', color: '#FFD700' } },
    });
    adminApi.list.mockImplementation(() =>
      ok({ users: [reviewed], pagination: { page: 1, limit: 10, total: 1, pages: 1 } })
    );
    const user = userEvent.setup();
    renderApp('/admin');
    await user.click(await screen.findByRole('button', { name: 'View Tania Akter' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/by Second Admin/)).toBeInTheDocument();
    expect(within(dialog).getByText('Admin')).toHaveStyle({ backgroundColor: '#FFD700' });
  });
});

describe('student session', () => {
  it('has no Admin badge but keeps the notification bell', async () => {
    authApi.me.mockImplementation(() => ok({ user: makeUser() }));
    renderApp('/dashboard');
    await screen.findByRole('heading', { name: /Hi, Rahim/ });

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Notifications/ }).length).toBeGreaterThan(0);
  });

  it('shows the Admin badge in the mobile menu for admins only', async () => {
    authApi.me.mockImplementation(() => ok({ user: makeAdmin() }));
    const user = userEvent.setup();
    renderApp('/admin');
    await screen.findByRole('region', { name: 'Your admin profile' });
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    expect(within(mobile).getByText('Admin')).toBeInTheDocument();
    expect(within(mobile).getByText(/Signed in as Site Admin/)).toBeInTheDocument();
  });
});
