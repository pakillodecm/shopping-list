import { Injectable, inject } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

export interface ListItem {
  id: string;
  list_id: string;
  product_id: string | null;
  author_id: string | null;
  text: string;
  checked: boolean;
  created_at: string;
  modified_at: string;
}

@Injectable({ providedIn: 'root' })
export class ItemService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  getItems(listId: string) {
    return this.supabaseService.client
      .from('list_items')
      .select('*')
      .eq('list_id', listId)
      .order('created_at', { ascending: true })
      .overrideTypes<ListItem[], { merge: false }>();
  }

  addItem(listId: string, text: string) {
    const authorId = this.authService.user()?.id ?? null;

    return this.supabaseService.client
      .from('list_items')
      .insert({ list_id: listId, text, author_id: authorId })
      .select()
      .single<ListItem>();
  }

  toggleChecked(itemId: string, checked: boolean) {
    return this.supabaseService.client
      .from('list_items')
      .update({ checked })
      .eq('id', itemId)
      .select()
      .single<ListItem>();
  }

  updateText(itemId: string, text: string) {
    return this.supabaseService.client
      .from('list_items')
      .update({ text })
      .eq('id', itemId)
      .select()
      .single<ListItem>();
  }

  deleteItem(itemId: string) {
    return this.supabaseService.client.from('list_items').delete().eq('id', itemId);
  }

  mergeItemChange(
    current: ListItem[],
    change: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; item: ListItem },
  ): ListItem[] {
    if (change.eventType === 'DELETE') {
      return current.filter((item) => item.id !== change.item.id);
    }

    const index = current.findIndex((item) => item.id === change.item.id);

    if (index === -1) {
      return [...current, change.item];
    }

    if (change.item.modified_at < current[index].modified_at) {
      return current;
    }

    return current.map((item, i) => (i === index ? change.item : item));
  }
}
