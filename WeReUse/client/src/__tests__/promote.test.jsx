import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => import('../test/apiMock.js'));

import { adminApi, authApi, fail, ok, resetApiMocks } from '../test/apiMock.js';
import { makeAdmin, makeUser, renderApp } from '../test/helpers.jsx';

const rahim = makeUser(); // pending
const sara = makeUser({ id: 'u2', name: 'Sara Khan', email: 'sara@example.com', universityRegNumber: '241-35-200', verificationStatus: 'verified', reviewedAt: '2026-10-02T09:00:00.000Z' });
const banned = makeUser({ id: 'u3', name: 'Bad Actor', email: 'bad@example.com', universityRegNumber: '241-35-300', status: 'banned' });
const page = (users) => ({ users, pagination: { page: 1, limit: 10, total: users.length, pages: 1 } });

beforeEach(() => {
  resetApiMocks();
  authApi.me.mockImplementation(() => ok({ user: makeAdmin() }));
  adminApi.list.mockImplementation(() => ok(page([rahim, sara, banned])));
  adminApi.stats.mockImplementation(() => ok({ stats: { pending: 1, verified: 1, rejected: 0, total: 3 } }));
});

async function openDrawer(user, name, buttonLabel = 'Review') {
  renderAppOnce();
  await user.click(await screen.findByRole('button', { name: `${buttonLabel} ${name}` }));
  return screen.findByRole('dialog');
}
const renderAppOnce = () => renderApp('/admin');

describe('making a student an admin', () => {
  it('offers the option on the student\'s review panel', async () => {
    const user = userEvent.setup();
    const dialog = await openDrawer(user, 'Rahim Uddin');
    expect(within(dialog).getByRole('heading', { name: 'Admin rights' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Make this student an admin' })).toBeEnabled();
  });

  it('asks for a valid phone number first', async () => {
    const user = userEvent.setup();
    const dialog = await openDrawer(user, 'Rahim Uddin');
    await user.click(within(dialog).getByRole('button', { name: 'Make this student an admin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm: make admin' }));
    expect(await within(dialog).findByText('Phone number is required')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Phone number of the new admin'), '12345');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm: make admin' }));
    expect(await within(dialog).findByText(/valid mobile number/)).toBeInTheDocument();
    expect(adminApi.promote).not.toHaveBeenCalled();
  });

  it('promotes the student, confirms with a message and refreshes the list', async () => {
    adminApi.promote.mockImplementation(() => ok({ admin: makeAdmin({ id: 'u1', name: 'Rahim Uddin' }) }));
    const user = userEvent.setup();
    const dialog = await openDrawer(user, 'Rahim Uddin');
    const callsBefore = adminApi.list.mock.calls.length;

    await user.click(within(dialog).getByRole('button', { name: 'Make this student an admin' }));
    await user.type(within(dialog).getByLabelText('Phone number of the new admin'), '  +880 1712-345678 ');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm: make admin' }));

    await waitFor(() => expect(adminApi.promote).toHaveBeenCalledWith('u1', '+880 1712-345678'));
    expect(await screen.findByText('Rahim Uddin is now an admin.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(adminApi.list.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('warns when the student has not been verified, but not when they have', async () => {
    const user = userEvent.setup();
    const pending = await openDrawer(user, 'Rahim Uddin');
    await user.click(within(pending).getByRole('button', { name: 'Make this student an admin' }));
    expect(within(pending).getByText('This student is not verified yet')).toBeInTheDocument();
    expect(within(pending).getByText(/ID card status is pending/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'View Sara Khan' }));
    const verified = await screen.findByRole('dialog');
    await user.click(within(verified).getByRole('button', { name: 'Make this student an admin' }));
    expect(within(verified).queryByText('This student is not verified yet')).not.toBeInTheDocument();
    expect(within(verified).getByLabelText('Phone number of the new admin')).toBeInTheDocument();
  });

  it('blocks suspended or banned students', async () => {
    const user = userEvent.setup();
    const dialog = await openDrawer(user, 'Bad Actor');
    expect(within(dialog).getByRole('button', { name: 'Make this student an admin' })).toBeDisabled();
    expect(within(dialog).getByText(/This account is banned/)).toBeInTheDocument();
  });

  it('shows a phone number that is already in use next to the field and stays open', async () => {
    adminApi.promote.mockImplementation(() =>
      fail(409, { message: 'This phone number is already registered.', errors: { phone: 'This phone number is already registered.' } })
    );
    const user = userEvent.setup();
    const dialog = await openDrawer(user, 'Rahim Uddin');
    await user.click(within(dialog).getByRole('button', { name: 'Make this student an admin' }));
    await user.type(within(dialog).getByLabelText('Phone number of the new admin'), '01712345678');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm: make admin' }));

    expect(await within(dialog).findByText('This phone number is already registered.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('can be cancelled', async () => {
    const user = userEvent.setup();
    const dialog = await openDrawer(user, 'Rahim Uddin');
    await user.click(within(dialog).getByRole('button', { name: 'Make this student an admin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog).getByRole('button', { name: 'Make this student an admin' })).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Phone number of the new admin')).not.toBeInTheDocument();
    expect(adminApi.promote).not.toHaveBeenCalled();
  });

  it('refreshes the list if someone else has already promoted the student', async () => {
    adminApi.promote.mockImplementation(() => fail(404, { message: 'Student not found.' }));
    const user = userEvent.setup();
    const dialog = await openDrawer(user, 'Rahim Uddin');
    const callsBefore = adminApi.list.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Make this student an admin' }));
    await user.type(within(dialog).getByLabelText('Phone number of the new admin'), '01712345678');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm: make admin' }));

    expect(await screen.findByText('Student not found.')).toBeInTheDocument();
    await waitFor(() => expect(adminApi.list.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
