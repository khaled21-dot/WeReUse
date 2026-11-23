// Small helpers for the chat screens.
import { formatPrice } from './listings';

export const initials = (name) =>
  String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

export const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** "Today", "Yesterday" or "12 Mar 2026" */
export function dayLabel(iso, now = new Date()) {
  const d = new Date(iso);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/** Adds messages to a thread: no duplicates (the newer copy wins), oldest first. */
export function mergeMessages(list, incoming) {
  const byId = new Map(list.map((m) => [m.id, m]));
  incoming.filter(Boolean).forEach((m) => byId.set(m.id, { ...byId.get(m.id), ...m }));
  return [...byId.values()].sort((a, b) => {
    const t = new Date(a.createdAt) - new Date(b.createdAt);
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });
}

export const OFFER_STATUS_TEXT = {
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  superseded: 'Replaced by a newer offer',
};

export const offerHeadline = (offer) => (offer.kind === 'price' ? `Offer: ${formatPrice(offer.amount)}` : 'Exchange offer');

/** What the inbox shows as the last message. */
export function previewText(lastMessage) {
  if (!lastMessage) return 'No messages yet';
  return `${lastMessage.mine ? 'You: ' : ''}${lastMessage.text}`;
}