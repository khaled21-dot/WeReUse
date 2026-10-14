import { describe, expect, it } from 'vitest';
import {
  passwordStrength,
  validateConfirmPassword,
  validateEmail,
  validateIdFile,
  normalizePhone,
  validateName,
  validatePassword,
  validatePhone,
  validateRegNumber,
  validateRegisterForm,
} from '../utils/validators';

describe('client validators', () => {
  it('validates names', () => {
    expect(validateName('Khaled Mahmud Nahid')).toBe('');
    expect(validateName("Md. O'Neil-Rahman")).toBe('');
    expect(validateName('')).toMatch(/required/);
    expect(validateName('A')).toMatch(/short/);
    expect(validateName('R2D2 <script>')).toMatch(/letters/);
  });

  it('validates emails', () => {
    expect(validateEmail('a@b.co')).toBe('');
    expect(validateEmail('nope')).toMatch(/valid/);
    expect(validateEmail('  ')).toMatch(/required/);
  });

  it('validates passwords like the server', () => {
    expect(validatePassword('Passw0rdOK')).toBe('');
    expect(validatePassword('short1')).toMatch(/8 characters/);
    expect(validatePassword('onlyletters')).toMatch(/letter and one number/);
    expect(validatePassword('12345678')).toMatch(/letter and one number/);
    expect(validateConfirmPassword('x', 'y')).toMatch(/do not match/);
    expect(validateConfirmPassword('y', 'y')).toBe('');
  });

  it('validates registration numbers case-insensitively', () => {
    expect(validateRegNumber('241-35-032')).toBe('');
    expect(validateRegNumber('abc/123-x')).toBe('');
    expect(validateRegNumber('ab')).toMatch(/5-25/);
    expect(validateRegNumber('!!!!!!')).toMatch(/5-25/);
  });

  it('validates and normalises Bangladeshi mobile numbers', () => {
    expect(validatePhone('01712345678')).toBe('');
    expect(validatePhone('+8801712345678')).toBe('');
    expect(validatePhone(' 880 1712-345678 ')).toBe('');
    expect(normalizePhone('+880 1712-345678')).toBe('01712345678');
    expect(validatePhone('')).toMatch(/required/);
    expect(validatePhone('12345')).toMatch(/valid mobile/);
    expect(validatePhone('01212345678')).toMatch(/valid mobile/);
    expect(validatePhone('0171234567')).toMatch(/valid mobile/);
  });

  it('validates the ID photo', () => {
    const f = (type, size) => ({ type, size });
    expect(validateIdFile(null)).toMatch(/upload/);
    expect(validateIdFile(f('image/png', 1000))).toBe('');
    expect(validateIdFile(f('image/jpeg', 1000))).toBe('');
    expect(validateIdFile(f('image/gif', 1000))).toMatch(/JPG or PNG/);
    expect(validateIdFile(f('application/pdf', 1000))).toMatch(/JPG or PNG/);
    expect(validateIdFile(f('image/png', 6 * 1024 * 1024))).toMatch(/too large/);
    expect(validateIdFile(f('image/png', 0))).toMatch(/empty/);
  });

  it('collects every register error at once', () => {
    const errors = validateRegisterForm(
      { name: '', email: 'x', universityRegNumber: '', department: '', batch: '', password: 'a', confirmPassword: 'b' },
      null
    );
    expect(Object.keys(errors).sort()).toEqual(
      ['confirmPassword', 'email', 'idCard', 'name', 'password', 'universityRegNumber'].sort()
    );
  });

  it('scores password strength from 0 to 4', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('Passw0rd')).toBeGreaterThanOrEqual(3);
    expect(passwordStrength('Passw0rd!Long12')).toBe(4);
  });
});
