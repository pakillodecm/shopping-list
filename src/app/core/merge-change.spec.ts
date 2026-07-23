import { describe, expect, it } from 'vitest';

import { mergeChange } from './merge-change';

interface TestRecord {
  id: string;
  modified_at: string;
  label: string;
}

function makeRecord(overrides: Partial<TestRecord> = {}): TestRecord {
  return {
    id: 'rec-1',
    modified_at: '2026-01-01T00:00:00.000Z',
    label: 'A',
    ...overrides,
  };
}

describe('mergeChange', () => {
  it('inserts a new item when it does not exist in the current array', () => {
    const existing = makeRecord({ id: 'rec-1' });
    const incoming = makeRecord({ id: 'rec-2', label: 'B' });

    const result = mergeChange([existing], { eventType: 'INSERT', item: incoming });

    expect(result).toEqual([existing, incoming]);
  });

  it('replaces the existing item when the incoming modified_at is more recent', () => {
    const existing = makeRecord({ modified_at: '2026-01-01T00:00:00.000Z', label: 'old' });
    const incoming = makeRecord({ modified_at: '2026-01-02T00:00:00.000Z', label: 'new' });

    const result = mergeChange([existing], { eventType: 'UPDATE', item: incoming });

    expect(result).toEqual([incoming]);
  });

  it('ignores the incoming update when its modified_at is older than the current item', () => {
    const existing = makeRecord({ modified_at: '2026-01-02T00:00:00.000Z', label: 'newer' });
    const incoming = makeRecord({ modified_at: '2026-01-01T00:00:00.000Z', label: 'stale' });

    const result = mergeChange([existing], { eventType: 'UPDATE', item: incoming });

    expect(result).toEqual([existing]);
  });

  it('applies the incoming update when modified_at is exactly equal (tie)', () => {
    const existing = makeRecord({ modified_at: '2026-01-01T00:00:00.000Z', label: 'old' });
    const incoming = makeRecord({ modified_at: '2026-01-01T00:00:00.000Z', label: 'new' });

    const result = mergeChange([existing], { eventType: 'UPDATE', item: incoming });

    expect(result).toEqual([incoming]);
  });

  it('removes the item matching the given id on DELETE, regardless of modified_at', () => {
    const toKeep = makeRecord({ id: 'rec-2', label: 'keep' });
    const toDelete = makeRecord({ id: 'rec-1', modified_at: '2099-01-01T00:00:00.000Z' });
    const deleteChange = makeRecord({ id: 'rec-1', modified_at: '2000-01-01T00:00:00.000Z' });

    const result = mergeChange([toDelete, toKeep], { eventType: 'DELETE', item: deleteChange });

    expect(result).toEqual([toKeep]);
  });

  it('does not mutate the array passed in', () => {
    const existing = makeRecord();
    const current = [existing];

    mergeChange(current, {
      eventType: 'UPDATE',
      item: makeRecord({ modified_at: '2026-01-02T00:00:00.000Z', label: 'new' }),
    });

    expect(current).toEqual([existing]);
  });
});
