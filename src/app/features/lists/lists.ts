import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { AuthService } from '../../core/auth.service';
import { List, ListChange, ListService } from '../../core/list.service';
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
  private listsChannel: RealtimeChannel | null = null;
  private membershipsChannel: RealtimeChannel | null = null;

  protected readonly lists = signal<List[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly isCreating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly currentUserId = computed(() => this.authService.user()?.id ?? null);

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
  // immediate as every other realtime update on this screen.
  private subscribeToMemberships(): void {
    this.membershipsChannel = this.listService.subscribeToMyMemberships(
      (listId) => this.addNewlyJoinedList(listId),
      () => this.refreshLists(),
    );
  }

  private async addNewlyJoinedList(listId: string): Promise<void> {
    const { data, error } = await this.listService.getList(listId);

    if (error || !data) {
      return;
    }

    this.lists.update((current) =>
      this.listService.mergeListChange(current, { eventType: 'INSERT', item: data }),
    );
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
