import { Injectable, inject } from '@angular/core';
import type {
  PostgrestError,
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { AuthService } from './auth.service';
import { mergeChange } from './merge-change';
import { createReconnectHandler } from './realtime-reconnect';
import { SupabaseService } from './supabase.service';

export interface MembershipRequest {
  id: string;
  user_id: string;
  list_id: string;
  origin: 'INVITE' | 'REQUEST';
  created_at: string;
}

export interface InviteResult extends MembershipRequest {
  already_pending: boolean;
}

export interface RequesterProfile {
  username: string;
  first_name: string;
  last_name: string;
}

export interface PendingRequest extends MembershipRequest {
  profile: RequesterProfile;
  // membership_requests has no modified_at column — its rows are immutable
  // (inserted once, deleted once; see accept/reject/approve/deny in
  // schema.sql, none of which ever UPDATEs the table). This mirrors
  // created_at purely so the shared mergeChange() realtime helper (already
  // used for list_items/lists) can be reused here without modification.
  modified_at: string;
}

export interface InvitationListSummary {
  name: string;
}

export interface PendingInvitation extends MembershipRequest {
  list: InvitationListSummary;
  modified_at: string;
}

// Realtime payloads for membership_requests carry only the table's own
// columns — never the list/profile embed, which is a PostgREST-time join,
// not something Realtime knows about. So INSERT/UPDATE events need a
// targeted by-id refetch (see fetchPendingInvitationById/fetchPendingRequestById
// below) before they're usable here; a DELETE only ever needs the id, which
// the raw payload already has.
export type PendingInvitationChange =
  | { eventType: 'INSERT' | 'UPDATE'; item: PendingInvitation }
  | { eventType: 'DELETE'; id: string };

export type PendingRequestChange =
  | { eventType: 'INSERT' | 'UPDATE'; item: PendingRequest }
  | { eventType: 'DELETE'; id: string };

@Injectable({ providedIn: 'root' })
export class InvitationService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  inviteUser(listId: string, identifier: string) {
    return this.supabaseService.client
      .rpc('invite_user_to_list', { p_list_id: listId, p_identifier: identifier })
      .single<InviteResult>();
  }

  requestToJoinByCode(code: string) {
    return this.supabaseService.client
      .rpc('request_to_join_by_code', { p_code: code })
      .single<InviteResult>();
  }

  // Read-only lookup used by QR scanning (RF-15, DT-9) to show "join list
  // 'X'?" before the user commits — get_list_name_by_code is a scalar-
  // returning SQL function, so unlike the table-returning RPCs above it
  // needs no .single(): PostgREST already returns the bare text value (or
  // null if the code doesn't exist) as `data`.
  getListNameByCode(
    code: string,
  ): PromiseLike<{ data: string | null; error: PostgrestError | null }> {
    return this.supabaseService.client.rpc('get_list_name_by_code', { p_code: code });
  }

  acceptInvitation(requestId: string) {
    return this.supabaseService.client.rpc('accept_invitation', { p_request_id: requestId });
  }

  rejectInvitation(requestId: string) {
    return this.supabaseService.client.rpc('reject_invitation', { p_request_id: requestId });
  }

  approveJoinRequest(requestId: string) {
    return this.supabaseService.client.rpc('approve_join_request', { p_request_id: requestId });
  }

  denyJoinRequest(requestId: string) {
    return this.supabaseService.client.rpc('deny_join_request', { p_request_id: requestId });
  }

  async getMyPendingInvitations() {
    const userId = this.authService.user()?.id ?? null;

    const { data, error } = await this.supabaseService.client
      .from('membership_requests')
      .select('*, list:lists(name)')
      .eq('user_id', userId)
      .eq('origin', 'INVITE')
      .overrideTypes<Omit<PendingInvitation, 'modified_at'>[], { merge: false }>();

    return {
      data: data ? data.map((row) => ({ ...row, modified_at: row.created_at })) : null,
      error,
    };
  }

  async getPendingRequestsForList(listId: string) {
    const { data, error } = await this.supabaseService.client
      .from('membership_requests')
      .select('*, profile:profiles(username, first_name, last_name)')
      .eq('list_id', listId)
      .eq('origin', 'REQUEST')
      .overrideTypes<Omit<PendingRequest, 'modified_at'>[], { merge: false }>();

    return {
      data: data ? data.map((row) => ({ ...row, modified_at: row.created_at })) : null,
      error,
    };
  }

  private async fetchPendingInvitationById(id: string): Promise<PendingInvitation | null> {
    const { data, error } = await this.supabaseService.client
      .from('membership_requests')
      .select('*, list:lists(name)')
      .eq('id', id)
      .single<Omit<PendingInvitation, 'modified_at'>>();

    if (error || !data) {
      return null;
    }

    return { ...data, modified_at: data.created_at };
  }

  private async fetchPendingRequestById(id: string): Promise<PendingRequest | null> {
    const { data, error } = await this.supabaseService.client
      .from('membership_requests')
      .select('*, profile:profiles(username, first_name, last_name)')
      .eq('id', id)
      .single<Omit<PendingRequest, 'modified_at'>>();

    if (error || !data) {
      return null;
    }

    return { ...data, modified_at: data.created_at };
  }

  // Invitee's own pending invitations (RF-11/RF-12). user_id is a plain
  // column on membership_requests (not a cross-table join like "owner or
  // member" on lists), so — verified, not assumed — it CAN be filtered
  // directly in the postgres_changes filter. origin is checked client-side
  // too since postgres_changes only supports one filter clause per
  // subscription.
  subscribeToMyInvitations(
    onChange: (change: PendingInvitationChange) => void,
    onReconnect: () => void,
  ): RealtimeChannel {
    const userId = this.authService.user()?.id ?? null;

    return this.supabaseService.client
      .channel(`membership_requests:invitee:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'membership_requests',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<MembershipRequest>) => {
          void this.handleInvitationPayload(payload, onChange);
        },
      )
      .subscribe(createReconnectHandler(onReconnect));
  }

  // Pending join requests for a list, as seen by its owner (RF-16/RF-17).
  // list_id is a plain column, filterable directly just like list_id on
  // list_items in Stage 4. origin is checked client-side for the same
  // one-filter-per-subscription reason as above.
  subscribeToListRequests(
    listId: string,
    onChange: (change: PendingRequestChange) => void,
    onReconnect: () => void,
  ): RealtimeChannel {
    return this.supabaseService.client
      .channel(`membership_requests:list:${listId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'membership_requests',
          filter: `list_id=eq.${listId}`,
        },
        (payload: RealtimePostgresChangesPayload<MembershipRequest>) => {
          void this.handleListRequestPayload(payload, onChange);
        },
      )
      .subscribe(createReconnectHandler(onReconnect));
  }

  unsubscribeFromMembershipRequests(channel: RealtimeChannel): void {
    this.supabaseService.client.removeChannel(channel);
  }

  mergeMyInvitationsChange(
    current: PendingInvitation[],
    change: PendingInvitationChange,
  ): PendingInvitation[] {
    if (change.eventType === 'DELETE') {
      const existing = current.find((item) => item.id === change.id);
      return existing ? mergeChange(current, { eventType: 'DELETE', item: existing }) : current;
    }

    return mergeChange(current, change);
  }

  mergeListRequestsChange(
    current: PendingRequest[],
    change: PendingRequestChange,
  ): PendingRequest[] {
    if (change.eventType === 'DELETE') {
      const existing = current.find((item) => item.id === change.id);
      return existing ? mergeChange(current, { eventType: 'DELETE', item: existing }) : current;
    }

    return mergeChange(current, change);
  }

  private async handleInvitationPayload(
    payload: RealtimePostgresChangesPayload<MembershipRequest>,
    onChange: (change: PendingInvitationChange) => void,
  ): Promise<void> {
    const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as MembershipRequest;

    if (row.origin !== 'INVITE') {
      return;
    }

    if (payload.eventType === 'DELETE') {
      onChange({ eventType: 'DELETE', id: row.id });
      return;
    }

    const item = await this.fetchPendingInvitationById(row.id);
    if (!item) {
      return;
    }
    onChange({ eventType: payload.eventType, item });
  }

  private async handleListRequestPayload(
    payload: RealtimePostgresChangesPayload<MembershipRequest>,
    onChange: (change: PendingRequestChange) => void,
  ): Promise<void> {
    const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as MembershipRequest;

    if (row.origin !== 'REQUEST') {
      return;
    }

    if (payload.eventType === 'DELETE') {
      onChange({ eventType: 'DELETE', id: row.id });
      return;
    }

    const item = await this.fetchPendingRequestById(row.id);
    if (!item) {
      return;
    }
    onChange({ eventType: payload.eventType, item });
  }
}
