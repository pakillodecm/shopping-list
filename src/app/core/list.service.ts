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

export type MyMembershipChange =
  | { eventType: 'INSERT'; listId: string }
  | { eventType: 'DELETE'; listId: string };

export interface LeaveListResult {
  list_deleted: boolean;
  new_owner_id: string | null;
}

export interface MemberProfile {
  username: string;
  first_name: string;
  last_name: string;
}

export interface ListMember {
  user_id: string;
  joined_at: string;
  profile: MemberProfile;
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

  // leave_list returns which outcome happened (list_deleted / new_owner_id)
  // rather than leaving it to the caller to infer from context — see the
  // leave_list comment in schema.sql for why (same already_pending
  // criterion as invite_user_to_list/request_to_join_by_code in Stage 5).
  leaveList(listId: string, successorId?: string) {
    return this.supabaseService.client
      .rpc('leave_list', { p_list_id: listId, p_successor_id: successorId ?? null })
      .single<LeaveListResult>();
  }

  // remove_member returns void — unlike leave_list there's no ambiguous
  // outcome to report back, it's always just "that membership is gone".
  removeMember(listId: string, userId: string) {
    return this.supabaseService.client.rpc('remove_member', {
      p_list_id: listId,
      p_user_id: userId,
    });
  }

  // Ordered by joined_at ascending so a caller building a successor picker
  // (Stage 6) can label/preselect "the oldest member" the same way leave_list
  // itself breaks ties server-side, without duplicating that logic. Same
  // profile embed pattern as getPendingRequestsForList in InvitationService.
  async getListMembers(listId: string) {
    const { data, error } = await this.supabaseService.client
      .from('memberships')
      .select('user_id, joined_at, profile:profiles(username, first_name, last_name)')
      .eq('list_id', listId)
      .order('joined_at', { ascending: true })
      .overrideTypes<ListMember[], { merge: false }>();

    return { data, error };
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

  // A single list's own row, for a screen that only cares about one list at
  // a time (list-detail) rather than "all my lists". Unlike subscribeToLists
  // above, `id` is a plain column here, so — unlike the no-filter "owner or
  // member" case — this CAN be filtered server-side to exactly this row.
  // That also means no isRealMembershipChange-style guard is needed: RLS
  // scopes who receives this row's events to whoever could already read it
  // via getList() (owner, member, or pending invitee — see has_pending_invite
  // in schema.sql), so this subscription can't leak anything the initial
  // fetch didn't already allow.
  subscribeToList(
    listId: string,
    onChange: (change: ListChange) => void,
    onReconnect: () => void,
  ): RealtimeChannel {
    return this.supabaseService.client
      .channel(`lists:detail:${listId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lists', filter: `id=eq.${listId}` },
        (payload: RealtimePostgresChangesPayload<List>) => {
          const eventType = payload.eventType;
          const item = (eventType === 'DELETE' ? payload.old : payload.new) as List;
          onChange({ eventType, item });
        },
      )
      .subscribe(createReconnectHandler(onReconnect));
  }

  // Gaining access to a list (approved join request, accepted invite) is an
  // INSERT on `memberships`, not on `lists` — the list row itself doesn't
  // change, so subscribeToLists() above never fires for it. Losing access
  // (leave_list, or the future "remove member") is symmetrically a DELETE on
  // `memberships` rather than anything on `lists` either — the list keeps
  // existing for everyone else. Both are filtered by user_id (a plain
  // column, like membership_requests) so this only reacts to the current
  // user's own membership rows; UPDATE is never handled because memberships
  // rows are never updated anywhere in the app (only inserted on
  // join/accept/approve, deleted on leave).
  subscribeToMyMemberships(
    onChange: (change: MyMembershipChange) => void,
    onReconnect: () => void,
  ): RealtimeChannel {
    const userId = this.authService.user()?.id ?? null;

    return this.supabaseService.client
      .channel(`memberships:mine:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memberships', filter: `user_id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<Membership>) => {
          const eventType = payload.eventType;
          if (eventType !== 'INSERT' && eventType !== 'DELETE') {
            return;
          }
          const row = (eventType === 'DELETE' ? payload.old : payload.new) as Membership;
          onChange({ eventType, listId: row.list_id });
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
