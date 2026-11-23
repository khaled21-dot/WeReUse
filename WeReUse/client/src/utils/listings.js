// Shared helpers for the listings screens (labels, price/usage text, form + photo checks).
// The limits mirror the server (server/src/utils/listingConstants.js); the server checks again.

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_MB = 5;
export const MAX_PRICE = 1000000;

const API_BASE = import.meta.env.VITE_API_URL || '/api';
/** Product photos are protected by the login cookie, which the browser sends with a normal <img>. */
export const imageUrl = (filename) => `${API_BASE}/listings/images/${filename}`;
/** Profile photos, also behind the login cookie. */
export const avatarUrl = (filename) => `${API_BASE}/profile/avatars/${filename}`;

export const TYPE_OPTIONS = [
  { value: 'sell', label: 'Sell', hint: 'Set a price in taka' },
  { value: 'exchange', label: 'Exchange', hint: 'Swap for something else' },
  { value: 'donate', label: 'Donate', hint: 'Give it away for free' },
];
export const TYPE_LABELS = { sell: 'For sale', exchange: 'Exchange', donate: 'Free' };
export const TYPE_BADGE = {
  sell: 'bg-blue-50 text-blue-800',
  exchange: 'bg-amber-100 text-amber-800',
  donate: 'bg-green-100 text-green-800',
};

export const CONDITION_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];
export const CONDITION_LABELS = Object.fromEntries(CONDITION_OPTIONS.map((o) => [o.value, o.label]));

export const UNIT_OPTIONS = [
  { value: 'days', label: 'days' },
  { value: 'weeks', label: 'weeks' },
  { value: 'months', label: 'months' },
  { value: 'years', label: 'years' },
];
const UNIT_SINGULAR = { days: 'day', weeks: 'week', months: 'month', years: 'year' };

export const formatPrice = (amount) => `৳${Number(amount).toLocaleString('en-US')}`;

/** "৳450", "Free" or "Exchange" */
export function priceLabel(listing) {
  if (listing.listingType === 'sell') return formatPrice(listing.price);
  return listing.listingType === 'donate' ? 'Free' : 'Exchange';
}

/** "Never used" or "Used for 6 months" */
export function formatUsed(usedFor) {
  if (!usedFor) return 'Never used';
  const { value, unit } = usedFor;
  return `Used for ${value} ${value === 1 ? UNIT_SINGULAR[unit] : unit}`;
}

// ---- checks (same rules as the server) ----
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png'];

export function validatePhoto(file) {
  if (!file) return 'Choose a photo';
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return 'Only JPG or PNG images are allowed';
  if (file.size === 0) return 'That file is empty';
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) return `The image is too large (maximum ${MAX_PHOTO_MB} MB)`;
  return '';
}

const isWhole = (text) => /^\d+$/.test(String(text).trim());

export function validateListingForm(v, photos) {
  const errors = {};
  const title = v.title.trim();
  const description = v.description.trim();

  if (title.length < 3) errors.title = 'Title must be at least 3 characters';
  else if (title.length > 100) errors.title = 'Title is too long (100 characters maximum)';

  if (description.length < 10) errors.description = 'Please describe the item (at least 10 characters)';
  else if (description.length > 2000) errors.description = 'Description is too long (2000 characters maximum)';

  if (!v.category) errors.category = 'Choose a category';
  if (!v.listingType) errors.listingType = 'Choose sell, exchange or donate';
  if (!v.condition) errors.condition = 'Choose the condition of the item';

  if (v.listingType === 'sell') {
    if (!String(v.price).trim()) errors.price = 'Enter a price in taka';
    else if (!isWhole(v.price) || Number(v.price) < 1) errors.price = 'Price must be a whole number of at least 1';
    else if (Number(v.price) > MAX_PRICE) errors.price = `Price must be at most ${MAX_PRICE.toLocaleString('en-US')}`;
  }
  if (v.listingType === 'exchange' && v.exchangeFor.trim().length > 200) {
    errors.exchangeFor = 'Keep this under 200 characters';
  }

  if (v.condition && v.condition !== 'new') {
    if (!String(v.usedValue).trim()) errors.usedValue = 'Tell us how long you have used it';
    else if (!isWhole(v.usedValue) || Number(v.usedValue) < 1 || Number(v.usedValue) > 99) {
      errors.usedValue = 'Enter a whole number from 1 to 99';
    }
    if (!v.usedUnit) errors.usedUnit = 'Choose days, weeks, months or years';
  }

  if (photos.length === 0) errors.images = 'Add at least one photo of the item';
  else if (photos.length > MAX_PHOTOS) errors.images = `You can add up to ${MAX_PHOTOS} photos`;

  return errors;
}

/** The multipart body for POST /api/listings and PATCH /api/listings/:id (keep = current photos to keep, when editing). */
export function buildListingFormData(v, photos, keep) {
  const fd = new FormData();
  fd.append('title', v.title.trim());
  fd.append('description', v.description.trim());
  fd.append('category', v.category);
  fd.append('listingType', v.listingType);
  fd.append('condition', v.condition);
  if (v.listingType === 'sell') fd.append('price', String(v.price).trim());
  if (v.listingType === 'exchange' && v.exchangeFor.trim()) fd.append('exchangeFor', v.exchangeFor.trim());
  if (v.condition !== 'new') {
    fd.append('usedValue', String(v.usedValue).trim());
    fd.append('usedUnit', v.usedUnit);
  }
  if (keep) fd.append('keepImages', JSON.stringify(keep));
  photos.forEach((file) => fd.append('images', file));
  return fd;
}