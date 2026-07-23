import { Injectable, inject } from '@angular/core';

import { AuthService } from './auth.service';
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
}

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

  getMyPendingInvitations() {
    const userId = this.authService.user()?.id ?? null;

    return this.supabaseService.client
      .from('membership_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('origin', 'INVITE')
      .overrideTypes<MembershipRequest[], { merge: false }>();
  }

  getPendingRequestsForList(listId: string) {
    return this.supabaseService.client
      .from('membership_requests')
      .select('*, profile:profiles(username, first_name, last_name)')
      .eq('list_id', listId)
      .eq('origin', 'REQUEST')
      .overrideTypes<PendingRequest[], { merge: false }>();
  }
}
