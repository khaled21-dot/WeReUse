'use strict';
/**
 * The rules of the chat, as plain functions: data in, a problem (or null) out. No database, no
 * sockets - so every rule can be tested on its own. A "problem" is { status, code, message }.
 */
const { MAX_PRICE } = require('./listingConstants');

const problem = (status, code, message) => ({ status, code, message });
const sameId = (a, b) => String(a) === String(b);

const sideOf = (conversation, userId) => {
  if (sameId(conversation.buyer && conversation.buyer._id ? conversation.buyer._id : conversation.buyer, userId)) return 'buyer';
  if (sameId(conversation.seller && conversation.seller._id ? conversation.seller._id : conversation.seller, userId)) return 'seller';
  return null;
};
const otherSide = (side) => (side === 'buyer' ? 'seller' : 'buyer');

/** Can this student open a chat about this item? (listing / category / seller are the loaded records) */
function startChatProblem({ listing, category, seller, userId }) {
  if (!listing || listing.status !== 'available' || !category || !category.isActive || !seller || seller.status !== 'active') {
    return problem(404, 'LISTING_UNAVAILABLE', 'This item is not available.');
  }
  if (sameId(seller._id || listing.seller, userId)) {
    return problem(400, 'OWN_LISTING', 'This is your own item - other students will message you about it.');
  }
  return null;
}

/** Can a new offer be made right now? `offer` is { kind, amount?, item? } (already format-checked). */
function offerProblem({ listing, conversation, offer }) {
  if (!listing) return problem(409, 'LISTING_DELETED', 'This item was deleted, so the conversation is read-only.');
  if (listing.status !== 'available') return problem(409, 'LISTING_CLOSED', 'This item is no longer available, so offers are closed.');
  if (conversation.agreedOffer) return problem(409, 'DEAL_AGREED', 'A deal is already agreed for this item.');
  if (listing.listingType === 'donate') {
    return problem(400, 'NO_OFFERS_ON_DONATION', 'This item is free. Send a message to ask for it instead of making an offer.');
  }
  if (offer.kind === 'price') {
    if (listing.listingType !== 'sell') return problem(400, 'WRONG_OFFER_KIND', 'Price offers are only for items on sale. Propose an exchange instead.');
    if (!Number.isInteger(offer.amount) || offer.amount < 1 || offer.amount > MAX_PRICE) {
      return problem(400, 'INVALID_OFFER', 'Enter a whole price in taka.');
    }
  }
  if (offer.kind === 'exchange') {
    if (listing.listingType !== 'exchange') return problem(400, 'WRONG_OFFER_KIND', 'Exchange offers are only for items listed for exchange.');
    if (!offer.item || !offer.item.trim()) return problem(400, 'INVALID_OFFER', 'Say what you would give in exchange.');
  }
  return null;
}

/** Can this person accept / decline / withdraw this offer message? */
function offerResponseProblem({ message, userId, action }) {
  if (!message || message.type !== 'offer' || !message.offer) return problem(404, 'NOT_FOUND', 'Offer not found.');
  if (message.offer.status !== 'pending') return problem(409, 'OFFER_NOT_PENDING', 'This offer was already answered or replaced by a newer one.');
  const mine = sameId(message.sender, userId);
  if (action === 'withdraw' && !mine) return problem(403, 'FORBIDDEN', 'Only the person who made an offer can withdraw it.');
  if ((action === 'accept' || action === 'decline') && mine) return problem(403, 'FORBIDDEN', 'You cannot answer your own offer.');
  return null;
}

const STATUS_FOR_ACTION = { accept: 'accepted', decline: 'declined', withdraw: 'withdrawn' };

// ---- wording ----
const formatTaka = (n) => `৳${Number(n).toLocaleString('en-US')}`;
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** "৳450" or "an exchange for: a USB hub" */
function describeOffer(offer) {
  return offer.kind === 'price' ? formatTaka(offer.amount) : `an exchange for: ${offer.item}`;
}

/** What the inbox shows as the last message. */
function previewFor(message) {
  if (message.type === 'offer') {
    return message.offer.kind === 'price' ? `Offer: ${formatTaka(message.offer.amount)}` : `Exchange offer: ${clip(message.offer.item, 60)}`;
  }
  return clip(String(message.text || '').replace(/\s+/g, ' ').trim(), 120);
}

/** The grey line in the thread after an offer is answered. */
function systemTextFor(action, actorName, offer) {
  const what = offer.kind === 'price' ? `the offer of ${formatTaka(offer.amount)}` : 'the exchange offer';
  if (action === 'accept') return `${actorName} accepted ${what}. Arrange the handover here - then the seller can mark the item as sold.`;
  if (action === 'decline') return `${actorName} declined ${what}.`;
  return `${actorName} withdrew ${what}.`;
}

module.exports = {
  sideOf,
  otherSide,
  startChatProblem,
  offerProblem,
  offerResponseProblem,
  STATUS_FOR_ACTION,
  describeOffer,
  previewFor,
  systemTextFor,
  formatTaka,
  clip,
};