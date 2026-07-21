import { Injectable, computed, inject, signal } from '@angular/core';
import type { AuthResponse, AuthTokenResponsePassword, Session, User } from '@supabase/supabase-js';

import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabaseService = inject(SupabaseService);

  private readonly sessionSignal = signal<Session | null>(null);

  readonly session = this.sessionSignal.asReadonly();
  readonly user = computed<User | null>(() => this.sessionSignal()?.user ?? null);

  private resolveReady!: () => void;
  /** Resolves once the initial session has been loaded, so guards don't race the async `getSession()` call on page load. */
  readonly ready = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor() {
    this.supabaseService.client.auth.getSession().then(({ data }) => {
      this.sessionSignal.set(data.session);
      this.resolveReady();
    });

    this.supabaseService.client.auth.onAuthStateChange((_event, session) => {
      this.sessionSignal.set(session);
    });
  }

  signUp(
    email: string,
    password: string,
    username: string,
    firstName: string,
    lastName: string,
  ): Promise<AuthResponse> {
    return this.supabaseService.client.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          first_name: firstName,
          last_name: lastName,
        },
      },
    });
  }

  signIn(email: string, password: string): Promise<AuthTokenResponsePassword> {
    return this.supabaseService.client.auth.signInWithPassword({ email, password });
  }

  signOut() {
    return this.supabaseService.client.auth.signOut();
  }
}
