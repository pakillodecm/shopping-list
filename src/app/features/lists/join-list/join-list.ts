import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  NgxScannerQrcodeComponent,
  ScannerQRCodeConfig,
  ScannerQRCodeDevice,
  ScannerQRCodeResult,
  ScannerQRCodeSymbolType,
} from 'ngx-scanner-qrcode';
import type { Subscription } from 'rxjs';

import { InvitationService } from '../../../core/invitation.service';

type JoinMode = 'code' | 'qr';

// Camera lifecycle for the QR tab. 'starting' covers both the initial
// permission prompt and any later restart (rescan). 'unavailable' is used
// for both permission-denied and no-camera-hardware — CA-13.7 treats them
// identically, so there's no need to tell them apart in the UI.
type QrState =
  | 'starting'
  | 'scanning'
  | 'looking-up'
  | 'unavailable'
  | 'invalid-code'
  | 'confirming'
  | 'result';

@Component({
  selector: 'app-join-list',
  imports: [RouterLink, NgxScannerQrcodeComponent],
  templateUrl: './join-list.html',
  styleUrl: './join-list.css',
})
export class JoinList implements OnDestroy {
  private readonly invitationService = inject(InvitationService);

  protected readonly mode = signal<JoinMode>('code');

  protected readonly isJoining = signal(false);
  protected readonly joinError = signal<string | null>(null);
  protected readonly joinResult = signal<{ message: string; alreadyPending: boolean } | null>(
    null,
  );

  // The wasm asset is served from public/ via the angular.json asset entry
  // copying node_modules/ngx-scanner-qrcode/wasm/ (see its README). Restricted
  // to QR_CODE only: this scanner reads a grocery-list invitation code, not a
  // product barcode.
  protected readonly scannerConfig: ScannerQRCodeConfig = {
    loadWasmUrl: 'assets/wasm/ngx-scanner-qrcode.wasm',
    symbolType: [ScannerQRCodeSymbolType.ScannerQRCode_QRCODE],
  };

  protected readonly qrState = signal<QrState>('starting');
  protected readonly cameraVisible = computed(
    () => this.qrState() === 'starting' || this.qrState() === 'scanning',
  );
  protected readonly qrLookupErrorMessage = signal('Este código QR no es válido.');
  protected readonly scannedListName = signal<string | null>(null);
  protected readonly availableDevices = signal<ScannerQRCodeDevice[]>([]);
  private scannedCode: string | null = null;

  private readonly scannerRef = viewChild<NgxScannerQrcodeComponent>('scanner');
  private readonly confirmButtonRef = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  private readonly invalidRescanButtonRef =
    viewChild<ElementRef<HTMLButtonElement>>('invalidRescanButton');
  private readonly resultRescanButtonRef =
    viewChild<ElementRef<HTMLButtonElement>>('resultRescanButton');

  // Tracks which NgxScannerQrcodeComponent instance we've already started —
  // a fresh instance is created each time the QR tab mounts (@if in the
  // template), and we only want to kick off the camera once per mount.
  private boundScanner: NgxScannerQrcodeComponent | null = null;
  private devicesSubscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const scanner = this.scannerRef();

      if (scanner && scanner !== this.boundScanner) {
        this.boundScanner = scanner;
        this.watchDevices(scanner);
        this.startScanning(scanner);
      }

