import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => import('../test/apiMock.js'));

import { adminApi, authApi, fail, ok, profileApi, resetApiMocks, verificationApi } from '../test/apiMock.js';
import { makeAdmin, makeUser, renderApp } from '../test/helpers.jsx';

const verified = (over = {}) => makeUser({ verificationStatus: 'verified', reviewedAt: '2026-10-02T09:00:00.000Z', ...over });

beforeEach(() => {
  resetApiMocks();
  authApi.me.mockImplementation(() => ok({ user: verified() }));
});

describe('who can open the profile', () => {
  it('shows a verified student their details, with the registration number and ID photo locked', async () => {
    renderApp('/profile');
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();

    expect(screen.getByLabelText('Full name')).toHaveValue('Rahim Uddin');
    expect(screen.getByLabelText(/Department/)).toHaveValue('CSE');
    expect(screen.getByLabelText(/Batch/)).toHaveValue('42');
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument();

    const locked = screen.getByRole('complementary');
    expect(within(locked).getByText('Cannot be changed')).toBeInTheDocument();
    expect(within(locked).getByText('241-35-100')).toBeInTheDocument();
    expect(await within(locked).findByAltText('Your university ID card')).toBeInTheDocument();
    expect(verificationApi.idCard).toHaveBeenCalledWith('u1');

    // read-only: there is NO input for either of them anywhere on the page
    expect(screen.queryByLabelText(/registration number/i)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('keeps students who are not verified out', async () => {
    authApi.me.mockImplementation(() => ok({ user: makeUser() })); // pending
    renderApp('/profile');
    expect(await screen.findByText('Profile editing unlocks after verification')).toBeInTheDocument();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  });

  it('gives admins a phone number field, their badge and their own ID card', async () => {
    authApi.me.mockImplementation(() => ok({ user: makeAdmin() }));
    renderApp('/profile');
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();

    expect(screen.getByLabelText('Phone number')).toHaveValue('01700000000');
    expect(screen.queryByLabelText(/Department/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('complementary')).getByText('ADMIN-0001')).toBeInTheDocument();
    await waitFor(() => expect(adminApi.idCard).toHaveBeenCalledWith('a1'));
    expect(screen.queryByLabelText(/registration number/i)).not.toBeInTheDocument();
  });

  it('shows the "My profile" link only to verified students and admins', async () => {
    const first = renderApp('/dashboard');
    expect((await screen.findAllByRole('link', { name: 'My profile' })).length).toBeGreaterThan(0);
    first.unmount();

    authApi.me.mockImplementation(() => ok({ user: makeUser() })); // pending
    const second = renderApp('/dashboard');
    await screen.findByRole('heading', { name: /Hi, Rahim/ });
    expect(screen.queryByRole('link', { name: 'My profile' })).not.toBeInTheDocument();
    second.unmount();

    authApi.me.mockImplementation(() => ok({ user: makeAdmin() }));
    adminApi.list.mockImplementation(() => ok({ users: [], pagination: { page: 1, limit: 10, total: 0, pages: 1 } }));
    renderApp('/admin');
    expect((await screen.findAllByRole('link', { name: 'My profile' })).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/profile');
  });

  it('offers "Edit my profile" on the dashboard once verified', async () => {
    const user = userEvent.setup();
    renderApp('/dashboard');
    await user.click(await screen.findByRole('link', { name: 'Edit my profile' }));
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
  });
});

describe('editing the details', () => {
  it('sends only what changed and shows the new values', async () => {
    profileApi.update.mockImplementation(() => ok({ user: verified({ name: 'Rahim Uddin Khan' }) }));
    const user = userEvent.setup();
    renderApp('/profile');

    const name = await screen.findByLabelText('Full name');
    await user.clear(name);
    await user.type(name, 'Rahim Uddin Khan');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(profileApi.update).toHaveBeenCalledWith({ name: 'Rahim Uddin Khan' }));
    expect(await screen.findByText('Your profile was updated.')).toBeInTheDocument();
  });

  it('does not bother the server when nothing changed', async () => {
    const user = userEvent.setup();
    renderApp('/profile');
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('There is nothing to save yet.')).toBeInTheDocument();
    expect(profileApi.update).not.toHaveBeenCalled();
  });

  it('checks the name before sending', async () => {
    const user = userEvent.setup();
    renderApp('/profile');
    const name = await screen.findByLabelText('Full name');
    await user.clear(name);
    await user.type(name, 'R2D2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Use letters, spaces/)).toBeInTheDocument();
    expect(profileApi.update).not.toHaveBeenCalled();
  });

  it('lets an admin change the phone number and shows a duplicate from the server', async () => {
    authApi.me.mockImplementation(() => ok({ user: makeAdmin() }));
    profileApi.update.mockImplementation(() =>
      fail(409, { message: 'This phone number is already registered.', errors: { phone: 'This phone number is already registered.' } })
    );
    const user = userEvent.setup();
    renderApp('/profile');

    const phone = await screen.findByLabelText('Phone number');
    await user.clear(phone);
    await user.type(phone, '123');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/valid mobile number/)).toBeInTheDocument();

    await user.clear(phone);
    await user.type(phone, '01812345678');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(profileApi.update).toHaveBeenCalledWith({ phone: '01812345678' }));
    expect(await screen.findByText('This phone number is already registered.')).toBeInTheDocument();
  });
});

