import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => import('../test/apiMock.js'));

import { authApi, fail, ok, resetApiMocks } from '../test/apiMock.js';
import { makeUser, pngFile, renderApp } from '../test/helpers.jsx';

beforeEach(() => {
  resetApiMocks();
  sessionStorage.clear();
});

async function fillValidForm(user, { file = pngFile() } = {}) {
  await user.type(await screen.findByLabelText('Full name'), 'Rahim Uddin');
  await user.type(screen.getByLabelText('Email address'), 'rahim@example.com');
  await user.type(screen.getByLabelText('University registration number'), '241-35-100');
  await user.type(screen.getByLabelText(/Department/), 'CSE');
  await user.type(screen.getByLabelText(/Batch/), '42');
  await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
  await user.type(screen.getByLabelText('Confirm password'), 'Passw0rdOK');
  if (file) await user.upload(screen.getByTestId('idcard-input'), file);
}

describe('registration form', () => {
  it('shows every error at once and never calls the API when the form is empty', async () => {
    const user = userEvent.setup();
    renderApp('/register');
    await user.click(await screen.findByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Full name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('University registration number is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByText('Please confirm your password')).toBeInTheDocument();
    expect(screen.getByText('Please upload a photo of your university ID card')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('checks the password rules and the confirmation while typing', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    const password = await screen.findByLabelText('Password');
    await user.type(password, 'onlyletters');
    await user.tab();
    expect(await screen.findByText(/at least one letter and one number/)).toBeInTheDocument();

    await user.clear(password);
    await user.type(password, 'Passw0rdOK');
    expect(screen.getByText('Good')).toBeInTheDocument(); // letters + digits + mixed case, but no symbol
    await user.type(password, '!Extra99');
    expect(screen.getByText('Strong')).toBeInTheDocument();
    await user.clear(password);
    await user.type(password, 'Passw0rdOK');

    await user.type(screen.getByLabelText('Confirm password'), 'Different1');
    await user.tab();
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();

    // fixing the password re-checks the confirmation straight away
    await user.clear(password);
    await user.type(password, 'Different1');
    await waitFor(() => expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument());
  });

  it('rejects a file that is not a JPG or PNG, even if it bypasses the picker filter', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderApp('/register');
    const gif = new File(['x'], 'card.gif', { type: 'image/gif' });
    await user.upload(await screen.findByTestId('idcard-input'), gif);
    expect(await screen.findByText('Only JPG or PNG images are allowed')).toBeInTheDocument();
  });

  it('rejects an image over 5 MB', async () => {
    const user = userEvent.setup();
    renderApp('/register');
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    await user.upload(await screen.findByTestId('idcard-input'), big);
    expect(await screen.findByText(/too large/)).toBeInTheDocument();
  });

  it('shows a preview and lets the student remove the chosen photo', async () => {
    const user = userEvent.setup();
    renderApp('/register');
    await user.upload(await screen.findByTestId('idcard-input'), pngFile('my-card.png'));
    expect(await screen.findByText('my-card.png')).toBeInTheDocument();
    expect(screen.getByAltText('Preview of the ID card you selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Remove/ }));
    expect(screen.queryByText('my-card.png')).not.toBeInTheDocument();
    expect(screen.getByText(/browse your files/)).toBeInTheDocument();
  });

  it('step 1 sends the details and the file as multipart data, then asks for the e-mailed code', async () => {
    authApi.register.mockImplementation(() => ok({ email: 'rahim@example.com', expiresInMinutes: 10, resendAfterSeconds: 60 }));
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user, { file: pngFile('id.png') });
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    // the code screen replaces the form; nobody is logged in yet
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('ra***@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Hi, Rahim/ })).not.toBeInTheDocument();

    const body = authApi.register.mock.calls[0][0];
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('name')).toBe('Rahim Uddin');
    expect(body.get('email')).toBe('rahim@example.com');
    expect(body.get('universityRegNumber')).toBe('241-35-100');
    expect(body.get('department')).toBe('CSE');
    expect(body.get('batch')).toBe('42');
    expect(body.get('password')).toBe('Passw0rdOK');
    expect(body.get('confirmPassword')).toBe('Passw0rdOK');
    expect(body.get('idCard')).toBeInstanceOf(File);
    expect(body.get('idCard').name).toBe('id.png');
  });

  it('shows duplicate-account errors from the server under the right field', async () => {
    authApi.register.mockImplementation(() =>
      fail(409, {
        message: 'An account with this email already exists.',
        errors: { email: 'An account with this email already exists.' },
      })
    );
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const emailField = (await screen.findByLabelText('Email address')).closest('div');
    expect(await within(emailField).findByText('An account with this email already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { name: 'Create your WeReUse account' })).toBeInTheDocument();
  });

  it('shows a server problem in a banner and keeps what was typed', async () => {
    authApi.register.mockImplementation(() => Promise.reject(new Error('Network Error')));
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/);
    expect(screen.getByLabelText('Full name')).toHaveValue('Rahim Uddin');
  });
});

describe('registration step 2: the e-mailed code', () => {
  const info = { email: 'rahim@example.com', expiresInMinutes: 10, resendAfterSeconds: 0 };

  async function reachCodeScreen(user, override = info) {
    authApi.register.mockImplementation(() => ok(override));
    renderApp('/register');
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { name: 'Check your email' });
  }

  it('creates the account and opens the dashboard when the right code is entered', async () => {
    authApi.verifyEmail.mockImplementation(() => ok({ user: makeUser() }));
    const user = userEvent.setup();
    await reachCodeScreen(user);

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify email and create account' }));

    expect(await screen.findByRole('heading', { name: /Hi, Rahim/ })).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledWith('rahim@example.com', '123456');
    expect(sessionStorage.getItem('wereuse.pendingEmail')).toBeNull();
  });

  it('only accepts digits, at most 6, and asks for all 6 before calling the server', async () => {
    const user = userEvent.setup();
    await reachCodeScreen(user);
    const input = screen.getByLabelText('Verification code');

    await user.type(input, '12ab34567890');
    expect(input).toHaveValue('123456');
    await user.clear(input);
    await user.type(input, '123');
    await user.click(screen.getByRole('button', { name: 'Verify email and create account' }));
    expect(await screen.findByText('Enter the 6-digit code')).toBeInTheDocument();
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });

  it('shows a wrong or expired code under the field and stays on the code screen', async () => {
    authApi.verifyEmail.mockImplementation(() =>
      fail(400, { message: 'That code is not correct. 4 attempts left.', code: 'INVALID_CODE', errors: { code: 'That code is not correct. 4 attempts left.' } })
    );
    const user = userEvent.setup();
    await reachCodeScreen(user);
    await user.type(screen.getByLabelText('Verification code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify email and create account' }));

    expect(await screen.findByText('That code is not correct. 4 attempts left.')).toBeInTheDocument();
    expect(screen.getByLabelText('Verification code')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  });

  it('can send a new code, and then makes the student wait before asking again', async () => {
    const user = userEvent.setup();
    await reachCodeScreen(user);

    await user.click(screen.getByRole('button', { name: 'Resend code' }));
    await waitFor(() => expect(authApi.resendCode).toHaveBeenCalledWith('rahim@example.com'));
    expect(await screen.findByText(/A new code is on its way/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend code in 60s' })).toBeDisabled();
  });

  it('counts the resend wait down second by second', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await reachCodeScreen(user, { ...info, resendAfterSeconds: 3 });
      expect(screen.getByRole('button', { name: 'Resend code in 3s' })).toBeDisabled();

      for (const left of [2, 1]) {
        await act(async () => {
          vi.advanceTimersByTime(1000); // one tick at a time: each tick schedules the next after React re-renders
        });
        expect(screen.getByRole('button', { name: `Resend code in ${left}s` })).toBeDisabled();
      }
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(await screen.findByRole('button', { name: 'Resend code' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the server\'s wait message if the code is requested too soon', async () => {
    authApi.resendCode.mockImplementation(() => fail(429, { message: 'Please wait 42 seconds before asking for another code.' }));
    const user = userEvent.setup();
    await reachCodeScreen(user);
    await user.click(screen.getByRole('button', { name: 'Resend code' }));
    expect(await screen.findByText(/Please wait 42 seconds/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend code in 42s' })).toBeDisabled();
  });

  it('lets the student start over with a different e-mail, keeping what they typed', async () => {
    const user = userEvent.setup();
    await reachCodeScreen(user);
    await user.click(screen.getByRole('button', { name: 'Wrong email? Start over' }));

    expect(await screen.findByRole('heading', { name: 'Create your WeReUse account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Rahim Uddin');
    expect(sessionStorage.getItem('wereuse.pendingEmail')).toBeNull();
  });

  it('comes back to the code screen after a page refresh', async () => {
    sessionStorage.setItem('wereuse.pendingEmail', 'rahim@example.com');
    renderApp('/register');
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('ra***@example.com')).toBeInTheDocument();
  });
});
