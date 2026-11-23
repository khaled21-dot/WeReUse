import { describe, expect, it } from 'vitest';
import { buildListingFormData, formatPrice, formatUsed, priceLabel, validateListingForm, validatePhoto } from '../utils/listings';

const photo = (over = {}) => ({ name: 'a.jpg', type: 'image/jpeg', size: 1000, ...over });
const valid = {
  title: 'Calculus textbook',
  description: 'Thomas Calculus, 14th edition.',
  category: 'cat1',
  listingType: 'sell',
  price: '450',
  exchangeFor: '',
  condition: 'good',
  usedValue: '6',
  usedUnit: 'months',
};

describe('listing text helpers', () => {
  it('formats prices, usage and the price label', () => {
    expect(formatPrice(12500)).toBe('৳12,500');
    expect(formatUsed(null)).toBe('Never used');
    expect(formatUsed({ value: 1, unit: 'months' })).toBe('Used for 1 month');
    expect(formatUsed({ value: 6, unit: 'months' })).toBe('Used for 6 months');
    expect(priceLabel({ listingType: 'sell', price: 450 })).toBe('৳450');
    expect(priceLabel({ listingType: 'donate' })).toBe('Free');
    expect(priceLabel({ listingType: 'exchange' })).toBe('Exchange');
  });
});

describe('validatePhoto', () => {
  it('accepts JPG/PNG within 5 MB and rejects the rest', () => {
    expect(validatePhoto(photo())).toBe('');
    expect(validatePhoto(photo({ type: 'application/pdf' }))).toBe('Only JPG or PNG images are allowed');
    expect(validatePhoto(photo({ size: 6 * 1024 * 1024 }))).toContain('too large');
    expect(validatePhoto(photo({ size: 0 }))).toBe('That file is empty');
  });
});

describe('validateListingForm', () => {
  it('passes a complete sale', () => {
    expect(validateListingForm(valid, [photo()])).toEqual({});
  });

  it('asks for a price only when selling, and ignores it for donations', () => {
    expect(validateListingForm({ ...valid, price: '' }, [photo()]).price).toBeTruthy();
    expect(validateListingForm({ ...valid, price: '12.5' }, [photo()]).price).toBeTruthy();
    expect(validateListingForm({ ...valid, listingType: 'donate', price: '' }, [photo()])).toEqual({});
  });

  it('asks for used time unless the item is new', () => {
    expect(validateListingForm({ ...valid, usedValue: '' }, [photo()]).usedValue).toBeTruthy();
    expect(validateListingForm({ ...valid, condition: 'new', usedValue: '' }, [photo()])).toEqual({});
  });

  it('needs at least one and at most five photos', () => {
    expect(validateListingForm(valid, []).images).toBeTruthy();
    expect(validateListingForm(valid, Array(6).fill(photo())).images).toBeTruthy();
  });

  it('reports every missing field at once', () => {
    const errors = validateListingForm({ ...valid, title: '', description: '', category: '', condition: '' }, []);
    expect(Object.keys(errors).sort()).toEqual(['category', 'condition', 'description', 'images', 'title']);
  });
});

describe('buildListingFormData', () => {
  it('sends only the fields that fit the chosen type and condition', () => {
    const donated = buildListingFormData({ ...valid, listingType: 'donate', condition: 'new' }, []);
    expect(donated.has('price')).toBe(false);
    expect(donated.has('usedValue')).toBe(false);
    const sold = buildListingFormData(valid, []);
    expect(sold.get('price')).toBe('450');
    expect(sold.get('usedUnit')).toBe('months');
  });
});