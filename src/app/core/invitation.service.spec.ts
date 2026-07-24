import { TestBed } from '@angular/core/testing';
import type { User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import {
  InvitationService,
  InviteResult,
  PendingInvitation,
  PendingRequest,
} from './invitation.service';
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

    it('returns the data Supabase gives back, including already_pending', async () => {
      const request: InviteResult = {
        id: 'req-1',
        user_id: 'user-2',
        list_id: 'list-1',
        origin: 'INVITE',
        created_at: '2026-01-01T00:00:00.000Z',
        already_pending: false,
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

    it('returns the data Supabase gives back, including already_pending', async () => {
      const request: InviteResult = {
        id: 'req-1',
        user_id: 'user-1',
        list_id: 'list-1',
        origin: 'REQUEST',
        created_at: '2026-01-01T00:00:00.000Z',
        already_pending: false,
      };
      setup({ data: request, error: null });

      const result = await service.requestToJoinByCode('ABC234');

      expect(result.data).toEqual(request);
      expect(result.error).toBeNull();
    });
  });

  describe('getListNameByCode', () => {
    it('calls the get_list_name_by_code RPC with the code', async () => {
      setup();

      await service.getListNameByCode('ABC234');

      expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith('get_list_name_by_code', {
        p_code: 'ABC234',
      });
    });

    it('returns the list name Supabase gives back', async () => {
      setup({ data: 'Compra semanal', error: null });

      const result = await service.getListNameByCode('ABC234');

      expect(result.data).toBe('Compra semanal');
      expect(result.error).toBeNull();
    });

    it('returns null data when the code does not match any list', async () => {
      setup({ data: null, error: null });

      const result = await service.getListNameByCode('BADCOD');

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'network error' };
      setup({ data: null, error });

      const result = await service.getListNameByCode('ABC234');

      expect(result.error).toEqual(error);
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
    it('selects membership_requests filtered by the current user id and origin INVITE, embedding the list name', async () => {
      setup({ data: null, error: null }, { id: 'user-1' });

      await service.getMyPendingInvitations();

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('membership_requests');
      expect(supabaseServiceMock.client.select).toHaveBeenCalledWith('*, list:lists(name)');
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('origin', 'INVITE');
    });

    it('filters by a null user id when there is no authenticated user', async () => {
      setup({ data: null, error: null }, null);

      await service.getMyPendingInvitations();

      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('user_id', null);
    });

    it('returns the data Supabase gives back, deriving modified_at from created_at', async () => {
      const rawRequest = {
        id: 'req-1',
        user_id: 'user-1',
        list_id: 'list-1',
        origin: 'INVITE' as const,
        created_at: '2026-01-01T00:00:00.000Z',
        list: { name: 'Compra semanal' },
      };
      setup({ data: [rawRequest], error: null });

      const result = await service.getMyPendingInvitations();

      const expected: PendingInvitation = { ...rawRequest, modified_at: rawRequest.created_at };
      expect(result.data).toEqual([expected]);
      expect(result.error).toBeNull();
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'network error' };
      setup({ data: null, error });

      const result = await service.getMyPendingInvitations();

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('getPendingRequestsForList', () => {
    it('selects membership_requests filtered by list id and origin REQUEST, embedding the requester profile', async () => {
      setup();

      await service.getPendingRequestsForList('list-1');

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('membership_requests');
      expect(supabaseServiceMock.client.select).toHaveBeenCalledWith(
        '*, profile:profiles(username, first_name, last_name)',
      );
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('list_id', 'list-1');
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('origin', 'REQUEST');
    });

    it('returns the data Supabase gives back, deriving modified_at from created_at', async () => {
      const rawRequest = {
        id: 'req-2',
        user_id: 'user-2',
        list_id: 'list-1',
        origin: 'REQUEST' as const,
        created_at: '2026-01-01T00:00:00.000Z',
        profile: { username: 'maria', first_name: 'María', last_name: 'García' },
      };
      setup({ data: [rawRequest], error: null });

      const result = await service.getPendingRequestsForList('list-1');

      const expected: PendingRequest = { ...rawRequest, modified_at: rawRequest.created_at };
      expect(result.data).toEqual([expected]);
      expect(result.error).toBeNull();
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'network error' };
      setup({ data: null, error });

      const result = await service.getPendingRequestsForList('list-1');

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('mergeMyInvitationsChange', () => {
    function makeInvitation(overrides: Partial<PendingInvitation> = {}): PendingInvitation {
      return {
        id: 'req-1',
        user_id: 'user-1',
        list_id: 'list-1',
        origin: 'INVITE',
        created_at: '2026-01-01T00:00:00.000Z',
        modified_at: '2026-01-01T00:00:00.000Z',
        list: { name: 'Compra semanal' },
        ...overrides,
      };
    }

    it('delegates to the shared mergeChange function for INSERT/UPDATE', () => {
      setup();
      const existing = makeInvitation({ id: 'req-1' });
      const incoming = makeInvitation({ id: 'req-2', list: { name: 'Otra lista' } });

      const result = service.mergeMyInvitationsChange([existing], {
        eventType: 'INSERT',
        item: incoming,
      });

      expect(result).toEqual([existing, incoming]);
    });

    it('resolves a DELETE by id, using the existing item already in state', () => {
      setup();
      const toKeep = makeInvitation({ id: 'req-2' });
      const toDelete = makeInvitation({ id: 'req-1' });

      const result = service.mergeMyInvitationsChange([toDelete, toKeep], {
        eventType: 'DELETE',
        id: 'req-1',
      });

      expect(result).toEqual([toKeep]);
    });

    it('is a no-op if the DELETE id is not currently in state', () => {
      setup();
      const existing = makeInvitation({ id: 'req-1' });

      const result = service.mergeMyInvitationsChange([existing], {
        eventType: 'DELETE',
        id: 'unknown-id',
      });

      expect(result).toEqual([existing]);
    });
  });

  describe('mergeListRequestsChange', () => {
    function makeRequest(overrides: Partial<PendingRequest> = {}): PendingRequest {
      return {
        id: 'req-1',
        user_id: 'user-1',
        list_id: 'list-1',
        origin: 'REQUEST',
        created_at: '2026-01-01T00:00:00.000Z',
        modified_at: '2026-01-01T00:00:00.000Z',
        profile: { username: 'maria', first_name: 'María', last_name: 'García' },
        ...overrides,
      };
    }

    it('delegates to the shared mergeChange function for INSERT/UPDATE', () => {
      setup();
      const existing = makeRequest({ id: 'req-1' });
      const incoming = makeRequest({ id: 'req-2', profile: { username: 'juan', first_name: 'Juan', last_name: 'Pérez' } });

      const result = service.mergeListRequestsChange([existing], {
        eventType: 'INSERT',
        item: incoming,
      });

      expect(result).toEqual([existing, incoming]);
    });

    it('resolves a DELETE by id, using the existing item already in state', () => {
      setup();
      const toKeep = makeRequest({ id: 'req-2' });
      const toDelete = makeRequest({ id: 'req-1' });

      const result = service.mergeListRequestsChange([toDelete, toKeep], {
        eventType: 'DELETE',
        id: 'req-1',
      });

      expect(result).toEqual([toKeep]);
    });

    it('is a no-op if the DELETE id is not currently in state', () => {
      setup();
      const existing = makeRequest({ id: 'req-1' });

      const result = service.mergeListRequestsChange([existing], {
        eventType: 'DELETE',
        id: 'unknown-id',
      });

      expect(result).toEqual([existing]);
    });
  });
});
