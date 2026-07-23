import { Injectable, inject } from '@angular/core';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { AuthService } from './auth.service';
import { ChangeEvent, mergeChange } from './merge-change';
import { createReconnectHandler } from './realtime-reconnect';
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

export type ItemChange = ChangeEvent<ListItem>;

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

  subscribeToItems(
    listId: string,
    onChange: (change: ItemChange) => void,
    onReconnect: () => void,
  ): RealtimeChannel {
    return this.supabaseService.client
      .channel(`list_items:${listId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${listId}` },
        (payload: RealtimePostgresChangesPayload<ListItem>) => {
          const eventType = payload.eventType;
          const item = (eventType === 'DELETE' ? payload.old : payload.new) as ListItem;
          onChange({ eventType, item });
        },
      )
      .subscribe(createReconnectHandler(onReconnect));
  }

  unsubscribeFromItems(channel: RealtimeChannel): void {
    this.supabaseService.client.removeChannel(channel);
  }

  mergeItemChange(current: ListItem[], change: ItemChange): ListItem[] {
    return mergeChange(current, change);
  }
}
