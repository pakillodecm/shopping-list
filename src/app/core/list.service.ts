import { Injectable, inject } from '@angular/core';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { ChangeEvent, mergeChange } from './merge-change';
import { createReconnectHandler } from './realtime-reconnect';
import { SupabaseService } from './supabase.service';

export interface List {
  id: string;
  owner_id: string;
  name: string;
  invitation_code: string;
  created_at: string;
  modified_at: string;
}

export type ListChange = ChangeEvent<List>;

@Injectable({ providedIn: 'root' })
export class ListService {
  private readonly supabaseService = inject(SupabaseService);

  createList(name: string) {
    return this.supabaseService.client
      .rpc('create_list_with_owner', { list_name: name })
      .single<List>();
  }

  getMyLists() {
    return this.supabaseService.client
      .from('lists')
      .select('*')
      .overrideTypes<List[], { merge: false }>();
  }

  getList(listId: string) {
    return this.supabaseService.client.from('lists').select('*').eq('id', listId).single<List>();
  }

  renameList(listId: string, newName: string) {
    return this.supabaseService.client
      .from('lists')
      .update({ name: newName })
      .eq('id', listId)
      .select()
      .single<List>();
  }

  deleteList(listId: string) {
    return this.supabaseService.client.from('lists').delete().eq('id', listId);
  }

  subscribeToLists(onChange: (change: ListChange) => void, onReconnect: () => void): RealtimeChannel {
    return this.supabaseService.client
      .channel('lists')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lists' },
        (payload: RealtimePostgresChangesPayload<List>) => {
          const eventType = payload.eventType;
          const item = (eventType === 'DELETE' ? payload.old : payload.new) as List;
          onChange({ eventType, item });
        },
      )
      .subscribe(createReconnectHandler(onReconnect));
  }

  unsubscribeFromLists(channel: RealtimeChannel): void {
    this.supabaseService.client.removeChannel(channel);
  }

  mergeListChange(current: List[], change: ListChange): List[] {
    return mergeChange(current, change);
  }
}
