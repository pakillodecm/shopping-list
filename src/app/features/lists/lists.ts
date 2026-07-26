import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { AuthService } from '../../core/auth.service';
import { InvitationService, PendingInvitation } from '../../core/invitation.service';
import { List, ListChange, ListService } from '../../core/list.service';
import { ThemeService } from '../../core/theme.service';
import { ConfirmModal } from '../../shared/confirm-modal/confirm-modal';
import { LogoutButton } from '../auth/logout-button/logout-button';
import { Autofocus } from './autofocus.directive';

@Component({
  selector: 'app-lists',
  imports: [LogoutButton, Autofocus, ConfirmModal, RouterLink],
  templateUrl: './lists.html',
  styleUrl: './lists.css',
})
export class Lists implements OnDestroy {
  private readonly listService = inject(ListService);
  private readonly authService = inject(AuthService);
  private readonly invitationService = inject(InvitationService);
  private readonly themeService = inject(ThemeService);
  private listsChannel: RealtimeChannel | null = null;
  private membershipsChannel: RealtimeChannel | null = null;
  private invitationsChannel: RealtimeChannel | null = null;

  protected readonly lists = signal<List[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  // Own subscription rather than sharing the one InvitationsComponent uses:
  // the two are separate component instances on separate routes (never
  // mounted at once in the same tab), so there's no live instance to share
  // without lifting this into app-level singleton state — a bigger change
  // than a badge counter justifies. Keeps the same per-screen
  // subscribe/unsubscribe pattern already used everywhere else (Lists,
  // ListDetail, ListInvite, Invitations). The count is derived from the
  // same array + mergeMyInvitationsChange the /invitations screen uses,
  // rather than a hand-rolled increment/decrement counter, so it stays
  // correct across inserts, deletes and reconnect refetches for free.
  protected readonly pendingInvitations = signal<PendingInvitation[]>([]);
  protected readonly pendingInvitationsCount = computed(() => this.pendingInvitations().length);

  protected readonly isCreating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly currentUserId = computed(() => this.authService.user()?.id ?? null);

  protected readonly isDarkTheme = computed(() => this.themeService.theme() === 'dark');

  protected readonly editingListId = signal<string | null>(null);
  protected readonly isRenaming = signal(false);
  protected readonly renameError = signal<string | null>(null);

  protected readonly deletingListId = signal<string | null>(null);
  protected readonly isDeleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly deletingList = computed(
    () => this.lists().find((list) => list.id === this.deletingListId()) ?? null,
  );

  constructor() {
    this.loadLists();
    this.subscribeToLists();
    this.subscribeToMemberships();
    this.loadPendingInvitationsCount();
    this.subscribeToInvitationsCount();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  ngOnDestroy(): void {
    if (this.listsChannel) {
      this.listService.unsubscribeFromLists(this.listsChannel);
      this.listsChannel = null;
    }
    if (this.membershipsChannel) {
      this.listService.unsubscribeFromMemberships(this.membershipsChannel);
      this.membershipsChannel = null;
    }
    if (this.invitationsChannel) {
      this.invitationService.unsubscribeFromMembershipRequests(this.invitationsChannel);
      this.invitationsChannel = null;
    }
  }

  private async loadPendingInvitationsCount(): Promise<void> {
    const { data, error } = await this.invitationService.getMyPendingInvitations();

    if (error) {
      console.warn('[loadPendingInvitationsCount] failed to refresh:', error);
      return;
    }

    this.pendingInvitations.set(data ?? []);
  }

  private subscribeToInvitationsCount(): void {
    this.invitationsChannel = this.invitationService.subscribeToMyInvitations(
      (change) => {
        this.pendingInvitations.update((current) =>
          this.invitationService.mergeMyInvitationsChange(current, change),
        );
      },
      () => this.loadPendingInvitationsCount(),
    );
  }

  private subscribeToLists(): void {
    this.listsChannel = this.listService.subscribeToLists(
      (change) => {
        if (!this.isRealMembershipChange(change)) {
          return;
        }
        this.lists.update((current) => this.listService.mergeListChange(current, change));
      },
      () => this.refreshLists(),
    );
  }

  // Being approved into a list (join request approved, invite accepted)
  // never touches the `lists` row itself — it's an INSERT on `memberships` —
  // so subscribeToLists() above never sees it. This fetches just that one
  // list and merges it in, instead of a full refetch, to keep it as
  // immediate as every other realtime update on this screen. Losing access
  // (leave_list) is symmetrically a DELETE on `memberships` with no
  // corresponding change on `lists` either — see subscribeToMyMemberships in
  // ListService for why both need their own handling here. A DELETE payload
  // is just a listId, so it's removed directly by id rather than through
  // mergeListChange (which expects a full List row, not a Membership).
  private subscribeToMemberships(): void {
    this.membershipsChannel = this.listService.subscribeToMyMemberships(
      (change) => {
        if (change.eventType === 'INSERT') {
          this.addNewlyJoinedList(change.listId);
          return;
        }
        this.removeLeftList(change.listId);
      },
      () => this.refreshLists(),
    );
  }

  private async addNewlyJoinedList(listId: string): Promise<void> {
    const { data, error } = await this.listService.getList(listId);

    if (error || !data) {
      console.warn('[addNewlyJoinedList] failed to refresh:', error);
      return;
    }

    this.lists.update((current) =>
      this.listService.mergeListChange(current, { eventType: 'INSERT', item: data }),
    );
  }

  private removeLeftList(listId: string): void {
    this.lists.update((current) => current.filter((list) => list.id !== listId));
  }

  // The `lists` RLS policy also grants SELECT to users with a pending
  // INVITE (see has_pending_invite in schema.sql), for the /invitations
  // screen. Since this component subscribes with no filter (a "owner or
  // member" join can't be expressed as a postgres_changes filter — see
  // schema.sql), an owner editing a list would broadcast the change to
  // everyone with a pending invite to it too. A DELETE is always safe to
  // apply; an INSERT/UPDATE is only trusted if it's a list this user
  // already has (real membership, confirmed via getMyLists) or genuinely
  // owns — anything else is a list this user has only been invited to, not
  // joined, and must stay off this screen until accepted.
  private isRealMembershipChange(change: ListChange): boolean {
    if (change.eventType === 'DELETE') {
      return true;
    }

    return (
      change.item.owner_id === this.currentUserId() ||
      this.lists().some((list) => list.id === change.item.id)
    );
  }

  private async refreshLists(): Promise<void> {
    const { data, error } = await this.listService.getMyLists();

    if (error) {
      console.warn('[refreshLists] failed to refresh:', error);
      return;
    }

    this.lists.set(data ?? []);
  }

  private async loadLists(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    const { data, error } = await this.listService.getMyLists();

    this.isLoading.set(false);

    if (error) {
      this.loadError.set('No se han podido cargar tus listas. Inténtalo de nuevo.');
      return;
    }

    this.lists.set(data ?? []);
  }

  async submitCreate(event: SubmitEvent, nameInput: HTMLInputElement): Promise<void> {
    event.preventDefault();

    const name = nameInput.value.trim();
    if (!name) {
      this.createError.set('El nombre no puede estar vacío.');
      return;
    }

    this.isCreating.set(true);
    this.createError.set(null);

    const { data, error } = await this.listService.createList(name);

    this.isCreating.set(false);

    if (error) {
      this.createError.set('No se ha podido crear la lista. Inténtalo de nuevo.');
      return;
    }

    if (data) {
      this.lists.update((current) => [...current, data]);
    }
    nameInput.value = '';
  }

  startRename(listId: string): void {
    this.deletingListId.set(null);
    this.renameError.set(null);
    this.editingListId.set(listId);
  }

  cancelRename(): void {
    this.editingListId.set(null);
    this.renameError.set(null);
  }

  async submitRename(event: SubmitEvent, list: List, nameInput: HTMLInputElement): Promise<void> {
    event.preventDefault();

    const newName = nameInput.value.trim();
    if (!newName) {
      this.renameError.set('El nombre no puede estar vacío.');
      return;
    }

    this.isRenaming.set(true);
    this.renameError.set(null);

    const { data, error } = await this.listService.renameList(list.id, newName);

    this.isRenaming.set(false);

    if (error) {
      this.renameError.set('No se ha podido renombrar la lista. Inténtalo de nuevo.');
      return;
    }

    if (data) {
      this.lists.update((current) => current.map((l) => (l.id === data.id ? data : l)));
    }
    this.editingListId.set(null);
  }

  startDelete(listId: string): void {
    this.editingListId.set(null);
    this.deleteError.set(null);
    this.deletingListId.set(listId);
  }

  cancelDelete(): void {
    this.deletingListId.set(null);
    this.deleteError.set(null);
  }

  async confirmDelete(list: List): Promise<void> {
    this.isDeleting.set(true);
    this.deleteError.set(null);

    const { error } = await this.listService.deleteList(list.id);

    this.isDeleting.set(false);

    if (error) {
      this.deleteError.set('No se ha podido eliminar la lista. Inténtalo de nuevo.');
      return;
    }

    this.lists.update((current) => current.filter((l) => l.id !== list.id));
    this.deletingListId.set(null);
  }
}
