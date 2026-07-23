import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';
import { guestGuard } from './core/guest.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'lists',
    pathMatch: 'full',
  },
  {
    path: 'lists',
    loadComponent: () => import('./features/lists/lists').then((m) => m.Lists),
    canActivate: [authGuard],
  },
  {
    path: 'lists/:id',
    loadComponent: () =>
      import('./features/lists/list-detail/list-detail').then((m) => m.ListDetail),
    canActivate: [authGuard],
  },
  {
    path: 'lists/:id/invite',
    loadComponent: () =>
      import('./features/lists/list-invite/list-invite').then((m) => m.ListInvite),
    canActivate: [authGuard],
  },
  {
    path: 'join',
    loadComponent: () => import('./features/lists/join-list/join-list').then((m) => m.JoinList),
    canActivate: [authGuard],
  },
  {
    path: 'invitations',
    loadComponent: () =>
      import('./features/invitations/invitations').then((m) => m.Invitations),
    canActivate: [authGuard],
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
    canActivate: [guestGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
    canActivate: [guestGuard],
  },
];
