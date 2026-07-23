import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { QrCodeComponent } from 'ng-qrcode';

import { AuthService } from '../../../core/auth.service';
import { List, ListService } from '../../../core/list.service';
import { ConfirmModal } from '../../../shared/confirm-modal/confirm-modal';

@Component({
  selector: 'app-list-invite',
  imports: [RouterLink, QrCodeComponent, ConfirmModal],
  templateUrl: './list-invite.html',
  styleUrl: './list-invite.css',
})
export class ListInvite {
  private readonly route = inject(ActivatedRoute);
  private readonly listService = inject(ListService);
  private readonly authService = inject(AuthService);

  protected readonly listId = this.route.snapshot.paramMap.get('id');

  protected readonly list = signal<List | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly isConfirmingRegenerate = signal(false);
  protected readonly isRegenerating = signal(false);
  protected readonly regenerateError = signal<string | null>(null);

  constructor() {
    this.loadList();
  }

  private async loadList(): Promise<void> {
    if (!this.listId) {
      this.isLoading.set(false);
      this.loadError.set('No se ha podido cargar esta lista.');
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(null);

    const { data, error } = await this.listService.getList(this.listId);

    this.isLoading.set(false);

    if (error || !data) {
      this.loadError.set('No se ha podido cargar esta lista. Puede que no exista o que no tengas acceso.');
      return;
    }

    const currentUserId = this.authService.user()?.id ?? null;
    if (data.owner_id !== currentUserId) {
      this.loadError.set('Solo el propietario de la lista puede invitar a otras personas.');
      return;
    }

    this.list.set(data);
  }

  startRegenerateCode(): void {
    this.regenerateError.set(null);
    this.isConfirmingRegenerate.set(true);
  }

  cancelRegenerateCode(): void {
    this.isConfirmingRegenerate.set(false);
  }

  async confirmRegenerateCode(): Promise<void> {
    if (!this.listId) {
      return;
    }

    this.isRegenerating.set(true);
    this.regenerateError.set(null);

    const { data, error } = await this.listService.regenerateInvitationCode(this.listId);

    this.isRegenerating.set(false);

    if (error || !data) {
      this.regenerateError.set('No se ha podido regenerar el código. Inténtalo de nuevo.');
      return;
    }

    this.list.set(data);
    this.isConfirmingRegenerate.set(false);
  }
}
