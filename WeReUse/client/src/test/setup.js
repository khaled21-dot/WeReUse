import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom does not implement these browser APIs
if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:mock-url');
if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
window.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();
