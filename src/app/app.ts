import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { LogoutButton } from './features/auth/logout-button/logout-button';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LogoutButton],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
