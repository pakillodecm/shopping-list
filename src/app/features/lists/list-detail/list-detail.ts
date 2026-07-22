import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ItemService, ListItem } from '../../../core/item.service';
import { List, ListService } from '../../../core/list.service';

@Component({
  selector: 'app-list-detail',
  imports: [RouterLink],
  templateUrl: './list-detail.html',
  styleUrl: './list-detail.css',
})
export class ListDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly listService = inject(ListService);
  private readonly itemService = inject(ItemService);

  private readonly listId = this.route.snapshot.paramMap.get('id');

  protected readonly list = signal<List | null>(null);
  protected readonly items = signal<ListItem[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    this.loadListDetail();
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
}
