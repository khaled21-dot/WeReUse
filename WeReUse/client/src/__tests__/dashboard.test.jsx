import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => import('../test/apiMock.js'));

import { authApi, fail, ok, resetApiMocks, verificationApi } from '../test/apiMock.js';
import { makeUser, pngFile, renderApp } from '../test/helpers.jsx';

beforeEach(() => resetApiMocks());

describe('dashboard - pending', () => {
  it('shows the pass, the waiting message and the locked features', async () => {
    authApi.me.mockImplementation(() => ok({ user: makeUser() }));
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Your ID card is waiting for review' })).toBeInTheDocument();
    expect(screen.getByText('241-35-100')).toBeInTheDocument();
    expect(screen.getByText('Under review')).toBeInTheDocument();
    expect(screen.getAllByText('Locked until verified')).toHaveLength(3);
    // the student can see their own submitted ID through the protected endpoint
    expect(await screen.findByAltText('The ID card you submitted')).toBeInTheDocument();
    expect(verificationApi.idCard).toHaveBeenCalledWith('u1');
  });

  it('picks up an approval and tells the student', async () => {
    authApi.me
      .mockImplementationOnce(() => ok({ user: makeUser() })) // first load
      .mockImplementation(() => ok({ user: makeUser({ verificationStatus: 'verified', reviewedAt: '2026-10-02T09:00:00.000Z' }) }));
    const user = userEvent.setup();
    renderApp('/dashboard');

    await user.click(await screen.findByRole('button', { name: /Check status now/ }));

    expect(await screen.findByRole('heading', { name: "You're a verified student" })).toBeInTheDocument();
    expect(screen.getAllByText('Unlocked')).toHaveLength(3);
    expect(screen.getAllByText('Verified student').length).toBeGreaterThan(0);
    expect(await screen.findByText(/You're verified!/)).toBeInTheDocument();
  });

  it('picks up a rejection and shows the reason', async () => {
    authApi.me
      .mockImplementationOnce(() => ok({ user: makeUser() }))
      .mockImplementation(() =>
        ok({ user: makeUser({ verificationStatus: 'rejected', rejectionReason: 'The photo is blurry.' }) })
      );
    const user = userEvent.setup();
    renderApp('/dashboard');

    await user.click(await screen.findByRole('button', { name: /Check status now/ }));

    expect(await screen.findByRole('heading', { name: 'Your ID card needs another look' })).toBeInTheDocument();
    expect(screen.getAllByText('The photo is blurry.').length).toBeGreaterThan(0);
  });

  it('logs the student out of the page if the session has ended', async () => {
    authApi.me
      .mockImplementationOnce(() => ok({ user: makeUser() }))
      .mockImplementation(() => fail(401, { message: 'Your session has expired. Please log in again.' }));
    const user = userEvent.setup();
    renderApp('/dashboard');

    await user.click(await screen.findByRole('button', { name: /Check status now/ }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});

describe('dashboard - verified', () => {
  it('shows the verified state and no upload form', async () => {
    authApi.me.mockImplementation(() =>
      ok({ user: makeUser({ verificationStatus: 'verified', reviewedAt: '2026-10-02T09:00:00.000Z' }) })
    );
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: "You're a verified student" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send for review again/ })).not.toBeInTheDocument();
  });
});

describe('dashboard - rejected', () => {
  const rejected = () =>
    makeUser({ verificationStatus: 'rejected', rejectionReason: 'The registration number does not match the card.' });

  it('requires a new photo before resubmitting', async () => {
    authApi.me.mockImplementation(() => ok({ user: rejected() }));
    const user = userEvent.setup();
    renderApp('/dashboard');

    await user.click(await screen.findByRole('button', { name: 'Send for review again' }));
    expect(await screen.findByText('Please upload a photo of your university ID card')).toBeInTheDocument();
    expect(verificationApi.resubmit).not.toHaveBeenCalled();
  });

  it('sends the new photo (and a corrected number) and returns to the pending state', async () => {
    authApi.me.mockImplementation(() => ok({ user: rejected() }));
    verificationApi.resubmit.mockImplementation(() =>
      ok({ user: makeUser({ universityRegNumber: '241-35-101', verificationStatus: 'pending' }) })
    );
    const user = userEvent.setup();
    renderApp('/dashboard');

    const reg = await screen.findByLabelText('University registration number');
    expect(reg).toHaveValue('241-35-100');
    await user.clear(reg);
    await user.type(reg, '241-35-101');
    await user.upload(screen.getByTestId('idcard-input'), pngFile('better.png'));
    await user.click(screen.getByRole('button', { name: 'Send for review again' }));

    expect(await screen.findByRole('heading', { name: 'Your ID card is waiting for review' })).toBeInTheDocument();
    const body = verificationApi.resubmit.mock.calls[0][0];
    expect(body.get('idCard').name).toBe('better.png');
    expect(body.get('universityRegNumber')).toBe('241-35-101');
  });

  it('does not send the registration number when it was not changed', async () => {
    authApi.me.mockImplementation(() => ok({ user: rejected() }));
    verificationApi.resubmit.mockImplementation(() => ok({ user: makeUser() }));
    const user = userEvent.setup();
    renderApp('/dashboard');

    await user.upload(await screen.findByTestId('idcard-input'), pngFile());
    await user.click(screen.getByRole('button', { name: 'Send for review again' }));

    await waitFor(() => expect(verificationApi.resubmit).toHaveBeenCalled());
    expect(verificationApi.resubmit.mock.calls[0][0].has('universityRegNumber')).toBe(false);
  });

  it('shows a server error without leaving the page', async () => {
    authApi.me.mockImplementation(() => ok({ user: rejected() }));
    verificationApi.resubmit.mockImplementation(() => fail(409, { message: 'Your verification is already waiting for review.' }));
    const user = userEvent.setup();
    renderApp('/dashboard');

    await user.upload(await screen.findByTestId('idcard-input'), pngFile());
    await user.click(screen.getByRole('button', { name: 'Send for review again' }));

    expect(await screen.findByText(/already waiting for review/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your ID card needs another look' })).toBeInTheDocument();
  });
});
