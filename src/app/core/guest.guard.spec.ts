import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { guestGuard } from './guest.guard';

describe('guestGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  function setup(user: { id: string } | null) {
    const authServiceMock = { ready: Promise.resolve(), user: () => user };
    const homeUrlTree = {} as UrlTree;
    const routerMock = { createUrlTree: vi.fn().mockReturnValue(homeUrlTree) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    return { routerMock, homeUrlTree };
  }

  it('allows navigation when there is no logged-in user', async () => {
    setup(null);

    const result = await TestBed.runInInjectionContext(() => guestGuard(route, state));

    expect(result).toBe(true);
  });

  it('redirects to / when there is a logged-in user', async () => {
    const { routerMock, homeUrlTree } = setup({ id: 'user-1' });

    const result = await TestBed.runInInjectionContext(() => guestGuard(route, state));

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/']);
    expect(result).toBe(homeUrlTree);
  });
});
