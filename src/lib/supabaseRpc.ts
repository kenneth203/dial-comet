// Type augmentation to allow unregistered RPC function names
// This is needed because the auto-generated types.ts doesn't include all DB functions yet
// Once all functions are registered and types regenerate, this file can be removed
import { supabase } from '@/integrations/supabase/client';

type AnyRpc = {
  rpc(fn: string, params?: Record<string, any>): any;
};

export const db = supabase as typeof supabase & AnyRpc;

export function asPromise<T>(query: PromiseLike<T>): Promise<T> {
  return Promise.resolve(query);
}
