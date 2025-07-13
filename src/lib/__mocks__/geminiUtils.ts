// src/lib/__mocks__/geminiUtils.ts
import { vi } from 'vitest';

export const generateStoryFromWords = vi.fn();

export class GeminiGenerationError extends Error {
  details: any;
  constructor(message: string, details?: any) {
    super(message);
    this.name = "GeminiGenerationError";
    this.details = details;
  }
}

// Add mocks for any other functions or classes from geminiUtils.ts
// that are used in the code you're testing.
