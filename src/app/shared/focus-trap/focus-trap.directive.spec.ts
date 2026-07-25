import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { FocusTrap } from './focus-trap.directive';

@Component({
  imports: [FocusTrap],
  template: `
    <button id="outside">Fuera</button>
    <div
      class="host"
      appFocusTrap
      [appFocusTrapDisabled]="disabled()"
      (appFocusTrapDismissed)="onDismissed()"
    >
      <button id="first">Primero</button>
      <button id="second">Segundo</button>
    </div>
  `,
})
class TestHost {
  readonly disabled = signal(false);
  readonly dismissed = vi.fn();

  onDismissed(): void {
    this.dismissed();
  }
}

describe('FocusTrap', () => {
  function setup() {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    return fixture;
  }

  it('emits dismissed on Escape', () => {
    const fixture = setup();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(fixture.componentInstance.dismissed).toHaveBeenCalledTimes(1);
  });

  it('does not emit dismissed on Escape while disabled', () => {
    const fixture = setup();
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(fixture.componentInstance.dismissed).not.toHaveBeenCalled();
  });

  it('emits dismissed on a backdrop click but not on a click on inner content', () => {
    const fixture = setup();
    const host = fixture.nativeElement.querySelector('.host') as HTMLElement;
    const inner = fixture.nativeElement.querySelector('#first') as HTMLElement;

    inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixture.componentInstance.dismissed).not.toHaveBeenCalled();

    host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixture.componentInstance.dismissed).toHaveBeenCalledTimes(1);
  });

  it('does not emit dismissed on a backdrop click while disabled', () => {
    const fixture = setup();
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('.host') as HTMLElement;

    host.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fixture.componentInstance.dismissed).not.toHaveBeenCalled();
  });

  it('wraps Tab from the last focusable element to the first', () => {
    const fixture = setup();
    const first = fixture.nativeElement.querySelector('#first') as HTMLElement;
    const second = fixture.nativeElement.querySelector('#second') as HTMLElement;
    second.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('wraps Shift+Tab from the first focusable element to the last', () => {
    const fixture = setup();
    const first = fixture.nativeElement.querySelector('#first') as HTMLElement;
    const second = fixture.nativeElement.querySelector('#second') as HTMLElement;
    first.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(second);
  });

  it('restores focus to the previously focused element once destroyed', () => {
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    const fixture = setup();
    fixture.destroy();

    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
  });
});
