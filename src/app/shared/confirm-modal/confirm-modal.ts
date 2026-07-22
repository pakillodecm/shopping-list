import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

let nextId = 0;

@Component({
  selector: 'app-confirm-modal',
  imports: [],
  templateUrl: './confirm-modal.html',
  styleUrl: './confirm-modal.css',
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class ConfirmModal {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

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
  private readonly previouslyFocusedElement = document.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => {
      this.cancelButton()?.nativeElement.focus();
    });

    inject(DestroyRef).onDestroy(() => {
      this.previouslyFocusedElement?.focus();
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if (!this.busy() && event.target === event.currentTarget) {
      this.cancelled.emit();
    }
  }

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (this.busy()) {
      return;
    }

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
