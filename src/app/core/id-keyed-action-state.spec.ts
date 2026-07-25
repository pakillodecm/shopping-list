import { describe, expect, it } from 'vitest';

import { IdKeyedActionState } from './id-keyed-action-state';

describe('IdKeyedActionState', () => {
  it('is not active and has no error for any id before anything starts', () => {
    const state = new IdKeyedActionState();

    expect(state.isActive('a')).toBe(false);
    expect(state.isAnyActive()).toBe(false);
    expect(state.errorFor('a')).toBeNull();
  });

  it('marks only the started id as active', () => {
    const state = new IdKeyedActionState();

    state.start('a');

    expect(state.isActive('a')).toBe(true);
    expect(state.isActive('b')).toBe(false);
    expect(state.isAnyActive()).toBe(true);
  });

  it('starting a new id takes over from the previous one (matches prior duplicated behavior)', () => {
    const state = new IdKeyedActionState();

    state.start('a');
    state.start('b');

    expect(state.isActive('a')).toBe(false);
    expect(state.isActive('b')).toBe(true);
  });

  it('finish() clears the active id', () => {
    const state = new IdKeyedActionState();
    state.start('a');

    state.finish();

    expect(state.isActive('a')).toBe(false);
    expect(state.isAnyActive()).toBe(false);
  });

  it('setError records an error keyed by id without affecting other ids', () => {
    const state = new IdKeyedActionState();

    state.setError('a', 'fallo en a');

    expect(state.errorFor('a')).toBe('fallo en a');
    expect(state.errorFor('b')).toBeNull();
  });

  it('clearError removes only that id error', () => {
    const state = new IdKeyedActionState();
    state.setError('a', 'fallo en a');
    state.setError('b', 'fallo en b');

    state.clearError('a');

    expect(state.errorFor('a')).toBeNull();
    expect(state.errorFor('b')).toBe('fallo en b');
  });

  it('start() clears any existing error for that id', () => {
    const state = new IdKeyedActionState();
    state.setError('a', 'fallo previo');

    state.start('a');

    expect(state.errorFor('a')).toBeNull();
  });
});
