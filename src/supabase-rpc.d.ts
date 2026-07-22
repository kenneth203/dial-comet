// Global type augmentation for Supabase RPC calls
// Many DB functions exist in the database but aren't yet in the auto-generated types.ts
// This declaration allows any RPC function name to be used without type errors.
// Remove this file once all functions are registered and types regenerate.

import type { SupabaseClient } from '@supabase/supabase-js';

declare module '@supabase/supabase-js' {
  interface SupabaseClient {
    rpc(fn: string, params?: Record<string, any>, options?: any): any;
  }
}
