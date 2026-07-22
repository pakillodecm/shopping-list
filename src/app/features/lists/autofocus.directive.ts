import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

@Directive({
  selector: '[appAutofocus]',
})
export class Autofocus {
  private readonly elementRef = inject(ElementRef<HTMLInputElement>);

  constructor() {
    afterNextRender(() => {
      this.elementRef.nativeElement.focus();
    });
  }
}
