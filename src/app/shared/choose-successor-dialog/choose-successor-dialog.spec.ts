import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ChooseSuccessorDialog, SuccessorOption } from './choose-successor-dialog';

describe('ChooseSuccessorDialog', () => {
  const members: SuccessorOption[] = [
    { id: 'user-2', label: 'ana (Ana García)' },
    { id: 'user-3', label: 'luis (Luis Pérez)' },
  ];

  function setup(memberOptions: SuccessorOption[] = members) {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(ChooseSuccessorDialog);
    fixture.componentRef.setInput('members', memberOptions);
    fixture.detectChanges();
    return fixture;
  }

  it('emits undefined on confirm when left on the automatic option (default)', () => {
    const fixture = setup();
    const emitted: (string | undefined)[] = [];
    fixture.componentInstance.confirmed.subscribe((value) => emitted.push(value));

    fixture.componentInstance.onConfirm();

    expect(emitted).toEqual([undefined]);
  });

  it('emits the chosen successor id on confirm after selecting a member', () => {
    const fixture = setup();
    const emitted: (string | undefined)[] = [];
    fixture.componentInstance.confirmed.subscribe((value) => emitted.push(value));

    fixture.componentInstance.onSelectionChange('user-3');
    fixture.componentInstance.onConfirm();

    expect(emitted).toEqual(['user-3']);
  });

  it('falls back to automatic (undefined) if the selection is set back to auto', () => {
    const fixture = setup();
    const emitted: (string | undefined)[] = [];
    fixture.componentInstance.confirmed.subscribe((value) => emitted.push(value));

    fixture.componentInstance.onSelectionChange('user-3');
    fixture.componentInstance.onSelectionChange('auto');
    fixture.componentInstance.onConfirm();

    expect(emitted).toEqual([undefined]);
  });

  it('emits cancelled and nothing on confirmed when cancelled', () => {
    const fixture = setup();
    const confirmedEmitted: unknown[] = [];
    const cancelledEmitted: unknown[] = [];
    fixture.componentInstance.confirmed.subscribe((value) => confirmedEmitted.push(value));
    fixture.componentInstance.cancelled.subscribe(() => cancelledEmitted.push(undefined));

    fixture.componentInstance.onCancel();

    expect(cancelledEmitted.length).toBe(1);
    expect(confirmedEmitted.length).toBe(0);
  });

  it('emits cancelled on Escape keydown', () => {
    const fixture = setup();
    const cancelledEmitted: unknown[] = [];
    fixture.componentInstance.cancelled.subscribe(() => cancelledEmitted.push(undefined));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(cancelledEmitted.length).toBe(1);
  });

  it('emits cancelled on a backdrop click but not on a click inside the dialog', () => {
    const fixture = setup();
    const cancelledEmitted: unknown[] = [];
    fixture.componentInstance.cancelled.subscribe(() => cancelledEmitted.push(undefined));

    const backdrop = fixture.nativeElement.querySelector('.confirm-modal-backdrop') as HTMLElement;
    const dialog = fixture.nativeElement.querySelector('.confirm-modal') as HTMLElement;

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cancelledEmitted.length).toBe(0);

    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cancelledEmitted.length).toBe(1);
  });

  it('renders the automatic option plus one option per member, in order', () => {
    const fixture = setup();

    const options = fixture.nativeElement.querySelectorAll('option');
    expect(options.length).toBe(3);
    expect((options[0] as HTMLOptionElement).value).toBe('auto');
    expect((options[1] as HTMLOptionElement).value).toBe('user-2');
    expect((options[2] as HTMLOptionElement).value).toBe('user-3');
  });
});
