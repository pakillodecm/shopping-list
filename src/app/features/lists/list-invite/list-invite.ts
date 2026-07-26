import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { QrCodeComponent } from 'ng-qrcode';

import { AuthService } from '../../../core/auth.service';
import { IdKeyedActionState } from '../../../core/id-keyed-action-state';
import { InvitationService, PendingRequest } from '../../../core/invitation.service';
import { List, ListService } from '../../../core/list.service';
import { ConfirmModal } from '../../../shared/confirm-modal/confirm-modal';

@Component({
  selector: 'app-list-invite',
  imports: [RouterLink, QrCodeComponent, ConfirmModal],
  templateUrl: './list-invite.html',
  styleUrl: './list-invite.css',
})
export class ListInvite implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly listService = inject(ListService);
  private readonly authService = inject(AuthService);
  private readonly invitationService = inject(InvitationService);
  private requestsChannel: RealtimeChannel | null = null;

  protected readonly listId = this.route.snapshot.paramMap.get('id');

  protected readonly list = signal<List | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly isConfirmingRegenerate = signal(false);
  protected readonly isRegenerating = signal(false);
  protected readonly regenerateError = signal<string | null>(null);

  protected readonly isInviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly inviteResult = signal<{ message: string; alreadyPending: boolean } | null>(
    null,
  );

  protected readonly pendingRequests = signal<PendingRequest[]>([]);
  protected readonly isLoadingRequests = signal(true);
  protected readonly requestsError = signal<string | null>(null);

  protected readonly requestAction = new IdKeyedActionState();

  constructor() {
    this.loadList();
  }

  ngOnDestroy(): void {
    if (this.requestsChannel) {
      this.invitationService.unsubscribeFromMembershipRequests(this.requestsChannel);
      this.requestsChannel = null;
    }
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
    this.loadPendingRequests(this.listId);
    this.subscribeToRequests(this.listId);
  }

  private async loadPendingRequests(listId: string): Promise<void> {
    this.isLoadingRequests.set(true);
    this.requestsError.set(null);

    const { data, error } = await this.invitationService.getPendingRequestsForList(listId);

    this.isLoadingRequests.set(false);

    if (error) {
      this.requestsError.set('No se han podido cargar las solicitudes pendientes.');
      return;
    }

    this.pendingRequests.set(data ?? []);
  }

  private subscribeToRequests(listId: string): void {
    this.requestsChannel = this.invitationService.subscribeToListRequests(
      listId,
      (change) => {
        this.pendingRequests.update((current) =>
          this.invitationService.mergeListRequestsChange(current, change),
        );
      },
      () => this.refreshPendingRequests(listId),
    );
  }

  private async refreshPendingRequests(listId: string): Promise<void> {
    const { data, error } = await this.invitationService.getPendingRequestsForList(listId);

    if (error) {
      console.warn('[refreshPendingRequests] failed to refresh:', error);
      return;
    }

    this.pendingRequests.set(data ?? []);
  }

  async approveRequest(request: PendingRequest): Promise<void> {
    this.requestAction.start(request.id);

    const { error } = await this.invitationService.approveJoinRequest(request.id);

    this.requestAction.finish();

    if (error) {
      this.requestAction.setError(request.id, 'No se ha podido aprobar la solicitud. Inténtalo de nuevo.');
      return;
    }

    this.pendingRequests.update((current) => current.filter((r) => r.id !== request.id));
  }

  async denyRequest(request: PendingRequest): Promise<void> {
    this.requestAction.start(request.id);

    const { error } = await this.invitationService.denyJoinRequest(request.id);

    this.requestAction.finish();

    if (error) {
      this.requestAction.setError(request.id, 'No se ha podido denegar la solicitud. Inténtalo de nuevo.');
      return;
    }

    this.pendingRequests.update((current) => current.filter((r) => r.id !== request.id));
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

  async submitInvite(event: SubmitEvent, identifierInput: HTMLInputElement): Promise<void> {
    event.preventDefault();

    if (!this.listId) {
      return;
    }

    const identifier = identifierInput.value.trim();
    if (!identifier) {
      this.inviteError.set('Introduce un nombre de usuario o un email.');
      this.inviteResult.set(null);
      return;
    }

    this.isInviting.set(true);
    this.inviteError.set(null);
    this.inviteResult.set(null);

    const { data, error } = await this.invitationService.inviteUser(this.listId, identifier);

    this.isInviting.set(false);

    if (error) {
      this.inviteError.set(this.toReadableInviteError(error.message));
      return;
    }

    if (!data) {
      this.inviteError.set('No se ha podido enviar la invitación. Inténtalo de nuevo.');
      return;
    }

    this.inviteResult.set({
      message: data.already_pending
        ? 'Ya había una solicitud pendiente con esta persona para esta lista.'
        : 'Invitación enviada correctamente.',
      alreadyPending: data.already_pending,
    });
    identifierInput.value = '';
  }

  private toReadableInviteError(message: string): string {
    const normalized = message.toLowerCase();

    if (normalized.includes('no user found')) {
      return 'No se ha encontrado ningún usuario con ese nombre de usuario o email.';
    }

    if (normalized.includes('already a member')) {
      return 'Esa persona ya es miembro de esta lista.';
    }

    if (normalized.includes('cannot invite yourself')) {
      return 'No puedes invitarte a ti mismo.';
    }

    return 'No se ha podido enviar la invitación. Inténtalo de nuevo.';
  }
}
