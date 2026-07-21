import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: '../auth-form.css',
})
export class Login {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  protected readonly isSubmitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly loggedIn = signal(false);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.serverError.set(null);

    const { email, password } = this.form.getRawValue();
    const { error } = await this.authService.signIn(email, password);

    this.isSubmitting.set(false);

    if (error) {
      this.serverError.set(this.toReadableError(error.message));
      return;
    }

    this.loggedIn.set(true);
    this.form.reset();
  }

  private toReadableError(message: string): string {
    const normalized = message.toLowerCase();

    if (normalized.includes('invalid login credentials')) {
      return 'Email o contraseña incorrectos.';
    }

    return 'No se ha podido iniciar sesión. Inténtalo de nuevo.';
  }
}
