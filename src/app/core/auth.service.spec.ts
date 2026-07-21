import { TestBed } from '@angular/core/testing';
import type { Session, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

function createSupabaseServiceMock(initialSession: Session | null = null) {
  const authMock = {
    getSession: vi.fn().mockResolvedValue({ data: { session: initialSession } }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };

  return { client: { auth: authMock } };
}

function createFakeSession(user: Partial<User>): Session {
  return { user } as Session;
}

describe('AuthService', () => {
  let supabaseServiceMock: ReturnType<typeof createSupabaseServiceMock>;
  let service: AuthService;

  function setup(initialSession: Session | null = null) {
    TestBed.resetTestingModule();
    supabaseServiceMock = createSupabaseServiceMock(initialSession);
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseServiceMock }],
    });
    service = TestBed.inject(AuthService);
  }

  beforeEach(() => {
    setup();
  });

  it('calls signUp with email, password and profile data in options.data', async () => {
    await service.signUp('ana@example.com', 'password123', 'ana', 'Ana', 'García');

    expect(supabaseServiceMock.client.auth.signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'password123',
      options: {
        data: {
          username: 'ana',
          first_name: 'Ana',
          last_name: 'García',
        },
      },
    });
  });

  it('calls signIn with email and password', async () => {
    await service.signIn('ana@example.com', 'password123');

    expect(supabaseServiceMock.client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'password123',
    });
  });

  it('calls signOut with no arguments', async () => {
    await service.signOut();

    expect(supabaseServiceMock.client.auth.signOut).toHaveBeenCalledWith();
  });

  it('derives user() as null when there is no session', async () => {
    await service.ready;

    expect(service.user()).toBeNull();
  });

  it('derives user() from the initial session once ready resolves', async () => {
    const user = { id: 'user-1', email: 'ana@example.com' } as User;
    setup(createFakeSession(user));

    await service.ready;

    expect(service.user()).toEqual(user);
  });

  it('updates user() when onAuthStateChange fires with a new session', async () => {
    await service.ready;
    expect(service.user()).toBeNull();

    const user = { id: 'user-2', email: 'nueva@example.com' } as User;
    const onAuthStateChangeCallback = supabaseServiceMock.client.auth.onAuthStateChange.mock.calls[0][0];
    onAuthStateChangeCallback('SIGNED_IN', createFakeSession(user));

    expect(service.user()).toEqual(user);
  });
});
