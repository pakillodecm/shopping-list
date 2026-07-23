import { TestBed } from '@angular/core/testing';
import type { User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { InvitationService, MembershipRequest } from './invitation.service';
import { SupabaseService } from './supabase.service';

interface QueryResult {
  data: unknown;
  error: unknown;
}

/**
 * A single chainable mock standing in for a Supabase query/RPC builder.
 * Every chain method returns the same object (so calls can be asserted
 * individually) and it resolves `result` whether the code calls `.single()`
 * or just awaits the builder directly, matching the real thenable builder.
 */
function createSupabaseServiceMock(result: QueryResult) {
  const builder = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    rpc: vi.fn(),
    overrideTypes: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };

  builder.from.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.rpc.mockReturnValue(builder);
  builder.overrideTypes.mockReturnValue(builder);

  return { client: builder };
}

function createAuthServiceMock(user: Partial<User> | null) {
  return { user: () => user };
}

describe('InvitationService', () => {
  let supabaseServiceMock: ReturnType<typeof createSupabaseServiceMock>;
  let authServiceMock: ReturnType<typeof createAuthServiceMock>;
  let service: InvitationService;

  function setup(result: QueryResult = { data: null, error: null }, user: Partial<User> | null = { id: 'user-1' }) {
    TestBed.resetTestingModule();
    supabaseServiceMock = createSupabaseServiceMock(result);
    authServiceMock = createAuthServiceMock(user);
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: supabaseServiceMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    });
    service = TestBed.inject(InvitationService);
  }

  describe('inviteUser', () => {
    it('calls the invite_user_to_list RPC with the list id and identifier', async () => {
      setup();

      await service.inviteUser('list-1', 'pacodecm');

      expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith('invite_user_to_list', {
        p_list_id: 'list-1',
        p_identifier: 'pacodecm',
      });
      expect(supabaseServiceMock.client.single).toHaveBeenCalled();
    });

    it('returns the data Supabase gives back', async () => {
      const request: MembershipRequest = {
        id: 'req-1',
        user_id: 'user-2',
        list_id: 'list-1',
        origin: 'INVITE',
        created_at: '2026-01-01T00:00:00.000Z',
      };
      setup({ data: request, error: null });

      const result = await service.inviteUser('list-1', 'pacodecm');

      expect(result.data).toEqual(request);
      expect(result.error).toBeNull();
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'No user found with that username or email' };
      setup({ data: null, error });

      const result = await service.inviteUser('list-1', 'unknown');

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('requestToJoinByCode', () => {
    it('calls the request_to_join_by_code RPC with the code', async () => {
      setup();

      await service.requestToJoinByCode('ABC234');

      expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith('request_to_join_by_code', {
        p_code: 'ABC234',
      });
      expect(supabaseServiceMock.client.single).toHaveBeenCalled();
    });

    it('propagates an error (e.g. invalid code) without transforming it', async () => {
      const error = { message: 'Invalid invitation code' };
      setup({ data: null, error });

      const result = await service.requestToJoinByCode('BADCOD');

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('acceptInvitation', () => {
    it('calls the accept_invitation RPC with the request id', async () => {
      setup();

      await service.acceptInvitation('req-1');

      expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith('accept_invitation', {
        p_request_id: 'req-1',
      });
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'You cannot accept this request' };
      setup({ data: null, error });

      const result = await service.acceptInvitation('req-1');

      expect(result.error).toEqual(error);
    });
  });

  describe('rejectInvitation', () => {
    it('calls the reject_invitation RPC with the request id', async () => {
      setup();

      await service.rejectInvitation('req-1');

      expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith('reject_invitation', {
        p_request_id: 'req-1',
      });
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'You cannot reject this request' };
      setup({ data: null, error });

      const result = await service.rejectInvitation('req-1');

      expect(result.error).toEqual(error);
    });
  });

  describe('approveJoinRequest', () => {
    it('calls the approve_join_request RPC with the request id', async () => {
      setup();

      await service.approveJoinRequest('req-1');

      expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith('approve_join_request', {
        p_request_id: 'req-1',
      });
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'You cannot approve this request' };
      setup({ data: null, error });

      const result = await service.approveJoinRequest('req-1');

      expect(result.error).toEqual(error);
    });
  });

  describe('denyJoinRequest', () => {
    it('calls the deny_join_request RPC with the request id', async () => {
      setup();

      await service.denyJoinRequest('req-1');

      expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith('deny_join_request', {
        p_request_id: 'req-1',
      });
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'You cannot deny this request' };
      setup({ data: null, error });

      const result = await service.denyJoinRequest('req-1');

      expect(result.error).toEqual(error);
    });
  });

  describe('getMyPendingInvitations', () => {
    it('selects membership_requests filtered by the current user id and origin INVITE', async () => {
      setup({ data: null, error: null }, { id: 'user-1' });

      await service.getMyPendingInvitations();

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('membership_requests');
      expect(supabaseServiceMock.client.select).toHaveBeenCalledWith('*');
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('origin', 'INVITE');
    });

    it('filters by a null user id when there is no authenticated user', async () => {
      setup({ data: null, error: null }, null);

      await service.getMyPendingInvitations();

      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('user_id', null);
    });

    it('returns the data/error Supabase gives back', async () => {
      const requests: MembershipRequest[] = [
        {
          id: 'req-1',
          user_id: 'user-1',
          list_id: 'list-1',
          origin: 'INVITE',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ];
      setup({ data: requests, error: null });

      const result = await service.getMyPendingInvitations();

      expect(result.data).toEqual(requests);
      expect(result.error).toBeNull();
    });
  });

  describe('getPendingRequestsForList', () => {
    it('selects membership_requests filtered by list id and origin REQUEST', async () => {
      setup();

      await service.getPendingRequestsForList('list-1');

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('membership_requests');
      expect(supabaseServiceMock.client.select).toHaveBeenCalledWith('*');
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('list_id', 'list-1');
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('origin', 'REQUEST');
    });

    it('returns the data/error Supabase gives back', async () => {
      const requests: MembershipRequest[] = [
        {
          id: 'req-2',
          user_id: 'user-2',
          list_id: 'list-1',
          origin: 'REQUEST',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ];
      setup({ data: requests, error: null });

      const result = await service.getPendingRequestsForList('list-1');

      expect(result.data).toEqual(requests);
      expect(result.error).toBeNull();
    });
  });
});
