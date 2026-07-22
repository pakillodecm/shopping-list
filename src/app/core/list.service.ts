import { Injectable, inject } from '@angular/core';

import { SupabaseService } from './supabase.service';

export interface List {
  id: string;
  owner_id: string;
  name: string;
  invitation_code: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ListService {
  private readonly supabaseService = inject(SupabaseService);

  createList(name: string) {
    return this.supabaseService.client
      .rpc('create_list_with_owner', { list_name: name })
      .overrideTypes<List, { merge: false }>();
  }

  getMyLists() {
    return this.supabaseService.client
      .from('lists')
      .select('*')
      .overrideTypes<List[], { merge: false }>();
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
}
