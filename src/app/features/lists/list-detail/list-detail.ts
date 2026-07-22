import { Component } from '@angular/core';

@Component({
  selector: 'app-list-detail',
  template: `<p class="list-detail-placeholder">Detalle de la lista, próximamente.</p>`,
  styles: `
    .list-detail-placeholder {
      padding: var(--space-lg) var(--space-md);
      color: var(--color-text-muted);
    }
  `,
})
export class ListDetail {}
