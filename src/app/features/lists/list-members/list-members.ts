import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { AuthService } from '../../../core/auth.service';
import { IdKeyedActionState } from '../../../core/id-keyed-action-state';
import {
  List,
  ListChange,
  ListMember,
  ListMembershipChange,
  ListService,
} from '../../../core/list.service';
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
  private listMembersChannel: RealtimeChannel | null = null;

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
  protected readonly removeAction = new IdKeyedActionState();
  protected readonly removingMember = computed(
    () => this.members().find((member) => member.user_id === this.removingMemberId()) ?? null,
  );

  constructor() {
    this.loadMembers();
    this.subscribeToListChanges();
    this.subscribeToOwnMembership();
    this.subscribeToListMembersChanges();
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
    if (this.listMembersChannel) {
      this.listService.unsubscribeFromMemberships(this.listMembersChannel);
      this.listMembersChannel = null;
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
  // Kept separate from subscribeToListMembersChanges below (rather than
  // having that one also special-case "is this row about me?"): this one is
  // about MY page access (loadError/list), that one is about the roster
  // contents (members()) — different concerns, even though both ultimately
  // read the same memberships table.
  //
  // DELETE events carry no listId (see the "DELETE payload" reminder in
  // CLAUDE.md's "Key domain reminders"), so there's no way to check "was
  // this about my current list" up front the way the INSERT branch below
  // still can — every DELETE on any of my memberships resyncs via
  // fetchAndApply(), which already re-derives "am I still a member of THIS
  // list" itself (see its own membership check) and only shows the
  // no-access error when that's genuinely true, so an unrelated DELETE
  // elsewhere just costs a harmless extra fetch.
  private subscribeToOwnMembership(): void {
    if (!this.listId) {
      return;
    }
    const listId = this.listId;

    this.membershipsChannel = this.listService.subscribeToMyMemberships(
      (change) => {
        if (change.eventType === 'DELETE') {
          this.fetchAndApply();
          return;
        }

        // An INSERT for this exact list while already viewing it shouldn't
        // normally happen, but resync defensively if it ever does.
        if (change.listId !== listId) {
          return;
        }
        this.fetchAndApply();
      },
      () => this.fetchAndApply(),
    );
  }

  // Any join or removal on this list, from anyone, so the roster stays live
  // while this screen is open — the one piece of Realtime deliberately left
  // out when this screen first shipped (seeing it wasn't a correctness
  // issue, just staleness), added now for consistency with how every other
  // list-scoped view (items, pending requests) already behaves live.
  // list_id is a plain column, so this filters server-side exactly like
  // subscribeToListRequests/subscribeToItems already do.
  private subscribeToListMembersChanges(): void {
    if (!this.listId) {
      return;
    }
    const listId = this.listId;

    this.listMembersChannel = this.listService.subscribeToListMembers(
      listId,
      (change) => void this.handleMembershipChange(listId, change),
      () => this.fetchAndApply(),
    );
  }

  // A postgres_changes INSERT payload only ever carries the memberships
  // row's own columns — never the profile:profiles(...) embed, which is a
  // PostgREST-time join Realtime doesn't know about — so a new member needs
  // a targeted by-id refetch via getListMember before it can be shown here,
  // same pattern as fetchPendingInvitationById in InvitationService.
  //
  // DELETE carries no userId at all (see the "DELETE payload" reminder in
  // CLAUDE.md's "Key domain reminders"), so there's no id to remove by — and
  // since Realtime doesn't even filter DELETE events server-side, this
  // channel receives every DELETE on the whole memberships table, not just
  // this list's. A full resync via fetchAndApply() is the only reliable
  // option, same as the reconnect path already uses.
  private async handleMembershipChange(
    listId: string,
    change: ListMembershipChange,
  ): Promise<void> {
    if (change.eventType === 'DELETE') {
      await this.fetchAndApply();
      return;
    }

    const { data, error } = await this.listService.getListMember(listId, change.userId);

    if (error || !data) {
      return;
    }

    this.members.update((current) => {
      if (current.some((member) => member.user_id === data.user_id)) {
        return current;
      }
      // A brand-new member's joined_at is always later than everyone
      // already loaded, so appending keeps the same joined_at-ascending
      // order getListMembers() already loaded without re-sorting.
      return [...current, data];
    });
  }

  startRemoveMember(member: ListMember): void {
    this.removeAction.clearError(member.user_id);
    this.removingMemberId.set(member.user_id);
  }

  cancelRemoveMember(): void {
    const id = this.removingMemberId();
    this.removingMemberId.set(null);
    if (id) {
      this.removeAction.clearError(id);
    }
  }

  async confirmRemoveMember(member: ListMember): Promise<void> {
    if (!this.listId) {
      return;
    }

    this.removeAction.start(member.user_id);

    const { error } = await this.listService.removeMember(this.listId, member.user_id);

    this.removeAction.finish();

    if (error) {
      this.removeAction.setError(member.user_id, this.toReadableRemoveError(error.message));
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
