import { signal } from '@angular/core';

// Shared by ListInvite (approve/deny), Invitations (accept/reject), and
// ListMembers (remove) — code-review finding 12.2. Each of those screens
// runs an async action against one row out of a list (identified by an id)
// and needs to know, per row: is ITS action running right now, and did IT
// just fail with some message — without one row's spinner/error bleeding
// into another's.
//
// Only one id is ever "active" at a time here (a second start() call while
// another is still running just takes over), matching exactly what the
// duplicated code before this refactor already did — this isn't a new
// concurrency guarantee, just the existing behavior given a shared home.
export class IdKeyedActionState {
  private readonly activeId = signal<string | null>(null);
  private readonly errorsById = signal<Record<string, string>>({});

  isActive(id: string): boolean {
    return this.activeId() === id;
  }

  // For UI that disables everything else while any one action is running
  // (e.g. ListMembers' single shared ConfirmModal), rather than only the
  // row whose id is active.
  isAnyActive(): boolean {
    return this.activeId() !== null;
  }

  errorFor(id: string): string | null {
    return this.errorsById()[id] ?? null;
  }

  start(id: string): void {
    this.activeId.set(id);
    this.clearError(id);
  }

  finish(): void {
    this.activeId.set(null);
  }

  setError(id: string, message: string): void {
    this.errorsById.update((current) => ({ ...current, [id]: message }));
  }

  clearError(id: string): void {
    this.errorsById.update((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
}
