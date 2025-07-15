// src/integrations/supabase/__mocks__/client.ts
import { vi } from 'vitest';

// Simplified mock for stability testing
export const supabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'simplified-single' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'simplified-maybe' }, error: null }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }),
    insert: vi.fn().mockResolvedValue({ data: [{ id: 'simplified-insert' }], error: null }),
    update: vi.fn(() => ({ // update().eq()
      eq: vi.fn().mockResolvedValue({ data: [{ id: 'simplified-update' }], error: null }), // eq now terminal for simplicity
    })),
    delete: vi.fn(() => ({ // delete().eq()
      eq: vi.fn().mockResolvedValue({ data: [{ id: 'simplified-delete' }], error: null }), // eq now terminal for simplicity
    })),
    upsert: vi.fn().mockResolvedValue({ data: [{ id: 'simplified-upsert' }], error: null }),
  })),
  functions: {
    invoke: vi.fn().mockResolvedValue({ data: { invoked: true }, error: null }),
  },
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'simplified-user' } }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  },
  rpc: vi.fn().mockResolvedValue({ data: { rpcCalled: true }, error: null }),
};

// Export parts if tests need to directly manipulate these simplified mocks (less likely now)
export const mockSupabaseParts = {
    from: supabase.from,
    functionsInvoke: supabase.functions.invoke,
    authGetUser: supabase.auth.getUser,
    rpc: supabase.rpc,
};