import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth.service';

export const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: '../auth-form.css',
})
export class Register {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isSubmitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.serverError.set(null);

    const { email, username, password, firstName, lastName } = this.form.getRawValue();
    const { error } = await this.authService.signUp(email, password, username, firstName, lastName);

    if (error) {
      this.isSubmitting.set(false);
      this.serverError.set(this.toReadableError(error.message));
      return;
    }

    await this.router.navigateByUrl('/');
  }

  private toReadableError(message: string): string {
    const normalized = message.toLowerCase();

    if (
      normalized.includes('already registered') ||
      normalized.includes('already exists') ||
      normalized.includes('duplicate') ||
      normalized.includes('unique')
    ) {
      return 'Ese email o nombre de usuario ya está en uso.';
    }

    return 'No se ha podido completar el registro. Inténtalo de nuevo.';
  }
}
