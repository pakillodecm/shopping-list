import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { ItemService, ListItem } from '../../../core/item.service';
import { List, ListService } from '../../../core/list.service';
import { ConfirmModal } from '../../../shared/confirm-modal/confirm-modal';
import { Autofocus } from '../autofocus.directive';

@Component({
  selector: 'app-list-detail',
  imports: [RouterLink, Autofocus, ConfirmModal],
  templateUrl: './list-detail.html',
  styleUrl: './list-detail.css',
})
export class ListDetail implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly listService = inject(ListService);
  private readonly itemService = inject(ItemService);

  private readonly listId = this.route.snapshot.paramMap.get('id');
  private itemsChannel: RealtimeChannel | null = null;

  protected readonly list = signal<List | null>(null);
  protected readonly items = signal<ListItem[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly isAddingItem = signal(false);
  protected readonly addItemError = signal<string | null>(null);

  protected readonly togglingItemIds = signal<ReadonlySet<string>>(new Set());
  protected readonly toggleError = signal<string | null>(null);

  protected readonly editingItemId = signal<string | null>(null);
  protected readonly isEditingItem = signal(false);
  protected readonly editItemError = signal<string | null>(null);

  protected readonly deletingItemId = signal<string | null>(null);
  protected readonly isDeletingItem = signal(false);
  protected readonly deleteItemError = signal<string | null>(null);
  protected readonly deletingItem = computed(
    () => this.items().find((item) => item.id === this.deletingItemId()) ?? null,
  );

  constructor() {
    this.loadListDetail();
    this.subscribeToItems();
  }

  ngOnDestroy(): void {
    if (this.itemsChannel) {
      this.itemService.unsubscribeFromItems(this.itemsChannel);
      this.itemsChannel = null;
    }
  }

  private subscribeToItems(): void {
    if (!this.listId) {
      return;
    }
    const listId = this.listId;

    this.itemsChannel = this.itemService.subscribeToItems(
      listId,
      (change) => {
        this.items.update((current) => this.itemService.mergeItemChange(current, change));
      },
      () => this.refreshItems(listId),
    );
  }

  private async refreshItems(listId: string): Promise<void> {
    const { data, error } = await this.itemService.getItems(listId);

    if (error) {
      return;
    }

    this.items.set(data ?? []);
  }

  private async loadListDetail(): Promise<void> {
    if (!this.listId) {
      this.isLoading.set(false);
      this.loadError.set('No se ha podido cargar esta lista.');
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(null);

    const [listResult, itemsResult] = await Promise.all([
      this.listService.getList(this.listId),
      this.itemService.getItems(this.listId),
    ]);

    this.isLoading.set(false);

    if (listResult.error || !listResult.data) {
      this.loadError.set('No se ha podido cargar esta lista. Puede que no exista o que no tengas acceso.');
      return;
    }

    this.list.set(listResult.data);

    if (itemsResult.error) {
      this.loadError.set('No se han podido cargar los ítems de esta lista.');
      return;
    }

    this.items.set(itemsResult.data ?? []);
  }

  async submitAddItem(event: SubmitEvent, textInput: HTMLInputElement): Promise<void> {
    event.preventDefault();

    if (!this.listId) {
      return;
    }

    const text = textInput.value.trim();
    if (!text) {
      this.addItemError.set('El texto no puede estar vacío.');
      return;
    }

    this.isAddingItem.set(true);
    this.addItemError.set(null);

    const { data, error } = await this.itemService.addItem(this.listId, text);

    this.isAddingItem.set(false);

    if (error) {
      this.addItemError.set('No se ha podido añadir el ítem. Inténtalo de nuevo.');
      return;
    }

    if (data) {
      this.items.update((current) =>
        this.itemService.mergeItemChange(current, { eventType: 'INSERT', item: data }),
      );
    }
    textInput.value = '';
  }

  async toggleItem(item: ListItem): Promise<void> {
    const nextChecked = !item.checked;

    this.toggleError.set(null);
    this.items.update((current) =>
      this.itemService.mergeItemChange(current, {
        eventType: 'UPDATE',
        item: { ...item, checked: nextChecked },
      }),
    );
    this.togglingItemIds.update((current) => new Set(current).add(item.id));

    const { data, error } = await this.itemService.toggleChecked(item.id, nextChecked);

    this.togglingItemIds.update((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });

    if (error) {
      this.toggleError.set('No se ha podido actualizar el ítem. Inténtalo de nuevo.');
      this.items.update((current) =>
        this.itemService.mergeItemChange(current, { eventType: 'UPDATE', item }),
      );
      return;
    }

    if (data) {
      this.items.update((current) =>
        this.itemService.mergeItemChange(current, { eventType: 'UPDATE', item: data }),
      );
    }
  }

  startEditItem(itemId: string): void {
    this.deletingItemId.set(null);
    this.editItemError.set(null);
    this.editingItemId.set(itemId);
  }

  cancelEditItem(): void {
    this.editingItemId.set(null);
    this.editItemError.set(null);
  }

  async submitEditItem(event: SubmitEvent, item: ListItem, textInput: HTMLInputElement): Promise<void> {
    event.preventDefault();

    const newText = textInput.value.trim();
    if (!newText) {
      this.editItemError.set('El texto no puede estar vacío.');
      return;
    }

    this.isEditingItem.set(true);
    this.editItemError.set(null);

    const { data, error } = await this.itemService.updateText(item.id, newText);

    this.isEditingItem.set(false);

    if (error) {
      this.editItemError.set('No se ha podido editar el ítem. Inténtalo de nuevo.');
      return;
    }

    if (data) {
      this.items.update((current) =>
        this.itemService.mergeItemChange(current, { eventType: 'UPDATE', item: data }),
      );
    }
    this.editingItemId.set(null);
  }

  startDeleteItem(itemId: string): void {
    this.editingItemId.set(null);
    this.deleteItemError.set(null);
    this.deletingItemId.set(itemId);
  }

  cancelDeleteItem(): void {
    this.deletingItemId.set(null);
    this.deleteItemError.set(null);
  }

  async confirmDeleteItem(item: ListItem): Promise<void> {
    this.isDeletingItem.set(true);
    this.deleteItemError.set(null);

    const { error } = await this.itemService.deleteItem(item.id);

    this.isDeletingItem.set(false);

    if (error) {
      this.deleteItemError.set('No se ha podido eliminar el ítem. Inténtalo de nuevo.');
      return;
    }

    this.items.update((current) =>
      this.itemService.mergeItemChange(current, { eventType: 'DELETE', item }),
    );
    this.deletingItemId.set(null);
  }
}