describe('changing the password', () => {
  const fill = async (user, current, next, confirm) => {
    if (current) await user.type(await screen.findByLabelText('Current password'), current);
    if (next) await user.type(screen.getByLabelText('New password'), next);
    if (confirm) await user.type(screen.getByLabelText('Confirm new password'), confirm);
  };

  it('checks the new password before sending', async () => {
    const user = userEvent.setup();
    renderApp('/profile');
    await user.click(await screen.findByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Current password is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();

    await fill(user, 'Passw0rdOK', 'Passw0rdOK', 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/different from your current one/)).toBeInTheDocument();
    expect(profileApi.changePassword).not.toHaveBeenCalled();
  });

  it('changes it and clears the form', async () => {
    profileApi.changePassword.mockImplementation(() => ok({}));
    const user = userEvent.setup();
    renderApp('/profile');
    await fill(user, 'Passw0rdOK', 'Brand9NewPass', 'Brand9NewPass');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(profileApi.changePassword).toHaveBeenCalledWith({
        currentPassword: 'Passw0rdOK',
        newPassword: 'Brand9NewPass',
        confirmPassword: 'Brand9NewPass',
      })
    );
    expect(await screen.findByText(/Your other devices were logged out/)).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('shows a wrong current password next to that field', async () => {
    profileApi.changePassword.mockImplementation(() =>
      fail(400, { message: 'Your current password is not correct.', errors: { currentPassword: 'Your current password is not correct.' } })
    );
    const user = userEvent.setup();
    renderApp('/profile');
    await fill(user, 'WrongPass1', 'Brand9NewPass', 'Brand9NewPass');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Your current password is not correct.')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('changing the e-mail address', () => {
  const info = { pendingEmail: 'fresh@example.com', expiresInMinutes: 10, resendAfterSeconds: 0 };

  async function openChangeForm(user) {
    await user.click(await screen.findByRole('button', { name: 'Change email' }));
    return screen.findByLabelText('New email address');
  }

  it('shows the current e-mail and when it was verified', async () => {
    renderApp('/profile');
    expect(await screen.findByText('rahim@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Verified on/)).toBeInTheDocument();
  });

  it('asks for the new address and the password first', async () => {
    const user = userEvent.setup();
    renderApp('/profile');
    await openChangeForm(user);
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText(/current password to confirm/)).toBeInTheDocument();
    expect(profileApi.requestEmailChange).not.toHaveBeenCalled();
  });

  it('sends a code to the new address, then switches the e-mail when the code is right', async () => {
    profileApi.requestEmailChange.mockImplementation(() => ok(info));
    profileApi.confirmEmailChange.mockImplementation(() => ok({ user: verified({ email: 'fresh@example.com' }) }));
    const user = userEvent.setup();
    renderApp('/profile');

    await user.type(await openChangeForm(user), 'fresh@example.com');
    await user.type(screen.getByLabelText('Your current password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    await waitFor(() => expect(profileApi.requestEmailChange).toHaveBeenCalledWith({ newEmail: 'fresh@example.com', password: 'Passw0rdOK' }));
    expect(await screen.findByText('fr***@example.com')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Verification code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm new email' }));

    await waitFor(() => expect(profileApi.confirmEmailChange).toHaveBeenCalledWith('654321'));
    expect(await screen.findByText('Your email address was updated.')).toBeInTheDocument();
    expect(await screen.findByText('fresh@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change email' })).toBeInTheDocument();
  });

  it('shows a taken address or a wrong password next to the right field', async () => {
    profileApi.requestEmailChange.mockImplementation(() =>
      fail(409, { message: 'An account with this email already exists.', errors: { newEmail: 'An account with this email already exists.' } })
    );
    const user = userEvent.setup();
    renderApp('/profile');
    await user.type(await openChangeForm(user), 'taken@example.com');
    await user.type(screen.getByLabelText('Your current password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText('New email address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a wrong code and keeps the old e-mail', async () => {
    profileApi.requestEmailChange.mockImplementation(() => ok(info));
    profileApi.confirmEmailChange.mockImplementation(() =>
      fail(400, { message: 'That code is not correct. 4 attempts left.', errors: { code: 'That code is not correct. 4 attempts left.' } })
    );
    const user = userEvent.setup();
    renderApp('/profile');
    await user.type(await openChangeForm(user), 'fresh@example.com');
    await user.type(screen.getByLabelText('Your current password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('Verification code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirm new email' }));

    expect(await screen.findByText('That code is not correct. 4 attempts left.')).toBeInTheDocument();
    expect(screen.queryByText('Your email address was updated.')).not.toBeInTheDocument();
  });

  it('can resend the code and can cancel the change', async () => {
    profileApi.requestEmailChange.mockImplementation(() => ok(info));
    profileApi.resendEmailChange.mockImplementation(() => ok({ ...info, resendAfterSeconds: 60 }));
    profileApi.cancelEmailChange.mockImplementation(() => ok({ user: verified() }));
    const user = userEvent.setup();
    renderApp('/profile');
    await user.type(await openChangeForm(user), 'fresh@example.com');
    await user.type(screen.getByLabelText('Your current password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    await user.click(await screen.findByRole('button', { name: 'Resend code' }));
    await waitFor(() => expect(profileApi.resendEmailChange).toHaveBeenCalled());
    expect(await screen.findByText(/A new code is on its way/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel the change' }));
    await waitFor(() => expect(profileApi.cancelEmailChange).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Change email' })).toBeInTheDocument();
  });

  it('goes straight to the code screen if a change is already waiting for its code', async () => {
    authApi.me.mockImplementation(() => ok({ user: verified({ pendingEmail: 'waiting@example.com' }) }));
    renderApp('/profile');
    expect(await screen.findByText('wa***@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
  });
});
