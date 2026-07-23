import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { InvitationService } from '../../../core/invitation.service';

type JoinMode = 'code' | 'qr';

@Component({
  selector: 'app-join-list',
  imports: [RouterLink],
  templateUrl: './join-list.html',
  styleUrl: './join-list.css',
})
export class JoinList {
  private readonly invitationService = inject(InvitationService);

  protected readonly mode = signal<JoinMode>('code');

  protected readonly isJoining = signal(false);
  protected readonly joinError = signal<string | null>(null);
  protected readonly joinResult = signal<{ message: string; alreadyPending: boolean } | null>(
    null,
  );

  setMode(mode: JoinMode): void {
    this.mode.set(mode);
  }

  forceUppercase(input: HTMLInputElement): void {
    input.value = input.value.toUpperCase();
  }

  async submitJoin(event: SubmitEvent, codeInput: HTMLInputElement): Promise<void> {
    event.preventDefault();

    const code = codeInput.value.trim();
    if (!code) {
      this.joinError.set('Introduce un código de invitación.');
      this.joinResult.set(null);
      return;
    }

    this.isJoining.set(true);
    this.joinError.set(null);
    this.joinResult.set(null);

    const { data, error } = await this.invitationService.requestToJoinByCode(code);

    this.isJoining.set(false);

    if (error) {
      this.joinError.set(this.toReadableJoinError(error.message));
      return;
    }

    if (!data) {
      this.joinError.set('No se ha podido enviar la solicitud. Inténtalo de nuevo.');
      return;
    }

    this.joinResult.set({
      message: data.already_pending
        ? 'Ya tenías una solicitud pendiente para esta lista.'
        : 'Solicitud enviada correctamente. El propietario de la lista debe aprobarla.',
      alreadyPending: data.already_pending,
    });
    codeInput.value = '';
  }

  private toReadableJoinError(message: string): string {
    const normalized = message.toLowerCase();

    if (normalized.includes('invalid invitation code')) {
      return 'Ese código de invitación no existe.';
    }

    if (normalized.includes('already a member')) {
      return 'Ya eres miembro de esta lista.';
    }

    if (normalized.includes('already own this list')) {
      return 'Ese código pertenece a una lista que ya es tuya.';
    }

    return 'No se ha podido enviar la solicitud. Inténtalo de nuevo.';
  }
}
