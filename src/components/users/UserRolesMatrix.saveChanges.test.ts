import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolated logic test for saveChanges empty-result / network-failure handling.
// Mirrors the branching in src/components/users/UserRolesMatrix.tsx#saveChanges.

type Outcome = 'ok' | 'noop' | 'denied';
interface RpcResult { outcome: Outcome; outcome_code: string; outcome_message?: string }

async function runSave(
  pending: Map<string, { granted?: boolean; scope?: string }>,
  rpc: (args: any) => Promise<{ data: RpcResult | RpcResult[] | null; error: any }>,
): Promise<{ cleared: string[]; kept: string[]; denials: number; technicalFailure: boolean }> {
  const confirmedClearKeys = new Set<string>();
  const denials: string[] = [];
  let technicalFailure = false;
  try {
    for (const [key] of pending) {
      const { data, error } = await rpc({ p_permission_id: 'x', p_role: 'Supervisor', p_granted: true, p_scope: 'all' });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw new Error('Permission update returned no result');
      if (result.outcome === 'ok' || result.outcome === 'noop') confirmedClearKeys.add(key);
      else denials.push(key);
    }
  } catch { technicalFailure = true; }

  return {
    cleared: [...confirmedClearKeys],
    kept: [...pending.keys()].filter(k => !confirmedClearKeys.has(k)),
    denials: denials.length,
    technicalFailure,
  };
}

describe('UserRolesMatrix.saveChanges pending-change preservation', () => {
  let pending: Map<string, any>;
  beforeEach(() => {
    pending = new Map([['pA:Supervisor', {}], ['pB:Supervisor', {}]]);
  });

  it('preserves pending changes on empty RPC response (technical failure)', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: null });
    const r = await runSave(pending, rpc);
    expect(r.technicalFailure).toBe(true);
    expect(r.cleared).toHaveLength(0);
    expect(r.kept).toEqual(['pA:Supervisor', 'pB:Supervisor']);
  });

  it('preserves pending changes on network failure', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network down'));
    const r = await runSave(pending, rpc);
    expect(r.technicalFailure).toBe(true);
    expect(r.kept).toHaveLength(2);
  });

  it('clears only ok/noop-confirmed keys; denials remain pending', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { outcome: 'ok', outcome_code: 'ok_updated' }, error: null })
      .mockResolvedValueOnce({ data: { outcome: 'denied', outcome_code: 'denied_admin_ceiling' }, error: null });
    const r = await runSave(pending, rpc);
    expect(r.technicalFailure).toBe(false);
    expect(r.cleared).toEqual(['pA:Supervisor']);
    expect(r.kept).toEqual(['pB:Supervisor']);
    expect(r.denials).toBe(1);
  });
});
