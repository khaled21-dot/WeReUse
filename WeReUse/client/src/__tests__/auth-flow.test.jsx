import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => import('../test/apiMock.js'));

import { adminApi, authApi, fail, ok, resetApiMocks } from '../test/apiMock.js';
import { makeAdmin, makeUser, renderApp } from '../test/helpers.jsx';

beforeEach(() => resetApiMocks());

describe('route protection', () => {
  it('sends a visitor who is not logged in from /dashboard to the login page', async () => {
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('sends a logged-in student away from /login to the dashboard', async () => {
    authApi.me.mockImplementation(() => ok({ user: makeUser() }));
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: /Hi, Rahim/ })).toBeInTheDocument();
  });

  it('keeps students out of /admin', async () => {
    authApi.me.mockImplementation(() => ok({ user: makeUser() }));
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: /Hi, Rahim/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Verification queue' })).not.toBeInTheDocument();
  });

  it('sends an admin from /dashboard to the verification queue', async () => {
    authApi.me.mockImplementation(() => ok({ user: makeAdmin() }));
    adminApi.list.mockImplementation(() => ok({ users: [], pagination: { page: 1, limit: 10, total: 0, pages: 1 } }));
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Verification queue' })).toBeInTheDocument();
  });

  it('returns to the page the visitor first asked for after logging in', async () => {
    adminApi.list.mockImplementation(() => ok({ users: [], pagination: { page: 1, limit: 10, total: 0, pages: 1 } }));
    authApi.login.mockImplementation(() => ok({ user: makeAdmin() }));
    const user = userEvent.setup();
    renderApp('/admin');

    await user.type(await screen.findByLabelText('Email address'), 'admin@wereuse.com');
    await user.type(screen.getByLabelText('Password'), 'Admin@12345');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: 'Verification queue' })).toBeInTheDocument();
  });
});

describe('login page', () => {
  it('shows validation errors and does not call the API for an empty form', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('logs in and lands on the dashboard', async () => {
    authApi.login.mockImplementation(() => ok({ user: makeUser() }));
    const user = userEvent.setup();
    renderApp('/login');

    await user.type(await screen.findByLabelText('Email address'), '  rahim@example.com ');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: /Hi, Rahim/ })).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith({ email: 'rahim@example.com', password: 'Passw0rdOK' });
  });

  it('shows the server message for wrong credentials and stays on the page', async () => {
    authApi.login.mockImplementation(() => fail(401, { message: 'Invalid email or password.' }));
    const user = userEvent.setup();
    renderApp('/login');

    await user.type(await screen.findByLabelText('Email address'), 'rahim@example.com');
    await user.type(screen.getByLabelText('Password'), 'WrongPass1');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('explains a network problem clearly', async () => {
    authApi.login.mockImplementation(() => Promise.reject(new Error('Network Error')));
    const user = userEvent.setup();
    renderApp('/login');

    await user.type(await screen.findByLabelText('Email address'), 'rahim@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/);
  });

  it('can show and hide the password', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    const input = await screen.findByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});

describe('logging out', () => {
  it('calls the API and returns to the public home page', async () => {
    authApi.me.mockImplementation(() => ok({ user: makeUser() }));
    const user = userEvent.setup();
    renderApp('/dashboard');

    await screen.findByRole('heading', { name: /Hi, Rahim/ });
    await user.click(screen.getAllByRole('button', { name: /Log out/ })[0]);

    await waitFor(() => expect(authApi.logout).toHaveBeenCalled());
    expect(await screen.findByRole('link', { name: 'Create your account' })).toBeInTheDocument();
  });
});

describe('misc pages', () => {
  it('shows the home page and a friendly 404', async () => {
    const first = renderApp('/');
    expect(await screen.findByRole('heading', { name: /Someone on campus needs/ })).toBeInTheDocument();
    first.unmount();

    renderApp('/definitely-not-a-page');
    expect(await screen.findByRole('heading', { name: /could not find that page/ })).toBeInTheDocument();
  });
});
