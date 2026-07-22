import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// --- Mocks ---------------------------------------------------------------

const CURRENT_AUTH_ID = "current-user-auth-id";
const ASSIGNEE_SYSTEM_ID = "4c2fda0f-4859-48f3-a5a9-9fef7a65348b"; // Kate's system_users.id
const ASSIGNEE_AUTH_ID = "2ce7ac0b-34a3-456a-93d3-f1ddeaa70010"; // Kate's auth user_id

const rpcMock = vi.fn().mockResolvedValue({ error: null });

// Track which tables were queried so we can assert the lookup path.
const tableQueries: string[] = [];

function makeQueryBuilder(table: string) {
  tableQueries.push(table);
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    neq: () => builder,
    order: () => builder,
    limit: () => builder,
    update: () => builder,
    maybeSingle: async () => {
      if (table === "system_users") {
        return { data: { user_id: ASSIGNEE_AUTH_ID }, error: null };
      }
      return { data: null, error: null };
    },
    then: (resolve: any) => resolve({ data: [], error: null, count: 0 }),
  };
  return builder;
}

const channelMock = {
  on: function () { return this; },
  subscribe: function () { return this; },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeQueryBuilder(table),
    rpc: (...args: any[]) => rpcMock(...args),
    channel: () => channelMock,
    removeChannel: () => {},
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: CURRENT_AUTH_ID } }),
}));

vi.mock("@/lib/notificationSound", () => ({
  playNotificationPing: () => {},
}));

// -------------------------------------------------------------------------

import { useTaskNotifications } from "./useTaskNotifications";

describe("useTaskNotifications.createNotification", () => {
  beforeEach(() => {
    rpcMock.mockClear();
    tableQueries.length = 0;
  });

  it("resolves the assignee's auth id via system_users.user_id and fires the RPC", async () => {
    const { result } = renderHook(() => useTaskNotifications());

    // Allow the mount-effect fetchNotifications to settle.
    await new Promise((r) => setTimeout(r, 0));

    await result.current.createNotification({
      taskTitle: "Test Test",
      taskId: "task-123",
      customerName: "Acme",
      assigneeName: "Kate Campbell",
      assigneeSystemUserId: ASSIGNEE_SYSTEM_ID,
    });

    const taskAssignedCall = rpcMock.mock.calls.find(
      ([fn, payload]: any[]) => fn === "create_task_notification" && payload?.p_type === "task_assigned",
    );
    expect(taskAssignedCall).toBeTruthy();
    const [, payload] = taskAssignedCall!;
    expect(payload.p_recipient_id).toBe(ASSIGNEE_AUTH_ID);
    expect(payload.p_recipient_id).not.toBe(CURRENT_AUTH_ID);
    expect(payload.p_recipient_id).not.toBe(ASSIGNEE_SYSTEM_ID);
    expect(payload.p_task_id).toBe("task-123");
    expect(payload.p_message).toBe("Test Test");

    expect(tableQueries).toContain("system_users");
    const sysIdx = tableQueries.indexOf("system_users");
    const compIdx = tableQueries.indexOf("comprehensive_users");
    if (compIdx !== -1) {
      expect(sysIdx).toBeLessThan(compIdx);
    }
  });

  it("does not notify when the resolved auth id is the current user", async () => {
    rpcMock.mockClear();
    tableQueries.length = 0;

    const { result } = renderHook(() => useTaskNotifications());
    await new Promise((r) => setTimeout(r, 0));

    await result.current.createNotification({
      taskTitle: "Self assignment",
      taskId: "task-self",
      // No assigneeSystemUserId -> recipient stays as current user -> no notification.
    });

    const taskAssignedCalls = rpcMock.mock.calls.filter(
      ([fn, payload]: any[]) => fn === "create_task_notification" && payload?.p_type === "task_assigned",
    );
    expect(taskAssignedCalls).toHaveLength(0);
  });
});
