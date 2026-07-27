import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import {
  NgxScannerQrcodeComponent,
  ScannerQRCodeConfig,
  ScannerQRCodeDevice,
  ScannerQRCodeResult,
} from 'ngx-scanner-qrcode';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InvitationService, InviteResult } from '../../../core/invitation.service';
import { JoinList } from './join-list';

// jsdom has no camera, no getUserMedia and no wasm loader, so the real
// NgxScannerQrcodeComponent (which drives all of that internally) cannot run
// here at all. Standing in for it with a minimal fake that exposes only what
// JoinList actually calls on it (devices/stop/playDevice/loadCameraDevices,
// plus the `event` output and `scanner` exportAs the template binds to) lets
// every non-hardware branch of the state machine run for real through
// JoinList's actual viewChild+effect wiring, instead of poking at its private
// methods directly. TestBed.overrideComponent swaps this in for the real
// import below.
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- must match the real ngx-scanner-qrcode selector to stand in for it via TestBed.overrideComponent
  selector: 'ngx-scanner-qrcode',
  exportAs: 'scanner',
  template: '',
})
class FakeScannerComponent {
  readonly config = input<ScannerQRCodeConfig>();
  readonly event = output<ScannerQRCodeResult[]>();

  readonly devices = new BehaviorSubject<ScannerQRCodeDevice[]>([]);
  // waitForFreshDevices() skips whatever the `devices` subject already holds
  // (treating it as stale) and resolves on the NEXT emission. Setting this
  // before calling loadCameraDevices() (or letting the default `[]` stand in
  // for "no devices found") controls what that next emission is.
  devicesOnNextLoad: ScannerQRCodeDevice[] = [];

  readonly stop = vi.fn();
  readonly playDevice = vi.fn<(deviceId: string) => Observable<boolean>>().mockReturnValue(of(true));
  readonly loadCameraDevices = vi.fn(() => this.devices.next(this.devicesOnNextLoad));
}

function makeDevice(deviceId: string, label: string): ScannerQRCodeDevice {
  return { deviceId, label, kind: 'videoinput', groupId: 'group-1' };
}

function makeScanResult(value: string | undefined): ScannerQRCodeResult {
  return { value } as unknown as ScannerQRCodeResult;
}

function makeInviteResult(alreadyPending: boolean): InviteResult {
  return {
    id: 'req-1',
    list_id: 'list-1',
    user_id: 'user-1',
    origin: 'REQUEST',
    already_pending: alreadyPending,
  } as InviteResult;
}

// navigator.permissions/navigator.mediaDevices aren't meaningfully
// implemented by jsdom, so each test that needs a specific camera-permission
// or getUserMedia outcome installs its own via Object.defineProperty; the
// original (usually absent) descriptors are restored in afterEach so no
// mock leaks into another test file.
let originalPermissions: PropertyDescriptor | undefined;
let originalMediaDevices: PropertyDescriptor | undefined;

function mockPermissionsQuery(
  outcome: 'granted' | 'denied' | 'prompt' | 'no-api' | 'throws' | 'unrecognized-state',
): void {
  if (outcome === 'no-api') {
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
    return;
  }

  const query =
    outcome === 'throws'
      ? vi.fn().mockRejectedValue(new Error('not supported on this platform'))
      : vi
          .fn()
          .mockResolvedValue({ state: outcome === 'unrecognized-state' ? 'unknown' : outcome });

  Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
}

// preferredDeviceId simulates what track.getSettings().deviceId resolves the
// facingMode:{ideal:'environment'} preference to (see startScanning in
// join-list.ts) — undefined by default, matching a platform/browser where
// that readback isn't available, so existing tests keep exercising the
// label-fallback path (pickBackCameraDeviceId) unless a test opts in.
function mockGetUserMedia(
  outcome: 'success' | 'failure',
  preferredDeviceId?: string,
): { stopTrack: ReturnType<typeof vi.fn> } {
  const stopTrack = vi.fn();
  const getUserMedia =
    outcome === 'success'
      ? vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopTrack }],
          getVideoTracks: () => [{ getSettings: () => ({ deviceId: preferredDeviceId }) }],
        })
      : vi.fn().mockRejectedValue(new Error('Permission denied'));

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });

  return { stopTrack };
}