      if (!scanner) {
        this.boundScanner = null;
      }
    });

    // Move focus to whichever action button just appeared, so keyboard/
    // screen-reader users notice the new state instead of it appearing
    // silently mid-page (only one of these three is ever rendered at a
    // time, driven by the @switch in the template).
    effect(() => {
      this.confirmButtonRef()?.nativeElement.focus();
      this.invalidRescanButtonRef()?.nativeElement.focus();
      this.resultRescanButtonRef()?.nativeElement.focus();
    });
  }

  ngOnDestroy(): void {
    this.scannerRef()?.stop();
    this.devicesSubscription?.unsubscribe();
  }

  setMode(mode: JoinMode): void {
    if (this.mode() === mode) {
      return;
    }

    if (this.mode() === 'qr') {
      // NgxScannerQrcodeComponent's own ngOnDestroy only pauses the video,
      // it doesn't release the camera track — stop() is what does that, so
      // it must be called explicitly before the @if unmounts the element,
      // otherwise the camera light stays on after leaving this tab.
      this.scannerRef()?.stop();
      this.devicesSubscription?.unsubscribe();
      this.devicesSubscription = null;
      this.boundScanner = null;
      this.qrState.set('starting');
      this.scannedCode = null;
      this.scannedListName.set(null);
      this.availableDevices.set([]);
    }

    this.joinError.set(null);
    this.joinResult.set(null);
    this.mode.set(mode);
  }

  forceUppercase(input: HTMLInputElement): void {
    input.value = input.value.toUpperCase();
  }

  async submitJoin(event: SubmitEvent, codeInput: HTMLInputElement): Promise<void> {
    event.preventDefault();

    const code = codeInput.value.trim();
    if (!code) {
      this.joinError.set('Introduce un código de invitación.');
      this.joinResult.set(null);
      return;
    }

    await this.requestJoin(code);

    if (this.joinResult()) {
      codeInput.value = '';
    }
  }

  onScan(results: ScannerQRCodeResult[]): void {
    if (this.qrState() !== 'scanning' || results.length === 0) {
      return;
    }

    // Stop immediately: this library scans continuously and would keep
    // re-emitting the same result every ~100ms while the code stays in
    // frame, but the design here is "detect once, then ask for confirmation".
    this.scannerRef()?.stop();

    const code = results[0].value?.trim();
    if (!code) {
      this.qrLookupErrorMessage.set('Este código QR no es válido.');
      this.qrState.set('invalid-code');
      return;
    }

    void this.lookupScannedCode(code);
  }

  async confirmJoinFromQr(): Promise<void> {
    const code = this.scannedCode;
    if (!code) {
      return;
    }

    await this.requestJoin(code);
    this.qrState.set('result');
  }

  cancelQrConfirm(): void {
    this.scannedCode = null;
    this.scannedListName.set(null);
    this.rescan();
  }

  rescan(): void {
    this.joinError.set(null);
    this.joinResult.set(null);

    const scanner = this.scannerRef();
    if (scanner) {
      this.startScanning(scanner);
    }
  }

  switchCamera(event: Event): void {
    const deviceId = (event.target as HTMLSelectElement).value;
    this.scannerRef()?.playDevice(deviceId).subscribe();
  }

  private async lookupScannedCode(code: string): Promise<void> {
    this.qrState.set('looking-up');

    const { data, error } = await this.invitationService.getListNameByCode(code);

    if (error) {
      this.qrLookupErrorMessage.set('No se ha podido comprobar este código. Inténtalo de nuevo.');
      this.qrState.set('invalid-code');
      return;
    }

    if (!data) {
      this.qrLookupErrorMessage.set('Este código QR no es válido.');
      this.qrState.set('invalid-code');
      return;
    }

    this.scannedCode = code;
    this.scannedListName.set(data);
    this.qrState.set('confirming');
  }

  private async requestJoin(code: string): Promise<void> {
    this.isJoining.set(true);
    this.joinError.set(null);
    this.joinResult.set(null);

    const { data, error } = await this.invitationService.requestToJoinByCode(code);

    this.isJoining.set(false);

    if (error) {
      this.joinError.set(this.toReadableJoinError(error.message));
      return;
    }

    if (!data) {
      this.joinError.set('No se ha podido enviar la solicitud. Inténtalo de nuevo.');
      return;
    }

    this.joinResult.set({
      message: data.already_pending
        ? 'Ya tenías una solicitud pendiente para esta lista.'
        : 'Solicitud enviada correctamente. El propietario de la lista debe aprobarla.',
      alreadyPending: data.already_pending,
    });
  }

  // Picks the back/rear/environment-labelled camera when there's more than
  // one, falling back to the last device in the list — on phones with
  // exactly two cameras, enumerateDevices() conventionally lists front
  // before back, and labels are only reliably populated after permission is
  // granted (which, at this point, it already is).
  private pickBackCameraDeviceId(devices: ScannerQRCodeDevice[]): string | undefined {
    const backCamera = devices.find((device) => /back|rear|environment/i.test(device.label));
    return (backCamera ?? devices.at(-1) ?? devices[0])?.deviceId;
  }

  // start()'s own AsyncSubject resolves as soon as a device list is found —
  // it does NOT wait for the actual camera stream to open when a custom
  // device-selection callback is passed (that's this library's behavior,
  // not a choice made here). So actual success/failure has to be read off
  // playDevice()'s own AsyncSubject inside the callback, while start()'s
  // subscription is only relied on for the "no camera / no permission at
  // all" failure case.
  private startScanning(scanner: NgxScannerQrcodeComponent): void {
    this.qrState.set('starting');

    scanner
      .start((devices: ScannerQRCodeDevice[]) => {
        const deviceId = this.pickBackCameraDeviceId(devices);
        if (!deviceId) {
          this.qrState.set('unavailable');
          return;
        }

        scanner.playDevice(deviceId).subscribe({
          next: (ok: boolean) => this.qrState.set(ok ? 'scanning' : 'unavailable'),
          error: () => this.qrState.set('unavailable'),
        });
      })
      .subscribe({
        error: () => this.qrState.set('unavailable'),
      });
  }

  private watchDevices(scanner: NgxScannerQrcodeComponent): void {
    this.devicesSubscription?.unsubscribe();
    this.devicesSubscription = scanner.devices.subscribe((devices) => {
      this.availableDevices.set(devices ?? []);
    });
  }

  private toReadableJoinError(message: string): string {
    const normalized = message.toLowerCase();

    if (normalized.includes('invalid invitation code')) {
      return 'Ese código de invitación no existe.';
    }

    if (normalized.includes('already a member')) {
      return 'Ya eres miembro de esta lista.';
    }

    if (normalized.includes('already own this list')) {
      return 'Ese código pertenece a una lista que ya es tuya.';
    }

    return 'No se ha podido enviar la solicitud. Inténtalo de nuevo.';
  }
}
