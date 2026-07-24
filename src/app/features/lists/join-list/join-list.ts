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

// Camera lifecycle for the QR tab.
// - 'checking-permission': querying navigator.permissions before deciding
//   what to show — see checkCameraPermission().
// - 'prompt-intro': permission has never been asked (or the platform can't
//   tell us) — show our own explanation before triggering the browser's
//   native prompt, rather than firing it the instant the tab opens.
// - 'starting' covers both the initial getUserMedia call and any later
//   restart (rescan).
// - 'unavailable' is used for both permission-denied and no-camera-hardware
//   — CA-13.7 treats them identically, so there's no need to tell them
//   apart in the UI.
type QrState =
  | 'checking-permission'
  | 'prompt-intro'
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

  protected readonly qrState = signal<QrState>('checking-permission');
  protected readonly cameraVisible = computed(
    () => this.qrState() === 'starting' || this.qrState() === 'scanning',
  );
  protected readonly qrLookupErrorMessage = signal('Este código QR no es válido.');
  protected readonly scannedListName = signal<string | null>(null);
  protected readonly availableDevices = signal<ScannerQRCodeDevice[]>([]);
  private scannedCode: string | null = null;

  private readonly scannerRef = viewChild<NgxScannerQrcodeComponent>('scanner');
  private readonly introContinueButtonRef =
    viewChild<ElementRef<HTMLButtonElement>>('introContinueButton');
  private readonly confirmButtonRef = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  private readonly invalidRescanButtonRef =
    viewChild<ElementRef<HTMLButtonElement>>('invalidRescanButton');
  private readonly resultRescanButtonRef =
    viewChild<ElementRef<HTMLButtonElement>>('resultRescanButton');

  // Tracks which NgxScannerQrcodeComponent instance we've already started —
  // a fresh instance is created each time the QR tab mounts (@if in the
  // template), and we only want to kick off the permission check once per
  // mount.
  private boundScanner: NgxScannerQrcodeComponent | null = null;
  private devicesSubscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const scanner = this.scannerRef();

      if (scanner && scanner !== this.boundScanner) {
        this.boundScanner = scanner;
        this.watchDevices(scanner);
        void this.beginQrFlow(scanner);
      }

      if (!scanner) {
        this.boundScanner = null;
      }
    });

    // Move focus to whichever action button just appeared, so keyboard/
    // screen-reader users notice the new state instead of it appearing
    // silently mid-page (only one of these four is ever rendered at a
    // time, driven by the @switch in the template).
    effect(() => {
      this.introContinueButtonRef()?.nativeElement.focus();
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
      this.qrState.set('checking-permission');
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

  // Bound to the "Continuar" button on the prompt-intro screen — this is
  // the user gesture that's allowed to trigger the browser's native
  // permission dialog, rather than firing it automatically the instant the
  // tab opens.
  startCameraFromIntro(): void {
    const scanner = this.scannerRef();
    if (scanner) {
      void this.startScanning(scanner);
    }
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

    // Permission was already resolved earlier this mount (this path is
    // only reachable after a completed scan attempt) — go straight back to
    // the camera instead of re-showing the intro screen.
    const scanner = this.scannerRef();
    if (scanner) {
      void this.startScanning(scanner);
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

  // Decides the QR tab's initial screen without ever firing the browser's
  // native permission dialog on its own:
  // - 'denied' -> straight to the unavailable state (CA-13.7); no button
  //   is offered that we already know would fail.
  // - 'granted' -> straight to the camera, no intermediate screen.
  // - 'prompt' (including "we couldn't tell") -> show our own explanation
  //   first; the actual request only fires from startCameraFromIntro(),
  //   in response to the user's own "Continuar" tap.
  private async beginQrFlow(scanner: NgxScannerQrcodeComponent): Promise<void> {
    this.qrState.set('checking-permission');
    const permission = await this.checkCameraPermission();

    if (permission === 'denied') {
      this.qrState.set('unavailable');
      return;
    }

    if (permission === 'granted') {
      await this.startScanning(scanner);
      return;
    }

    this.qrState.set('prompt-intro');
  }

  // navigator.permissions.query({name: 'camera'}) lets us know the current
  // state WITHOUT triggering the native prompt — but it's only reliable on
  // Chromium (desktop and Android), which persists camera permission
  // per-origin. Safari (macOS and iOS) does not persist camera permission
  // for regular web pages and is documented to report 'prompt' even when
  // access was already granted earlier in the same session (see
  // https://github.com/w3c/mediacapture-main/issues/928) — so on Safari
  // this will practically always resolve to 'prompt', and the intro screen
  // below will show every time rather than being skipped on repeat visits.
  // That's not a broken feature, just the "never asked" path taken more
  // often — the intro screen is a fully working, correct experience either
  // way. Any browser without navigator.permissions at all, or that throws
  // for the 'camera' name, is treated the same as 'prompt'.
  private async checkCameraPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    if (!navigator.permissions?.query) {
      return 'prompt';
    }

    try {
      const status = await navigator.permissions.query({ name: 'camera' });
      return status.state === 'granted' || status.state === 'denied' ? status.state : 'prompt';
    } catch {
      return 'prompt';
    }
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

  // Requests the camera and starts scanning, deliberately NOT using the
  // library's own start(playDeviceCustom) orchestration.
  //
  // Root cause of the "granted, but still shows unavailable" bug: this
  // library populates its `devices` BehaviorSubject via its OWN
  // enumerateDevices() call, kicked off from ngOnInit only once its wasm
  // asset finishes loading — a network fetch that races independently
  // against however long the user takes to answer the native permission
  // dialog. start(playDeviceCustom)'s AsyncSubject resolves as soon as
  // *some* device list is read (even an empty, not-yet-populated one), and
  // if that read happens to land before the wasm-gated enumeration
  // finishes, playDeviceOptinal() sees zero devices and reports "No camera
  // detected" — misreporting an empty list as no hardware, regardless of
  // what the user just answered. On top of that, device labels are only
  // populated by enumerateDevices() calls made AFTER permission is granted;
  // an enumeration that ran earlier (e.g. before the dialog was answered)
  // would return entries with blank labels, breaking back-camera detection
  // even when the device count happened to be right.
  //
  // Fix: do the sequencing ourselves. Wait for our own getUserMedia() probe
  // to fully settle (this IS the permission prompt, if it hasn't been
  // answered yet), then explicitly trigger a fresh enumeration and wait for
  // its result before ever touching device selection — removing both
  // races at once.
  private async startScanning(scanner: NgxScannerQrcodeComponent): Promise<void> {
    this.qrState.set('starting');

    let probeStream: MediaStream;
    try {
      probeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {
      this.qrState.set('unavailable');
      return;
    }
    probeStream.getTracks().forEach((track) => track.stop());

    const devices = await this.waitForFreshDevices(scanner);
    const deviceId = this.pickBackCameraDeviceId(devices);

    if (!deviceId) {
      this.qrState.set('unavailable');
      return;
    }

    scanner.playDevice(deviceId).subscribe({
      next: (ok: boolean) => this.qrState.set(ok ? 'scanning' : 'unavailable'),
      error: () => this.qrState.set('unavailable'),
    });
  }

  // Triggers a fresh enumeration and resolves with its result, ignoring
  // whatever stale value the `devices` BehaviorSubject already held (that
  // stale value may be empty, or may have blank labels from an enumeration
  // that ran before permission existed — see startScanning() above).
  private waitForFreshDevices(scanner: NgxScannerQrcodeComponent): Promise<ScannerQRCodeDevice[]> {
    return new Promise((resolve) => {
      let skippedStaleValue = false;

      const subscription = scanner.devices.subscribe((devices) => {
        if (!skippedStaleValue) {
          skippedStaleValue = true;
          return;
        }

        subscription.unsubscribe();
        resolve(devices);
      });

      scanner.loadCameraDevices();
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
