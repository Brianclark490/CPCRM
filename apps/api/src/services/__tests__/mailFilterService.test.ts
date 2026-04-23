import { describe, it, expect } from 'vitest';
import {
  classifyMessage,
  type FilterableMessage,
  type FilterContext,
} from '../mailFilterService.js';

const ctx: FilterContext = { ownerDomain: 'cpcrm.com' };

function msg(partial: Partial<FilterableMessage>): FilterableMessage {
  return {
    from: { email: 'ext@acme.com' },
    to: [{ email: 'owner@cpcrm.com' }],
    ...partial,
  };
}

describe('classifyMessage', () => {
  it('processes an external prospect email', () => {
    expect(classifyMessage(msg({}), ctx).decision).toBe('processed');
  });

  it('skips an internal-to-org thread', () => {
    const m = msg({
      from: { email: 'colleague@cpcrm.com' },
      to: [{ email: 'owner@cpcrm.com' }],
    });
    expect(classifyMessage(m, ctx).decision).toBe('skipped_internal');
  });

  it('skips bulk senders with a List-Unsubscribe header', () => {
    const m = msg({ headers: { 'List-Unsubscribe': '<https://x>' } });
    expect(classifyMessage(m, ctx).decision).toBe('skipped_bulk');
  });

  it('skips automated no-reply senders', () => {
    const m = msg({ from: { email: 'no-reply@vendor.com' } });
    expect(classifyMessage(m, ctx).decision).toBe('skipped_automated');
  });

  it('skips calendar invites', () => {
    const m = msg({ hasCalendarAttachment: true });
    expect(classifyMessage(m, ctx).decision).toBe('skipped_automated');
  });

  it('skips Precedence: bulk', () => {
    const m = msg({ headers: { Precedence: 'bulk' } });
    expect(classifyMessage(m, ctx).decision).toBe('skipped_bulk');
  });

  it('skips Auto-Submitted unless value is "no"', () => {
    const auto = msg({ headers: { 'Auto-Submitted': 'auto-generated' } });
    expect(classifyMessage(auto, ctx).decision).toBe('skipped_automated');
    const human = msg({ headers: { 'Auto-Submitted': 'no' } });
    expect(classifyMessage(human, ctx).decision).toBe('processed');
  });

  it('upgrades an internal thread when a tracked contact is copied in', () => {
    const m = msg({
      from: { email: 'colleague@cpcrm.com' },
      to: [{ email: 'owner@cpcrm.com' }, { email: 'buyer@acme.com' }],
    });
    const result = classifyMessage(m, {
      ...ctx,
      mentionedContactEmails: ['buyer@acme.com'],
    });
    expect(result.decision).toBe('processed');
  });
});
