import { Component, computed, inject } from '@angular/core';

import { AuthService } from '../../core/auth.service';
import { LogoutButton } from '../auth/logout-button/logout-button';

@Component({
  selector: 'app-home',
  imports: [LogoutButton],
  template: `
    <div class="home">
      <header class="home-header">
        <h1>Bienvenido</h1>
        <app-logout-button />
      </header>
      <p>{{ welcomeMessage() }}</p>
    </div>
  `,
  styles: `
    .home {
      width: 100%;
      padding: var(--space-lg) var(--space-md);
    }

    .home-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-md);
      margin-bottom: var(--space-md);
    }

    h1 {
      font-size: var(--font-size-xl);
      margin: 0;
    }

    p {
      color: var(--color-text-muted);
    }
  `,
})
export class Home {
  private readonly authService = inject(AuthService);

  protected readonly welcomeMessage = computed(() => {
    const email = this.authService.user()?.email;
    return email ? `Has iniciado sesión como ${email}.` : 'Has iniciado sesión.';
  });
}
