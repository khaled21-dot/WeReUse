import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => import('../test/apiMock.js'));

import { adminApi, authApi, ok, resetApiMocks, userApi } from '../test/apiMock.js';
import { makeAdmin, makeUser, renderApp } from '../test/helpers.jsx';

const profileData = (over = {}, viewer = {}) => ({
  profile: {
    id: 's1',
    name: 'Karim Seller',
    avatar: null,
    department: 'EEE',
    batch: '40',
    studentId: '241-35-001',
    memberSince: '2026-01-01',
    isVerified: true,
    rating: 4,
    ratingCount: 3,
    stats: { activeListings: 0 },
    isMe: false,
    ...over,
  },
  listings: [],
  reviews: [
    { id: 'r1', stars: 4, comment: 'Smooth deal', source: 'profile', rater: { id: 'b1', name: 'Nadia', avatar: null }, createdAt: '2026-11-01', updatedAt: '2026-11-01' },
  ],
  viewer: { canRate: true, canReport: true, myRating: null, hasOpenReport: false, ...viewer },
});

beforeEach(() => {
  resetApiMocks();
  authApi.me.mockImplementation(() => ok({ user: makeUser({ verificationStatus: 'verified' }) }));
});

describe('another student’s profile', () => {
  it('shows the profile and lets a student rate them (5 stars max)', async () => {
    const user = userEvent.setup();
    userApi.profile.mockImplementation(() => ok(profileData()));
    userApi.rate.mockImplementation(() =>
      Promise.resolve({ data: { success: true, message: 'Thanks for your rating!', data: { rating: { stars: 5, comment: '' }, summary: { average: 4.3, count: 4 } } } })
    );

    renderApp('/users/s1');
    expect(await screen.findByRole('heading', { level: 1, name: /Karim Seller/ })).toBeInTheDocument();
    expect(screen.getByText('Smooth deal')).toBeInTheDocument();
    expect(screen.getByText('241-35-001')).toBeInTheDocument(); // student ID is visible

    const form = screen.getByRole('form', { name: 'Rate Karim Seller' });
    expect(within(form).getAllByRole('radio')).toHaveLength(5);
    await user.click(within(form).getByRole('radio', { name: '5 stars' }));
    await user.click(within(form).getByRole('button', { name: 'Submit rating' }));
    await waitFor(() => expect(userApi.rate).toHaveBeenCalledWith('s1', { stars: 5, comment: '' }));
    expect(await screen.findByRole('heading', { name: 'Your rating' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change rating' })).toBeInTheDocument();
  });

  it('reports the student to the admins', async () => {
    const user = userEvent.setup();
    userApi.profile.mockImplementation(() => ok(profileData()));
    userApi.report.mockImplementation(() => Promise.resolve({ data: { success: true, message: 'Thank you. Your report was sent to the admins.', data: {} } }));

    renderApp('/users/s1');
    await user.click(await screen.findByRole('button', { name: 'Report user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Report Karim Seller' });

    await user.click(within(dialog).getByRole('button', { name: 'Send report to admins' }));
    expect(within(dialog).getByText('Choose a reason')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('radio', { name: 'Scam or fraud' }));
    await user.type(within(dialog).getByLabelText('What happened?'), 'He took the money and vanished.');
    await user.click(within(dialog).getByRole('button', { name: 'Send report to admins' }));
    await waitFor(() => expect(userApi.report).toHaveBeenCalledWith('s1', { reason: 'scam', details: 'He took the money and vanished.' }));
    expect(await screen.findByText(/You reported Karim Seller/)).toBeInTheDocument();
  });

  it('my own profile has no rate or report buttons', async () => {
    userApi.profile.mockImplementation(() => ok(profileData({ id: 'u1', name: 'Rahim Uddin', isMe: true, status: 'active' }, { canRate: false, canReport: false })));
    renderApp('/users/u1');
    expect(await screen.findByText(/This is how other students see your profile/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Report user' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /Rate/ })).not.toBeInTheDocument();
  });
});

describe('admin: blocking a student', () => {
  it('blocks a student for 3 days from their profile', async () => {
    const user = userEvent.setup();
    authApi.me.mockImplementation(() => ok({ user: makeAdmin() }));
    userApi.profile.mockImplementation(() =>
      ok(profileData({ email: 'karim@example.com', universityRegNumber: '241-35-001', reportCount: 2, status: 'active' }, { canRate: false, canReport: false }))
    );
    adminApi.moderate.mockImplementation(() =>
      Promise.resolve({ data: { success: true, message: 'Karim Seller is blocked for 3 days.', data: { user: { id: 's1', status: 'suspended', suspendedUntil: '2026-11-27T10:00:00.000Z', moderationReason: 'Scam report' } } } })
    );

    renderApp('/users/s1');
    expect(await screen.findByText('karim@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Block temporarily' }));
    await user.click(screen.getByRole('button', { name: '3 days' }));
    await user.click(screen.getByRole('button', { name: 'Block for 3 days' }));
    expect(screen.getByText('Give a reason (the student will see it)')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Reason/), 'Scam report');
    await user.click(screen.getByRole('button', { name: 'Block for 3 days' }));
    await waitFor(() => expect(adminApi.moderate).toHaveBeenCalledWith('s1', { action: 'suspend', days: 3, reason: 'Scam report' }));
    expect(await screen.findByText('Blocked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore account' })).toBeInTheDocument();
  });

  it('the report box lists reports and the admin can remove the reported student', async () => {
    const user = userEvent.setup();
    authApi.me.mockImplementation(() => ok({ user: makeAdmin() }));
    const account = (id, name) => ({ id, name, email: `${id}@example.com`, avatar: null, rating: 0, ratingCount: 0, status: 'active', suspendedUntil: null, moderationReason: '' });
    adminApi.reports.mockImplementation(() =>
      ok({
        reports: [
          { id: 'rep1', reason: 'scam', details: 'Took money, no item.', status: 'open', adminNote: '', createdAt: '2026-11-20', updatedAt: '2026-11-20', reporter: account('b1', 'Nadia'), reported: { ...account('s1', 'Karim Seller'), timesReported: 2 } },
        ],
        counts: { open: 1, reviewing: 0, action_taken: 0, dismissed: 0, all: 1 },
        pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      })
    );
    adminApi.moderate.mockImplementation(() =>
      Promise.resolve({ data: { success: true, message: 'Removed.', data: { user: { id: 's1', status: 'banned', suspendedUntil: null, moderationReason: 'Repeated scams' } } } })
    );

    renderApp('/admin/reports');
    expect(await screen.findByText('Took money, no item.')).toBeInTheDocument();
    expect(screen.getByText('Reported 2 times in total')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove user' }));
    await user.type(screen.getByLabelText(/Reason/), 'Repeated scams');
    await user.click(screen.getAllByRole('button', { name: 'Remove user' }).at(-1));
    await waitFor(() => expect(adminApi.moderate).toHaveBeenCalledWith('s1', { action: 'ban', reason: 'Repeated scams', reportId: 'rep1' }));
  });
});
