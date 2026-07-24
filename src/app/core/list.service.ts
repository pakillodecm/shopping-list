import { Injectable, inject } from '@angular/core';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { AuthService } from './auth.service';
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

interface MembershipWithList {
  list: List;
}

interface Membership {
  id: string;
  user_id: string;
  list_id: string;
  joined_at: string;
}

@Injectable({ providedIn: 'root' })
export class ListService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  createList(name: string) {
    return this.supabaseService.client
      .rpc('create_list_with_owner', { list_name: name })
      .single<List>();
  }

  // Lists are fetched through `memberships` rather than `select * from
  // lists`, and explicitly filtered by the current user's id: the list
  // owner always has a membership row too (see create_list_with_owner), so
  // this alone determines "my lists" correctly without relying on however
  // much the `lists` RLS policy happens to allow through. That matters
  // because `lists` also grants SELECT to users with a pending INVITE (see
  // has_pending_invite in schema.sql, added for the /invitations screen) —
  // a `select * from lists` would incorrectly include those not-yet-accepted
  // lists here.
  async getMyLists() {
    const userId = this.authService.user()?.id ?? null;

    const { data, error } = await this.supabaseService.client
      .from('memberships')
      .select('list:lists(*)')
      .eq('user_id', userId)
      .overrideTypes<MembershipWithList[], { merge: false }>();

    return {
      data: data ? data.map((membership) => membership.list) : null,
      error,
    };
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

  regenerateInvitationCode(listId: string) {
    return this.supabaseService.client
      .rpc('regenerate_invitation_code', { p_list_id: listId })
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

  // Gaining access to a list (approved join request, accepted invite) is an
  // INSERT on `memberships`, not on `lists` — the list row itself doesn't
  // change, so subscribeToLists() above never fires for it. Filtered by
  // user_id (a plain column, like membership_requests) so this only reacts
  // to the current user's own new memberships. Only INSERT is handled:
  // memberships rows are otherwise immutable in the app as it stands today
  // (no leave/remove-member UI yet — that's Stage 6).
  subscribeToMyMemberships(
    onNewMembership: (listId: string) => void,
    onReconnect: () => void,
  ): RealtimeChannel {
    const userId = this.authService.user()?.id ?? null;

    return this.supabaseService.client
      .channel(`memberships:mine:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'memberships', filter: `user_id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<Membership>) => {
          onNewMembership((payload.new as Membership).list_id);
        },
      )
      .subscribe(createReconnectHandler(onReconnect));
  }

  unsubscribeFromMemberships(channel: RealtimeChannel): void {
    this.supabaseService.client.removeChannel(channel);
  }

  mergeListChange(current: List[], change: ListChange): List[] {
    return mergeChange(current, change);
  }
}
