import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth.service';

@Component({
  selector: 'app-logout-button',
  template: `
    @if (user()) {
      <button type="button" (click)="signOut()">Cerrar sesión</button>
    }
  `,
  styles: `
    button {
      min-height: 44px;
      padding: var(--space-sm) var(--space-md);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background-color: var(--color-surface-raised);
      color: var(--color-text);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      transition: background-color var(--transition-fast);
    }

    button:hover {
      background-color: var(--overlay-hover);
    }

    button:active {
      background-color: var(--overlay-active);
    }
  `,
})
export class LogoutButton {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.authService.user;

  async signOut(): Promise<void> {
    try {
      await this.authService.signOut();
    } finally {
      await this.router.navigateByUrl('/login');
    }
  }
}
