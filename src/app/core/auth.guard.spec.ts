import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  function setup(user: { id: string } | null) {
    const authServiceMock = { ready: Promise.resolve(), user: () => user };
    const loginUrlTree = {} as UrlTree;
    const routerMock = { createUrlTree: vi.fn().mockReturnValue(loginUrlTree) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    return { routerMock, loginUrlTree };
  }

  it('allows navigation when there is a logged-in user', async () => {
    setup({ id: 'user-1' });

    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));

    expect(result).toBe(true);
  });

  it('redirects to /login when there is no user', async () => {
    const { routerMock, loginUrlTree } = setup(null);

    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).toBe(loginUrlTree);
  });
});
