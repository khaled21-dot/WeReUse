import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => import('../test/apiMock.js'));

import { authApi, categoryApi, chatApi, listingApi, ok, ratingApi, resetApiMocks } from '../test/apiMock.js';
import { makeUser, renderApp } from '../test/helpers.jsx';

const listing = {
  id: 'l1',
  title: 'Desk lamp',
  description: 'A bright LED desk lamp in good shape.',
  listingType: 'sell',
  price: 300,
  exchangeFor: '',
  condition: 'new',
  usedFor: null,
  images: ['a.jpg'],
  status: 'available',
  category: { id: 'c1', name: 'Home', isActive: true },
  seller: { id: 's1', name: 'Karim Seller', avatar: null, department: 'EEE', batch: '40', memberSince: '2026-01-01', isVerified: true, rating: 4.5, ratingCount: 2 },
  isMine: false,
  createdAt: '2026-11-01T10:00:00.000Z',
};

beforeEach(() => {
  resetApiMocks();
  authApi.me.mockImplementation(() => ok({ user: makeUser({ verificationStatus: 'verified' }) }));
  listingApi.get.mockImplementation(() => ok({ listing }));
});

describe('the item page', () => {
  it('shows the seller with their rating and reviews, and offers a chat instead of a payment', async () => {
    ratingApi.forSeller.mockImplementation(() =>
      ok({
        summary: { average: 4.5, count: 2 },
        ratings: [{ id: 'r1', stars: 5, comment: 'Friendly and on time', buyer: { id: 'b1', name: 'Nadia', avatar: null }, createdAt: '2026-11-01T10:00:00.000Z' }],
      })
    );
    renderApp('/listings/l1');
    expect(await screen.findByText('Rated 4.5 out of 5 from 2 ratings')).toBeInTheDocument();
    expect(await screen.findByText('Friendly and on time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message seller' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Buy now/ })).not.toBeInTheDocument();
  });

  it('"Message seller" opens the chat about the item', async () => {
    const user = userEvent.setup();
    chatApi.start.mockImplementation(() => ok({ conversation: { id: 'c1' } }));
    chatApi.get.mockImplementation(() => new Promise(() => {})); // the chat page itself is not under test here
    chatApi.messages.mockImplementation(() => new Promise(() => {}));
    renderApp('/listings/l1');
    await user.click(await screen.findByRole('button', { name: 'Message seller' }));
    await waitFor(() => expect(chatApi.start).toHaveBeenCalledWith('l1'));
  });
});

describe('editing an item', () => {
  it('the owner opens the edit form pre-filled, removes a photo and saves', async () => {
    const user = userEvent.setup();
    listingApi.get.mockImplementation(() => ok({ listing: { ...listing, isMine: true, images: ['a.jpg', 'b.jpg'] } }));
    categoryApi.listActive.mockImplementation(() => ok({ categories: [{ id: 'c1', name: 'Home' }] }));
    listingApi.update.mockImplementation(() => ok({ listing: { ...listing, id: 'l1', isMine: true } }));

    renderApp('/listings/l1');
    await user.click(await screen.findByRole('link', { name: 'Edit item' }));
    expect(await screen.findByRole('heading', { name: 'Edit your item' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Desk lamp');
    expect(screen.getByLabelText('Price (৳ taka)')).toHaveValue('300');

    await user.clear(screen.getByLabelText('Price (৳ taka)'));
    await user.type(screen.getByLabelText('Price (৳ taka)'), '280');
    await user.click(screen.getByRole('button', { name: 'Remove current photo 2' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(listingApi.update).toHaveBeenCalled());
    const [id, form] = listingApi.update.mock.calls[0];
    expect(id).toBe('l1');
    expect(form.get('price')).toBe('280');
    expect(form.get('keepImages')).toBe(JSON.stringify(['a.jpg']));
  });
});
