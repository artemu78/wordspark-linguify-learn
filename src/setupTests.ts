import { vi } from 'vitest';

// global.jest = vi as any; // Removed this polyfill to simplify the environment

// Mock Supabase client and other utilities globally using vi.mock for Vitest
// Ensure these paths are correct relative to your project structure
vi.mock('@/integrations/supabase/client', () => import('@/integrations/supabase/__mocks__/client'));
vi.mock('@/lib/geminiUtils', () => import('@/lib/__mocks__/geminiUtils'));

// Mock ResizeObserver for Radix UI components in JSDOM
const MockResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
// @ts-ignore
global.ResizeObserver = MockResizeObserver;

// Polyfill for PointerEvent methods not available in JSDOM, used by Radix
if (typeof window !== 'undefined' && typeof HTMLElement !== 'undefined') { // Ensure HTMLElement is defined
    if (!HTMLElement.prototype.setPointerCapture) {
        HTMLElement.prototype.setPointerCapture = vi.fn();
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = vi.fn();
    }
    if (!HTMLElement.prototype.hasPointerCapture) {
        HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
    }
    // Mock scrollIntoView for Radix Select & other components
    if (!window.Element.prototype.scrollIntoView) {
        window.Element.prototype.scrollIntoView = vi.fn();
    }
    if (!window.HTMLElement.prototype.scrollIntoView) { // Just in case
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
    }

    // Polyfill for PointerEvent methods not available in JSDOM, used by Radix
    if (!window.HTMLElement.prototype.setPointerCapture) {
        window.HTMLElement.prototype.setPointerCapture = vi.fn();
    }
    if (!window.HTMLElement.prototype.releasePointerCapture) {
        window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    }
    if (!window.HTMLElement.prototype.hasPointerCapture) {
        window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
    }
}


// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// fetchMock from 'jest-fetch-mock' was removed as it caused issues with Vitest's environment.
// If fetch mocking is needed, it should be done using vi.spyOn(global, 'fetch') or vi.fn().
