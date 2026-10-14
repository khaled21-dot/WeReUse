import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => import('../test/apiMock.js'));

import { adminApi, authApi, fail, ok, resetApiMocks, verificationApi } from '../test/apiMock.js';
import { makeAdmin, makeUser, renderApp } from '../test/helpers.jsx';

const rahim = makeUser();
const sara = makeUser({ id: 'u2', name: 'Sara Khan', email: 'sara@example.com', universityRegNumber: '241-35-200' });
const page = (users, total = users.length) => ({ users, pagination: { page: 1, limit: 10, total, pages: Math.max(1, Math.ceil(total / 10)) } });

beforeEach(() => {
  resetApiMocks();
  authApi.me.mockImplementation(() => ok({ user: makeAdmin() }));
  adminApi.list.mockImplementation(() => ok(page([rahim, sara])));
  adminApi.stats.mockImplementation(() => ok({ stats: { pending: 2, verified: 5, rejected: 1, total: 8 } }));
});

describe('admin verification queue', () => {
  it('lists pending students and the counts', async () => {
    renderApp('/admin');
    expect(await screen.findByRole('button', { name: 'Review Rahim Uddin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review Sara Khan' })).toBeInTheDocument();
    expect(adminApi.list).toHaveBeenCalledWith({ status: 'pending', search: '', page: 1, limit: 10 });

    const tabs = screen.getByRole('tablist');
    expect(within(tabs).getByRole('tab', { name: /Pending\s*2/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: /Verified\s*5/ })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: /All students\s*8/ })).toBeInTheDocument();
  });

  it('switches status with the tabs', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    await screen.findByRole('button', { name: 'Review Rahim Uddin' });

    await user.click(screen.getByRole('tab', { name: /Rejected/ }));
    await waitFor(() =>
      expect(adminApi.list).toHaveBeenLastCalledWith({ status: 'rejected', search: '', page: 1, limit: 10 })
    );
  });

  it('searches after the admin stops typing', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    await screen.findByRole('button', { name: 'Review Rahim Uddin' });

    await user.type(screen.getByLabelText('Search students'), 'sara');
    await waitFor(
      () => expect(adminApi.list).toHaveBeenLastCalledWith({ status: 'pending', search: 'sara', page: 1, limit: 10 }),
      { timeout: 2000 }
    );
  });

  it('opens the review panel with the ID card and the typed registration number', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    await user.click(await screen.findByRole('button', { name: 'Review Rahim Uddin' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Rahim Uddin' })).toBeInTheDocument();
    expect(within(dialog).getByText('241-35-100')).toBeInTheDocument();
    expect(await within(dialog).findByAltText('ID card submitted by Rahim Uddin')).toBeInTheDocument();
    expect(verificationApi.idCard).toHaveBeenCalledWith('u1');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('approves a student and refreshes the list', async () => {
    adminApi.approve.mockImplementation(() => ok({ user: { ...rahim, verificationStatus: 'verified' } }));
    const user = userEvent.setup();
    renderApp('/admin');
    await user.click(await screen.findByRole('button', { name: 'Review Rahim Uddin' }));
    const callsBefore = adminApi.list.mock.calls.length;

    await user.click(await screen.findByRole('button', { name: 'Approve student' }));

    await waitFor(() => expect(adminApi.approve).toHaveBeenCalledWith('u1'));
    expect(await screen.findByText('Rahim Uddin is now a verified student.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(adminApi.list.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('will not reject without a reason', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    await user.click(await screen.findByRole('button', { name: 'Review Rahim Uddin' }));
    await user.click(await screen.findByRole('button', { name: 'Reject...' }));
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    expect(await screen.findByText(/Please give a reason/)).toBeInTheDocument();
    expect(adminApi.reject).not.toHaveBeenCalled();
  });

  it('rejects with a quick reason chip and sends it to the server', async () => {
    adminApi.reject.mockImplementation(() => ok({ user: { ...rahim, verificationStatus: 'rejected' } }));
    const user = userEvent.setup();
    renderApp('/admin');
    await user.click(await screen.findByRole('button', { name: 'Review Rahim Uddin' }));
    await user.click(await screen.findByRole('button', { name: 'Reject...' }));

    await user.click(screen.getByRole('button', { name: 'The photo is blurry or cut off' }));
    expect(screen.getByLabelText(/Why is it being rejected/)).toHaveValue('The photo is blurry or cut off.');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    await waitFor(() => expect(adminApi.reject).toHaveBeenCalledWith('u1', 'The photo is blurry or cut off.'));
    expect(await screen.findByText(/was rejected/)).toBeInTheDocument();
  });

  it('handles a student someone else already reviewed', async () => {
    adminApi.approve.mockImplementation(() =>
      fail(409, { message: 'This student has already been reviewed. Refresh the list.', code: 'ALREADY_REVIEWED' })
    );
    const user = userEvent.setup();
    renderApp('/admin');
    await user.click(await screen.findByRole('button', { name: 'Review Rahim Uddin' }));
    const callsBefore = adminApi.list.mock.calls.length;
    await user.click(await screen.findByRole('button', { name: 'Approve student' }));

    expect(await screen.findByText(/already been reviewed/)).toBeInTheDocument();
    await waitFor(() => expect(adminApi.list.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('shows already-reviewed students read-only, with the rejection reason', async () => {
    const rejected = makeUser({
      id: 'u3',
      name: 'Tania Akter',
      verificationStatus: 'rejected',
      rejectionReason: 'Not a university ID card.',
      reviewedAt: '2026-10-02T09:00:00.000Z',
      reviewedBy: { id: 'a1', name: 'Site Admin' },
    });
    adminApi.list.mockImplementation(() => ok(page([rejected])));
    const user = userEvent.setup();
    renderApp('/admin');
    await user.click(await screen.findByRole('button', { name: 'View Tania Akter' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Not a university ID card.')).toBeInTheDocument();
    expect(within(dialog).getByText(/by Site Admin/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Approve student' })).not.toBeInTheDocument();
  });

  it('shows an empty state and an error state with retry', async () => {
    adminApi.list.mockImplementationOnce(() => ok(page([], 0)));
    const user = userEvent.setup();
    renderApp('/admin');
    expect(await screen.findByText('No students are waiting for review')).toBeInTheDocument();

    adminApi.list.mockImplementationOnce(() => Promise.reject(new Error('Network Error')));
    await user.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/);

    adminApi.list.mockImplementation(() => ok(page([rahim])));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Review Rahim Uddin' })).toBeInTheDocument();
  });
});
