import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  // Reads the initial value straight from the <html data-theme> attribute
  // instead of re-deriving it from localStorage/matchMedia: the inline
  // script in index.html already decided it (before Angular even
  // bootstraps, to avoid a flash of the wrong theme), so this is the one
  // and only place that "saved preference vs. OS preference" logic lives.
  private readonly themeSignal = signal<Theme>(
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  );

  readonly theme = this.themeSignal.asReadonly();

  toggle(): void {
    this.setTheme(this.themeSignal() === 'dark' ? 'light' : 'dark');
  }

  private setTheme(theme: Theme): void {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    localStorage.setItem(STORAGE_KEY, theme);
    this.themeSignal.set(theme);
  }
}