async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe('JoinList', () => {
  let getListNameByCodeMock: ReturnType<typeof vi.fn>;
  let requestToJoinByCodeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalPermissions = Object.getOwnPropertyDescriptor(navigator, 'permissions');
    originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

    getListNameByCodeMock = vi.fn().mockResolvedValue({ data: 'Compra semanal', error: null });
    requestToJoinByCodeMock = vi
      .fn()
      .mockResolvedValue({ data: makeInviteResult(false), error: null });
  });

  afterEach(() => {
    if (originalPermissions) {
      Object.defineProperty(navigator, 'permissions', originalPermissions);
    } else {
      delete (navigator as { permissions?: unknown }).permissions;
    }

    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    } else {
      delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    }
  });

  function createFixture(): ComponentFixture<JoinList> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: InvitationService,
          useValue: {
            getListNameByCode: getListNameByCodeMock,
            requestToJoinByCode: requestToJoinByCodeMock,
          },
        },
      ],
    });
    TestBed.overrideComponent(JoinList, {
      remove: { imports: [NgxScannerQrcodeComponent] },
      add: { imports: [FakeScannerComponent] },
    });

    const fixture = TestBed.createComponent(JoinList);
    fixture.detectChanges();
    return fixture;
  }

  // Switches to the QR tab and returns the fake scanner instance the
  // component's viewChild query just picked up, *before* any microtask is
  // flushed — so the test can still configure devicesOnNextLoad/playDevice
  // before beginQrFlow()'s awaited chain (which the caller flushes next)
  // reaches the point that reads them.
  function openQrTab(fixture: ComponentFixture<JoinList>): FakeScannerComponent {
    fixture.componentInstance.setMode('qr');
    fixture.detectChanges();

    const debugEl = fixture.debugElement.query(By.directive(FakeScannerComponent));
    return debugEl.componentInstance as FakeScannerComponent;
  }

  function qrState(fixture: ComponentFixture<JoinList>): string {
    return fixture.componentInstance['qrState']();
  }

  // --- 1. Full state machine + 2. camera permission branches -------------

  describe('camera permission branches', () => {
    it('goes straight to "scanning" when permission is already granted (no intro screen)', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const fixture = createFixture();

      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Back Camera')];
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('scanning');
      expect(scanner.playDevice).toHaveBeenCalledWith('cam-1');
    });

    it('goes straight to "unavailable" when permission is already denied (no button offered)', async () => {
      mockPermissionsQuery('denied');
      const fixture = createFixture();

      openQrTab(fixture);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('unavailable');
      const alert = fixture.nativeElement.querySelector('.alert-danger');
      expect(alert?.textContent).toContain('Introducir código');
    });

    it('shows the intro screen (not the native prompt directly) when permission is "prompt"', async () => {
      mockPermissionsQuery('prompt');
      const fixture = createFixture();

      openQrTab(fixture);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('prompt-intro');
      expect(fixture.nativeElement.querySelector('.qr-intro')).toBeTruthy();
    });

    it('degrades to the "prompt" intro screen on Safari/iOS, which has no navigator.permissions at all', async () => {
      mockPermissionsQuery('no-api');
      const fixture = createFixture();

      openQrTab(fixture);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('prompt-intro');
    });

    it('treats a navigator.permissions.query() rejection the same as "prompt"', async () => {
      mockPermissionsQuery('throws');
      const fixture = createFixture();

      openQrTab(fixture);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('prompt-intro');
    });

    it('treats any state other than granted/denied as "prompt"', async () => {
      mockPermissionsQuery('unrecognized-state');
      const fixture = createFixture();

      openQrTab(fixture);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('prompt-intro');
    });

    it('only requests the camera after the user taps "Continuar" on the intro screen, not automatically', async () => {
      mockPermissionsQuery('prompt');
      const getUserMediaSpy = vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
        getVideoTracks: () => [{ getSettings: () => ({ deviceId: undefined }) }],
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: getUserMediaSpy },
        configurable: true,
      });
      const fixture = createFixture();

      openQrTab(fixture);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(qrState(fixture)).toBe('prompt-intro');
      expect(getUserMediaSpy).not.toHaveBeenCalled();

      fixture.componentInstance.startCameraFromIntro();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(getUserMediaSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('starting the camera (getUserMedia / device selection)', () => {
    // The visual-polish fix for the "black box + bare gray text" transition
    // seen on real devices: while the probe is pending, qrState stays
    // 'starting' and the overlay should be showing over the (still blank)
    // video box rather than nothing. Whether it actually *reads* as smooth
    // on real hardware isn't something jsdom can judge — this only checks
    // the template renders the overlay for this state.
    it('shows a loading overlay while the camera is starting', async () => {
      mockPermissionsQuery('granted');
      Object.defineProperty(navigator, 'mediaDevices', {
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- deliberately never settles
        value: { getUserMedia: vi.fn(() => new Promise(() => {})) },
        configurable: true,
      });
      const fixture = createFixture();

      openQrTab(fixture);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('starting');
      const overlay = fixture.nativeElement.querySelector('.qr-loading-overlay');
      expect(overlay?.textContent).toContain('Preparando la cámara');
    });

    it('goes to "unavailable" when getUserMedia itself rejects', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('failure');
      const fixture = createFixture();

      openQrTab(fixture);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('unavailable');
    });

    it('goes to "unavailable" when no devices are found after enumeration', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const fixture = createFixture();

      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [];
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('unavailable');
      expect(scanner.playDevice).not.toHaveBeenCalled();
    });

    it('picks the device labelled "back"/"rear"/"environment" over other devices', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const fixture = createFixture();

      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [
        makeDevice('front-cam', 'Front Camera'),
        makeDevice('back-cam', 'Back (environment) Camera'),
      ];
      await flushMicrotasks();
      fixture.detectChanges();

      expect(scanner.playDevice).toHaveBeenCalledWith('back-cam');
      expect(qrState(fixture)).toBe('scanning');
    });

    it('falls back to the last device in the list when none is labelled as the back camera', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const fixture = createFixture();

      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [makeDevice('cam-a', ''), makeDevice('cam-b', '')];
      await flushMicrotasks();
      fixture.detectChanges();

      expect(scanner.playDevice).toHaveBeenCalledWith('cam-b');
    });

    // The iPad fix: getUserMedia's facingMode:{ideal:'environment'} hint
    // resolves to a real deviceId (read back via getSettings()) that takes
    // priority over the label heuristic entirely — this is what makes the
    // fix work even when a device's label gives no "back"/"rear"/
    // "environment" keyword to match at all (the documented WebKit case).
    it('prefers the device getSettings().deviceId resolved, even when its label gives no back/rear/environment hint', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success', 'ambiguous-cam');
      const fixture = createFixture();

      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [
        makeDevice('front-cam', 'Front Camera'),
        // Neither label matches the back/rear/environment regex — on real
        // hardware this is the iPad case, standing in for whatever WebKit
        // actually calls its rear camera.
        makeDevice('ambiguous-cam', 'Camera 2'),
      ];
      await flushMicrotasks();
      fixture.detectChanges();

      expect(scanner.playDevice).toHaveBeenCalledWith('ambiguous-cam');
      expect(qrState(fixture)).toBe('scanning');
    });

    it('falls back to the label heuristic when the resolved deviceId is not among the enumerated devices', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success', 'not-in-the-list');
      const fixture = createFixture();

      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [
        makeDevice('front-cam', 'Front Camera'),
        makeDevice('back-cam', 'Back Camera'),
      ];
      await flushMicrotasks();
      fixture.detectChanges();

      expect(scanner.playDevice).toHaveBeenCalledWith('back-cam');
    });

    it('goes to "unavailable" when playDevice reports failure (ok=false)', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const fixture = createFixture();

      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Back Camera')];
      scanner.playDevice.mockReturnValue(of(false));
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('unavailable');
    });

    it('goes to "unavailable" when playDevice errors', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const fixture = createFixture();

      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Back Camera')];
      scanner.playDevice.mockReturnValue(throwError(() => new Error('device busy')));
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('unavailable');
    });

    it('exposes the enumerated devices for the camera-switch dropdown once scanning starts', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const fixture = createFixture();

      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Front'), makeDevice('cam-2', 'Back')];
      await flushMicrotasks();
      fixture.detectChanges();

      const options = fixture.nativeElement.querySelectorAll('#camera-select option');
      expect(options.length).toBe(2);
    });

    it('switchCamera() plays the selected device id', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const fixture = createFixture();

      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Front'), makeDevice('cam-2', 'Back')];
      await flushMicrotasks();
      fixture.detectChanges();
      scanner.playDevice.mockClear();

      const select = fixture.nativeElement.querySelector('#camera-select') as HTMLSelectElement;
      select.value = 'cam-1';
      select.dispatchEvent(new Event('change'));

      expect(scanner.playDevice).toHaveBeenCalledWith('cam-1');
    });
  });

  // --- 3. QR detection -> lookup -> confirm -> requestToJoinByCode -------

  describe('scan -> lookup -> confirm -> request flow', () => {
    async function reachScanning(fixture: ComponentFixture<JoinList>): Promise<FakeScannerComponent> {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Back Camera')];
      await flushMicrotasks();
      fixture.detectChanges();
      return scanner;
    }

    it('ignores scan results while not in the "scanning" state', async () => {
      const fixture = createFixture();
      mockPermissionsQuery('prompt');
      openQrTab(fixture);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(qrState(fixture)).toBe('prompt-intro');

      fixture.componentInstance.onScan([makeScanResult('ABC234')]);

      expect(getListNameByCodeMock).not.toHaveBeenCalled();
      expect(qrState(fixture)).toBe('prompt-intro');
    });

    it('ignores an empty results array', async () => {
      const fixture = createFixture();
      const scanner = await reachScanning(fixture);

      fixture.componentInstance.onScan([]);

      expect(scanner.stop).not.toHaveBeenCalled();
      expect(qrState(fixture)).toBe('scanning');
    });

    it('goes to "invalid-code" without a lookup call when the decoded value is empty', async () => {
      const fixture = createFixture();
      const scanner = await reachScanning(fixture);

      fixture.componentInstance.onScan([makeScanResult('   ')]);

      expect(scanner.stop).toHaveBeenCalledTimes(1);
      expect(getListNameByCodeMock).not.toHaveBeenCalled();
      expect(qrState(fixture)).toBe('invalid-code');
    });

    it('stops the scanner and looks up the code on a valid detection, then shows the confirm screen', async () => {
      const fixture = createFixture();
      const scanner = await reachScanning(fixture);
      getListNameByCodeMock.mockResolvedValue({ data: 'Compra semanal', error: null });

      fixture.componentInstance.onScan([makeScanResult('ABC234')]);
      expect(scanner.stop).toHaveBeenCalledTimes(1);
      expect(qrState(fixture)).toBe('looking-up');

      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('confirming');
      expect(getListNameByCodeMock).toHaveBeenCalledWith('ABC234');
      expect(fixture.nativeElement.querySelector('.qr-confirm')?.textContent).toContain(
        'Compra semanal',
      );
    });

    it('goes to "invalid-code" when the code does not exist (lookup resolves with null)', async () => {
      const fixture = createFixture();
      await reachScanning(fixture);
      getListNameByCodeMock.mockResolvedValue({ data: null, error: null });

      fixture.componentInstance.onScan([makeScanResult('ZZZZZZ')]);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('invalid-code');
      expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
        'no es válido',
      );
    });

    it('goes to "invalid-code" with a network-error message when the lookup itself fails', async () => {
      const fixture = createFixture();
      await reachScanning(fixture);
      getListNameByCodeMock.mockResolvedValue({ data: null, error: { message: 'network error' } });

      fixture.componentInstance.onScan([makeScanResult('ABC234')]);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('invalid-code');
      expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
        'No se ha podido comprobar',
      );
    });

    it('"Volver a escanear" from invalid-code restarts scanning', async () => {
      const fixture = createFixture();
      const scanner = await reachScanning(fixture);
      getListNameByCodeMock.mockResolvedValue({ data: null, error: null });
      fixture.componentInstance.onScan([makeScanResult('ZZZZZZ')]);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(qrState(fixture)).toBe('invalid-code');
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Back Camera')];

      fixture.componentInstance.rescan();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('scanning');
    });

    it('confirming the join request succeeds and shows the "result" screen with a success message', async () => {
      const fixture = createFixture();
      await reachScanning(fixture);
      fixture.componentInstance.onScan([makeScanResult('ABC234')]);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(qrState(fixture)).toBe('confirming');

      requestToJoinByCodeMock.mockResolvedValue({ data: makeInviteResult(false), error: null });
      await fixture.componentInstance.confirmJoinFromQr();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('result');
      expect(requestToJoinByCodeMock).toHaveBeenCalledWith('ABC234');
      const successAlert = fixture.nativeElement.querySelector('.alert-success');
      expect(successAlert?.textContent).toContain('Solicitud enviada correctamente');
    });

    it('confirming when a request was already pending shows the "already pending" warning', async () => {
      const fixture = createFixture();
      await reachScanning(fixture);
      fixture.componentInstance.onScan([makeScanResult('ABC234')]);
      await flushMicrotasks();
      fixture.detectChanges();

      requestToJoinByCodeMock.mockResolvedValue({ data: makeInviteResult(true), error: null });
      await fixture.componentInstance.confirmJoinFromQr();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('result');
      const warningAlert = fixture.nativeElement.querySelector('.alert-warning');
      expect(warningAlert?.textContent).toContain('Ya tenías una solicitud pendiente');
    });

    it('still lands on the "result" screen (with the error shown) if requestToJoinByCode fails', async () => {
      const fixture = createFixture();
      await reachScanning(fixture);
      fixture.componentInstance.onScan([makeScanResult('ABC234')]);
      await flushMicrotasks();
      fixture.detectChanges();

      requestToJoinByCodeMock.mockResolvedValue({
        data: null,
        error: { message: 'invalid invitation code' },
      });
      await fixture.componentInstance.confirmJoinFromQr();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('result');
      expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
        'Ese código de invitación no existe',
      );
    });

    it('cancelling the confirm screen discards the scanned code and rescans', async () => {
      const fixture = createFixture();
      const scanner = await reachScanning(fixture);
      fixture.componentInstance.onScan([makeScanResult('ABC234')]);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(qrState(fixture)).toBe('confirming');
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Back Camera')];

      fixture.componentInstance.cancelQrConfirm();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('scanning');
      // Confirming again from a fresh scan must not silently reuse the
      // discarded code.
      requestToJoinByCodeMock.mockClear();
      await fixture.componentInstance.confirmJoinFromQr();
      expect(requestToJoinByCodeMock).not.toHaveBeenCalled();
    });

    it('"Escanear otro código" from the result screen restarts scanning', async () => {
      const fixture = createFixture();
      const scanner = await reachScanning(fixture);
      fixture.componentInstance.onScan([makeScanResult('ABC234')]);
      await flushMicrotasks();
      fixture.detectChanges();
      await fixture.componentInstance.confirmJoinFromQr();
      fixture.detectChanges();
      expect(qrState(fixture)).toBe('result');
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Back Camera')];

      fixture.componentInstance.rescan();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('scanning');
    });
  });

  // --- 4. Manual code entry tab -------------------------------------------

  describe('manual code entry tab', () => {
    it('defaults to the "code" tab', () => {
      const fixture = createFixture();
      expect(fixture.componentInstance['mode']()).toBe('code');
      expect(fixture.nativeElement.querySelector('.join-form')).toBeTruthy();
    });

    it('forceUppercase() upper-cases the input value as the user types', () => {
      const fixture = createFixture();
      const input = document.createElement('input');
      input.value = 'abc234';

      fixture.componentInstance.forceUppercase(input);

      expect(input.value).toBe('ABC234');
    });

    it('rejects submitting an empty code without calling the service', async () => {
      const fixture = createFixture();
      const form = fixture.nativeElement.querySelector('.join-form') as HTMLFormElement;
      const codeInput = fixture.nativeElement.querySelector('#code') as HTMLInputElement;
      codeInput.value = '   ';

      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();
      fixture.detectChanges();

      expect(requestToJoinByCodeMock).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
        'Introduce un código',
      );
    });

    it('submits a trimmed code and shows the success message, clearing the input', async () => {
      const fixture = createFixture();
      requestToJoinByCodeMock.mockResolvedValue({ data: makeInviteResult(false), error: null });
      const form = fixture.nativeElement.querySelector('.join-form') as HTMLFormElement;
      const codeInput = fixture.nativeElement.querySelector('#code') as HTMLInputElement;
      codeInput.value = 'ABC234';

      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();
      fixture.detectChanges();

      expect(requestToJoinByCodeMock).toHaveBeenCalledWith('ABC234');
      expect(codeInput.value).toBe('');
      expect(fixture.nativeElement.querySelector('.alert-success')?.textContent).toContain(
        'Solicitud enviada correctamente',
      );
    });

    it('shows the "already pending" warning without clearing the input on already-pending', async () => {
      const fixture = createFixture();
      requestToJoinByCodeMock.mockResolvedValue({ data: makeInviteResult(true), error: null });
      const form = fixture.nativeElement.querySelector('.join-form') as HTMLFormElement;
      const codeInput = fixture.nativeElement.querySelector('#code') as HTMLInputElement;
      codeInput.value = 'ABC234';

      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.alert-warning')?.textContent).toContain(
        'Ya tenías una solicitud pendiente',
      );
    });

    it.each([
      ['invalid invitation code', 'Ese código de invitación no existe.'],
      ['already a member', 'Ya eres miembro de esta lista.'],
      ['already own this list', 'Ese código pertenece a una lista que ya es tuya.'],
      ['some other backend message', 'No se ha podido enviar la solicitud. Inténtalo de nuevo.'],
    ])('maps the backend error %j to "%s"', async (backendMessage, expectedText) => {
      const fixture = createFixture();
      requestToJoinByCodeMock.mockResolvedValue({
        data: null,
        error: { message: backendMessage },
      });
      const form = fixture.nativeElement.querySelector('.join-form') as HTMLFormElement;
      const codeInput = fixture.nativeElement.querySelector('#code') as HTMLInputElement;
      codeInput.value = 'ABC234';

      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
        expectedText,
      );
    });
  });

  // --- Mode switching / cleanup --------------------------------------------

  describe('switching between the code and QR tabs', () => {
    it('stops the camera and resets QR state when leaving the QR tab', async () => {
      const fixture = createFixture();
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Back Camera')];
      await flushMicrotasks();
      fixture.detectChanges();
      expect(qrState(fixture)).toBe('scanning');

      fixture.componentInstance.setMode('code');
      fixture.detectChanges();

      expect(scanner.stop).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance['mode']()).toBe('code');
      expect(fixture.componentInstance['availableDevices']()).toEqual([]);
    });

    it('switching to the tab that is already active is a no-op', () => {
      const fixture = createFixture();

      fixture.componentInstance.setMode('code');

      expect(fixture.componentInstance['mode']()).toBe('code');
    });

    it('re-entering the QR tab re-checks camera permission from scratch', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const fixture = createFixture();
      const firstScanner = openQrTab(fixture);
      firstScanner.devicesOnNextLoad = [makeDevice('cam-1', 'Back Camera')];
      await flushMicrotasks();
      fixture.detectChanges();
      expect(qrState(fixture)).toBe('scanning');

      fixture.componentInstance.setMode('code');
      fixture.detectChanges();

      mockPermissionsQuery('denied');
      fixture.componentInstance.setMode('qr');
      fixture.detectChanges();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(qrState(fixture)).toBe('unavailable');
    });
  });

  describe('teardown', () => {
    it('stops the camera when the component is destroyed while scanning', async () => {
      mockPermissionsQuery('granted');
      mockGetUserMedia('success');
      const fixture = createFixture();
      const scanner = openQrTab(fixture);
      scanner.devicesOnNextLoad = [makeDevice('cam-1', 'Back Camera')];
      await flushMicrotasks();
      fixture.detectChanges();

      fixture.destroy();

      expect(scanner.stop).toHaveBeenCalled();
    });
  });
});
