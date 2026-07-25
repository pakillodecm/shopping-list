import {
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { FocusTrap } from '../focus-trap/focus-trap.directive';

let nextId = 0;

const AUTO_OPTION_VALUE = 'auto';

export interface SuccessorOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-choose-successor-dialog',
  imports: [FocusTrap],
  templateUrl: './choose-successor-dialog.html',
  styleUrls: ['../confirm-modal/confirm-modal.css', './choose-successor-dialog.css'],
})
export class ChooseSuccessorDialog {
  readonly members = input.required<SuccessorOption[]>();
  readonly title = input('Elegir nuevo propietario');
  readonly message = input(
    'Vas a abandonar la lista. Elige quién será el nuevo propietario o deja la opción automática.',
  );
  readonly confirmText = input('Confirmar');
  readonly cancelText = input('Cancelar');

  // undefined means "automatic" (leave_list picks the oldest member itself
  // when p_successor_id is null) — this component never calls leave_list or
  // decides who the oldest member is, it just relays the user's choice.
  readonly confirmed = output<string | undefined>();
  readonly cancelled = output<void>();

  protected readonly instanceId = `choose-successor-dialog-${nextId++}`;
  protected readonly titleId = `${this.instanceId}-title`;
  protected readonly messageId = `${this.instanceId}-message`;
  protected readonly selectId = `${this.instanceId}-select`;

  protected readonly selectedId = signal<string>(AUTO_OPTION_VALUE);

  private readonly successorSelect = viewChild<ElementRef<HTMLSelectElement>>('successorSelect');

  constructor() {
    // Unlike ConfirmModal (which focuses Cancel first, to guard against an
    // accidental Enter confirming a destructive action), this dialog isn't
    // destructive by itself — it only relays a choice — so it's more useful
    // to focus the select itself so keyboard/screen-reader users land
    // straight on the one meaningful control.
    afterNextRender(() => {
      this.successorSelect()?.nativeElement.focus();
    });
  }

  onSelectionChange(value: string): void {
    this.selectedId.set(value);
  }

  onConfirm(): void {
    const selected = this.selectedId();
    this.confirmed.emit(selected === AUTO_OPTION_VALUE ? undefined : selected);
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
