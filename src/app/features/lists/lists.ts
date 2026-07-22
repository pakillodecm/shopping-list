import { Component, inject, signal } from '@angular/core';

import { List, ListService } from '../../core/list.service';
import { LogoutButton } from '../auth/logout-button/logout-button';

@Component({
  selector: 'app-lists',
  imports: [LogoutButton],
  templateUrl: './lists.html',
  styleUrl: './lists.css',
})
export class Lists {
  private readonly listService = inject(ListService);

  protected readonly lists = signal<List[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly isCreating = signal(false);
  protected readonly createError = signal<string | null>(null);

  constructor() {
    this.loadLists();
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
}
