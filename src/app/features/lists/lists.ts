import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { AuthService } from '../../core/auth.service';
import { List, ListService } from '../../core/list.service';
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
  }

  ngOnDestroy(): void {
    if (this.listsChannel) {
      this.listService.unsubscribeFromLists(this.listsChannel);
      this.listsChannel = null;
    }
  }

  private subscribeToLists(): void {
    this.listsChannel = this.listService.subscribeToLists((change) => {
      this.lists.update((current) => this.listService.mergeListChange(current, change));
    });
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
