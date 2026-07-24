import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

let nextId = 0;

const AUTO_OPTION_VALUE = 'auto';

export interface SuccessorOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-choose-successor-dialog',
  imports: [],
  templateUrl: './choose-successor-dialog.html',
  styleUrls: ['../confirm-modal/confirm-modal.css', './choose-successor-dialog.css'],
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class ChooseSuccessorDialog {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

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
  private readonly previouslyFocusedElement = document.activeElement as HTMLElement | null;

  constructor() {
    // Unlike ConfirmModal (which focuses Cancel first, to guard against an
    // accidental Enter confirming a destructive action), this dialog isn't
    // destructive by itself — it only relays a choice — so it's more useful
    // to focus the select itself so keyboard/screen-reader users land
    // straight on the one meaningful control.
    afterNextRender(() => {
      this.successorSelect()?.nativeElement.focus();
    });

    inject(DestroyRef).onDestroy(() => {
      this.previouslyFocusedElement?.focus();
    });
  }

  onSelectionChange(value: string): void {
    this.selectedId.set(value);
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancelled.emit();
    }
  }

  onConfirm(): void {
    const selected = this.selectedId();
    this.confirmed.emit(selected === AUTO_OPTION_VALUE ? undefined : selected);
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelled.emit();
      return;
    }

    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const focusable = this.getFocusableElements();
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private getFocusableElements(): HTMLElement[] {
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(this.elementRef.nativeElement.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => !el.hasAttribute('disabled'),
    );
  }
}
