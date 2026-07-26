import { Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';

import { FocusTrap } from '../focus-trap/focus-trap.directive';

let nextId = 0;

// Neutral counterpart to ConfirmModal: same title/message/confirm/cancel
// shape, but role="dialog" (not "alertdialog") and no btn-danger styling,
// for confirmations that aren't destructive (e.g. regenerating an
// invitation code). Use ConfirmModal instead when the action destroys or
// irreversibly affects data.
@Component({
  selector: 'app-confirm-dialog',
  imports: [FocusTrap],
  templateUrl: './confirm-dialog.html',
  styleUrl: '../confirm-modal/confirm-modal.css',
})
export class ConfirmDialog {
  readonly title = input('Confirmar acción');
  readonly message = input('¿Seguro que quieres continuar?');
  readonly confirmText = input('Confirmar');
  readonly cancelText = input('Cancelar');
  readonly errorMessage = input<string | null>(null);
  readonly busy = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly instanceId = `confirm-dialog-${nextId++}`;
  protected readonly titleId = `${this.instanceId}-title`;
  protected readonly messageId = `${this.instanceId}-message`;

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    // Unlike ChooseSuccessorDialog (which has a select to focus), this
    // dialog has only Confirm/Cancel, so it mirrors ConfirmModal and
    // focuses Cancel first — not because the action is destructive, but so
    // a stray Enter keypress doesn't confirm before the message is read.
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
