import { Directive, DestroyRef, ElementRef, inject, input, output } from '@angular/core';

// Shared dismissible-overlay behavior for ConfirmModal and
// ChooseSuccessorDialog (extracted per code-review finding 12.1, ahead of a
// likely third dialog in Stage 7): Tab focus trapping, Escape-to-dismiss,
// backdrop-click-to-dismiss (only when the click lands on this element
// itself, not on something inside it — see each consumer's template
// comment for why that still has a keyboard equivalent), and restoring
// focus to whatever had it before the overlay opened.
//
// Apply to the outer overlay/backdrop element — getFocusableElements()
// and the backdrop-click check are both scoped to the element this is
// applied to, so it must wrap the whole dialog for the trap to include
// every focusable control inside it.
//
// Escape and backdrop-click both just mean "dismiss" for both current
// consumers (same as the Cancel button), so they share a single
// `appFocusTrapDismissed` output rather than two separate ones. Initial
// focus-on-open isn't part of this directive: ConfirmModal focuses its
// Cancel button and ChooseSuccessorDialog focuses its select for
// different a11y reasons (see each component), so that stays local to
// each consumer.
@Directive({
  selector: '[appFocusTrap]',
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
    '(click)': 'onBackdropClick($event)',
  },
})
export class FocusTrap {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  // Mirrors ConfirmModal's `busy` gate: while true, Escape/Tab/backdrop
  // dismissal are all suppressed. Defaults to false, which is exactly what
  // ChooseSuccessorDialog wants (it has no busy state of its own).
  readonly appFocusTrapDisabled = input(false);

  readonly appFocusTrapDismissed = output<void>();

  private readonly previouslyFocusedElement = document.activeElement as HTMLElement | null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.previouslyFocusedElement?.focus();
    });
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (this.appFocusTrapDisabled()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.appFocusTrapDismissed.emit();
      return;
    }

    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (!this.appFocusTrapDisabled() && event.target === event.currentTarget) {
      this.appFocusTrapDismissed.emit();
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
