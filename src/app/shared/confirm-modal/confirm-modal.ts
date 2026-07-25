import { Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';

import { FocusTrap } from '../focus-trap/focus-trap.directive';

let nextId = 0;

@Component({
  selector: 'app-confirm-modal',
  imports: [FocusTrap],
  templateUrl: './confirm-modal.html',
  styleUrl: './confirm-modal.css',
})
export class ConfirmModal {
  readonly title = input('Confirmar acción');
  readonly message = input('¿Seguro que quieres continuar?');
  readonly confirmText = input('Confirmar');
  readonly cancelText = input('Cancelar');
  readonly errorMessage = input<string | null>(null);
  readonly busy = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly instanceId = `confirm-modal-${nextId++}`;
  protected readonly titleId = `${this.instanceId}-title`;
  protected readonly messageId = `${this.instanceId}-message`;

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    afterNextRender(() => {
      this.cancelButton()?.nativeElement.focus();
    });
  }

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
