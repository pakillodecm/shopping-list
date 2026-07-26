import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('reads "light" as the initial theme when <html> has no data-theme attribute', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('light');
  });

  it('reads "dark" as the initial theme when <html> already has data-theme="dark" (set by the inline anti-FOUC script)', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
  });

  it('toggle() switches from light to dark, sets the attribute, and persists the preference', () => {
    const service = TestBed.inject(ThemeService);

    service.toggle();

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('toggle() switches from dark back to light, removes the attribute, and persists the preference', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const service = TestBed.inject(ThemeService);

    service.toggle();

    expect(service.theme()).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
