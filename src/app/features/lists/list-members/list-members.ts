import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { AuthService } from '../../../core/auth.service';
import { List, ListChange, ListMember, ListService } from '../../../core/list.service';
import { ConfirmModal } from '../../../shared/confirm-modal/confirm-modal';

@Component({
  selector: 'app-list-members',
  imports: [RouterLink, ConfirmModal],
  templateUrl: './list-members.html',
  styleUrl: './list-members.css',
})
export class ListMembers implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly listService = inject(ListService);
  private readonly authService = inject(AuthService);

  protected readonly listId = this.route.snapshot.paramMap.get('id');
  private listChannel: RealtimeChannel | null = null;
  private membershipsChannel: RealtimeChannel | null = null;

  private readonly noAccessErrorMessage =
    'No se ha podido cargar esta lista. Puede que no exista o que no tengas acceso.';

  protected readonly list = signal<List | null>(null);
  protected readonly members = signal<ListMember[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly currentUserId = computed(() => this.authService.user()?.id ?? null);
  protected readonly isOwner = computed(
    () => this.list() !== null && this.list()?.owner_id === this.currentUserId(),
  );

  protected readonly removingMemberId = signal<string | null>(null);
  protected readonly isRemoving = signal(false);
  protected readonly removeError = signal<string | null>(null);
  protected readonly removingMember = computed(
    () => this.members().find((member) => member.user_id === this.removingMemberId()) ?? null,
  );

  constructor() {
    this.loadMembers();
    this.subscribeToListChanges();
    this.subscribeToOwnMembership();
  }

  ngOnDestroy(): void {
    if (this.listChannel) {
      this.listService.unsubscribeFromLists(this.listChannel);
      this.listChannel = null;
    }
    if (this.membershipsChannel) {
      this.listService.unsubscribeFromMemberships(this.membershipsChannel);
      this.membershipsChannel = null;
    }
  }

  private async loadMembers(): Promise<void> {
    if (!this.listId) {
      this.isLoading.set(false);
      this.loadError.set('No se ha podido cargar esta lista.');
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(null);

    await this.fetchAndApply();

    this.isLoading.set(false);
  }

  // Shared by the initial load and both channels' reconnect handlers, so a
  // full resync always applies the exact same rules — including the
  // membership check below — rather than three slightly different partial
  // refreshes drifting apart over time.
  private async fetchAndApply(): Promise<void> {
    if (!this.listId) {
      return;
    }

    const [listResult, membersResult] = await Promise.all([
      this.listService.getList(this.listId),
      this.listService.getListMembers(this.listId),
    ]);

    if (listResult.error || !listResult.data || membersResult.error) {
      this.list.set(null);
      this.loadError.set(
        membersResult.error && !listResult.error
          ? 'No se han podido cargar los miembros de esta lista. Inténtalo de nuevo.'
          : this.noAccessErrorMessage,
      );
      return;
    }

    const members = membersResult.data ?? [];
    const currentUserId = this.currentUserId();

    // getList()'s RLS also lets a pending invitee read the list's name
    // (has_pending_invite in schema.sql, for /invitations) — but memberships
    // RLS grants them nothing, so a non-member landing here directly would
    // otherwise just see an empty roster instead of a real "no access"
    // message. Same defensive pattern ListInvite already uses for its
    // owner-only check: verify true membership explicitly rather than
    // trusting how far RLS happens to reach on this particular query.
    if (!members.some((member) => member.user_id === currentUserId)) {
      this.list.set(null);
      this.loadError.set(this.noAccessErrorMessage);
      return;
    }

    this.loadError.set(null);
    this.list.set(listResult.data);
    this.members.set(members);
  }

  // Reacts to this list's own row changing (rename, ownership transfer) or
  // being deleted outright — same subscribeToList used by ListDetail, same
  // reasoning: filtered server-side to this one row, so no extra guard
  // needed. Without this, a member promoted to owner while looking at this
  // exact screen wouldn't see the "Expulsar" buttons appear until reload —
  // the same staleness already fixed for "Invitar a esta lista" on
  // /lists/:id.
  private subscribeToListChanges(): void {
    if (!this.listId) {
      return;
    }

    this.listChannel = this.listService.subscribeToList(
      this.listId,
      (change) => this.handleListChange(change),
      () => this.fetchAndApply(),
    );
  }

  private handleListChange(change: ListChange): void {
    if (change.eventType === 'DELETE') {
      this.list.set(null);
      this.loadError.set(this.noAccessErrorMessage);
      return;
    }

    this.list.set(change.item);
  }

  // Reacts to the current viewer's OWN access to this exact list being
  // revoked while they're looking at this page — either they left from
  // another device, or the owner just expelled them from a different tab.
  // Reuses ListService.subscribeToMyMemberships (built for the same gap on
  // /lists) rather than a new list_id-filtered "any membership on this
  // list" subscription: seeing OTHER members join/leave live here would be
  // a nice-to-have, but not a correctness issue — trying to expel someone
  // who already left just surfaces the existing "not a member" error from
  // remove_member below, the same way leave_list's own successor race
  // condition is handled.
  private subscribeToOwnMembership(): void {
    if (!this.listId) {
      return;
    }
    const listId = this.listId;

    this.membershipsChannel = this.listService.subscribeToMyMemberships(
      (change) => {
        if (change.listId !== listId) {
          return;
        }

        if (change.eventType === 'DELETE') {
          this.list.set(null);
          this.loadError.set(this.noAccessErrorMessage);
          return;
        }

        // An INSERT for this exact list while already viewing it shouldn't
        // normally happen, but resync defensively if it ever does.
        this.fetchAndApply();
      },
      () => this.fetchAndApply(),
    );
  }

  startRemoveMember(member: ListMember): void {
    this.removeError.set(null);
    this.removingMemberId.set(member.user_id);
  }

  cancelRemoveMember(): void {
    this.removingMemberId.set(null);
    this.removeError.set(null);
  }

  async confirmRemoveMember(member: ListMember): Promise<void> {
    if (!this.listId) {
      return;
    }

    this.isRemoving.set(true);
    this.removeError.set(null);

    const { error } = await this.listService.removeMember(this.listId, member.user_id);

    this.isRemoving.set(false);

    if (error) {
      this.removeError.set(this.toReadableRemoveError(error.message));
      return;
    }

    this.members.update((current) => current.filter((m) => m.user_id !== member.user_id));
    this.removingMemberId.set(null);
  }

  private toReadableRemoveError(message: string): string {
    const normalized = message.toLowerCase();

    if (normalized.includes('only the list owner can remove members')) {
      return 'Solo el propietario de la lista puede expulsar miembros.';
    }

    if (normalized.includes('use leave_list to remove yourself')) {
      return 'No puedes expulsarte a ti mismo. Usa la opción de abandonar la lista.';
    }

    if (normalized.includes('is not a member of this list')) {
      return 'Esa persona ya no es miembro de esta lista.';
    }

    return 'No se ha podido expulsar a este miembro. Inténtalo de nuevo.';
  }
}
