import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { InvitationService, PendingInvitation } from '../../core/invitation.service';

@Component({
  selector: 'app-invitations',
  imports: [RouterLink],
  templateUrl: './invitations.html',
  styleUrl: './invitations.css',
})
export class Invitations {
  private readonly invitationService = inject(InvitationService);
  private readonly router = inject(Router);

  protected readonly invitations = signal<PendingInvitation[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly actioningRequestId = signal<string | null>(null);
  protected readonly actionErrors = signal<Record<string, string>>({});

  constructor() {
    this.loadInvitations();
  }

  private async loadInvitations(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    const { data, error } = await this.invitationService.getMyPendingInvitations();

    this.isLoading.set(false);

    if (error) {
      this.loadError.set('No se han podido cargar tus invitaciones.');
      return;
    }

    this.invitations.set(data ?? []);
  }

  async accept(invitation: PendingInvitation): Promise<void> {
    this.actioningRequestId.set(invitation.id);
    this.clearActionError(invitation.id);

    const { error } = await this.invitationService.acceptInvitation(invitation.id);

    this.actioningRequestId.set(null);

    if (error) {
      this.setActionError(invitation.id, 'No se ha podido aceptar la invitación. Inténtalo de nuevo.');
      return;
    }

    this.router.navigate(['/lists', invitation.list_id]);
  }

  async reject(invitation: PendingInvitation): Promise<void> {
    this.actioningRequestId.set(invitation.id);
    this.clearActionError(invitation.id);

    const { error } = await this.invitationService.rejectInvitation(invitation.id);

    this.actioningRequestId.set(null);

    if (error) {
      this.setActionError(invitation.id, 'No se ha podido rechazar la invitación. Inténtalo de nuevo.');
      return;
    }

    this.invitations.update((current) => current.filter((i) => i.id !== invitation.id));
  }

  private setActionError(requestId: string, message: string): void {
    this.actionErrors.update((current) => ({ ...current, [requestId]: message }));
  }

  private clearActionError(requestId: string): void {
    this.actionErrors.update((current) => {
      const next = { ...current };
      delete next[requestId];
      return next;
    });
  }
}
