import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MessageItem } from './MessageItem';

// Mock auth + permissions for different roles
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'me-123',
      email: 'kenneth.pote@thevateam.co.uk',
      user_metadata: { full_name: 'Kenneth Pote' },
    },
  }),
}));

const isSuperAdminMock = vi.fn(() => false);
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ get isSuperAdmin() { return isSuperAdminMock(); } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: 'Kenneth Pote', error: null }),
  },
}));

vi.mock('./MessageAttachments', () => ({ MessageAttachments: () => null }));
vi.mock('./MessageReactions', () => ({ MessageReactions: () => null }));

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function makeMessage(overrides: any = {}) {
  return {
    id: 'm1',
    room_id: 'r1',
    sender_id: 'other-999',
    content: 'Hello team',
    created_at: new Date().toISOString(),
    sender: { id: 'other-999', name: 'Joe Campbell' },
    reads: [],
    deliveries: [],
    attachments: [],
    ...overrides,
  };
}

describe('MessageItem — never renders email addresses', () => {
  it("hides email for another user's message (operator view)", () => {
    isSuperAdminMock.mockReturnValue(false);
    const { container } = render(
      <MessageItem message={makeMessage() as any} showSender={true} />
    );
    expect(container.textContent || '').not.toMatch(EMAIL_RE);
    expect(container.textContent).toContain('Joe Campbell');
  });

  it('hides email for own message even when sender.name missing (super-admin view)', () => {
    isSuperAdminMock.mockReturnValue(true);
    const { container } = render(
      <MessageItem
        message={makeMessage({ sender_id: 'me-123', sender: { id: 'me-123', name: 'Kenneth Pote' } }) as any}
        showSender={true}
      />
    );
    expect(container.textContent || '').not.toMatch(EMAIL_RE);
    expect(container.textContent).toContain('Kenneth Pote');
  });

  it('falls back to "User" rather than an email when sender.name is empty', () => {
    isSuperAdminMock.mockReturnValue(false);
    const { container } = render(
      <MessageItem
        message={makeMessage({ sender: { id: 'other-999', name: '' } }) as any}
        showSender={true}
      />
    );
    expect(container.textContent || '').not.toMatch(EMAIL_RE);
  });

  it('renders read-receipt tooltip names without exposing emails', () => {
    isSuperAdminMock.mockReturnValue(false);
    const msg = makeMessage({
      sender_id: 'me-123',
      sender: { id: 'me-123', name: 'Kenneth Pote' },
      reads: [{ user_id: 'u2', read_at: new Date().toISOString(), reader_name: 'Tara Egan' }],
      deliveries: [{ user_id: 'u3', delivered_at: new Date().toISOString(), recipient_name: 'Rowena Harrison' }],
    });
    const { container } = render(<MessageItem message={msg as any} showSender={true} />);
    expect(container.textContent || '').not.toMatch(EMAIL_RE);
  });
});
