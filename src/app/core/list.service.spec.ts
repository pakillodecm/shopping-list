import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { List, ListService } from './list.service';
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
    update: vi.fn(),
    delete: vi.fn(),
    rpc: vi.fn(),
    overrideTypes: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };

  builder.from.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.delete.mockReturnValue(builder);
  builder.rpc.mockReturnValue(builder);
  builder.overrideTypes.mockReturnValue(builder);

  return { client: builder };
}

describe('ListService', () => {
  let supabaseServiceMock: ReturnType<typeof createSupabaseServiceMock>;
  let service: ListService;

  function setup(result: QueryResult = { data: null, error: null }) {
    TestBed.resetTestingModule();
    supabaseServiceMock = createSupabaseServiceMock(result);
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseServiceMock }],
    });
    service = TestBed.inject(ListService);
  }

  describe('createList', () => {
    it('calls the create_list_with_owner RPC with the list name', async () => {
      setup();

      await service.createList('Compra semanal');

      expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith('create_list_with_owner', {
        list_name: 'Compra semanal',
      });
      expect(supabaseServiceMock.client.single).toHaveBeenCalled();
    });

    it('returns the data Supabase gives back', async () => {
      const list: List = {
        id: 'list-1',
        owner_id: 'user-1',
        name: 'Compra semanal',
        invitation_code: 'ABC234',
        created_at: '2026-01-01T00:00:00.000Z',
        modified_at: '2026-01-01T00:00:00.000Z',
      };
      setup({ data: list, error: null });

      const result = await service.createList('Compra semanal');

      expect(result.data).toEqual(list);
      expect(result.error).toBeNull();
    });

    it('propagates the error Supabase gives back without transforming it', async () => {
      const error = { message: 'RPC failed' };
      setup({ data: null, error });

      const result = await service.createList('Compra semanal');

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('getMyLists', () => {
    it('selects from lists without adding owner/member filters (relies on RLS)', async () => {
      setup();

      await service.getMyLists();

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('lists');
      expect(supabaseServiceMock.client.select).toHaveBeenCalledWith('*');
      expect(supabaseServiceMock.client.eq).not.toHaveBeenCalled();
    });

    it('returns the data/error Supabase gives back', async () => {
      const lists: List[] = [
        {
          id: 'list-1',
          owner_id: 'user-1',
          name: 'A',
          invitation_code: 'ABC234',
          created_at: 'x',
          modified_at: 'x',
        },
      ];
      setup({ data: lists, error: null });

      const result = await service.getMyLists();

      expect(result.data).toEqual(lists);
      expect(result.error).toBeNull();
    });
  });

  describe('getList', () => {
    it('selects a single list filtered by id', async () => {
      setup();

      await service.getList('list-1');

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('lists');
      expect(supabaseServiceMock.client.select).toHaveBeenCalledWith('*');
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('id', 'list-1');
      expect(supabaseServiceMock.client.single).toHaveBeenCalled();
    });

    it('propagates an error (e.g. not found or blocked by RLS) without transforming it', async () => {
      const error = { message: 'Row not found' };
      setup({ data: null, error });

      const result = await service.getList('list-1');

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('renameList', () => {
    it('updates the name field for the given list id', async () => {
      setup();

      await service.renameList('list-1', 'Nuevo nombre');

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('lists');
      expect(supabaseServiceMock.client.update).toHaveBeenCalledWith({ name: 'Nuevo nombre' });
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('id', 'list-1');
      expect(supabaseServiceMock.client.select).toHaveBeenCalled();
      expect(supabaseServiceMock.client.single).toHaveBeenCalled();
    });

    it('propagates an error (e.g. RLS blocking a non-owner) without transforming it', async () => {
      const error = { message: 'new row violates row-level security policy' };
      setup({ data: null, error });

      const result = await service.renameList('list-1', 'Nuevo nombre');

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('regenerateInvitationCode', () => {
    it('calls the regenerate_invitation_code RPC with the list id', async () => {
      setup();

      await service.regenerateInvitationCode('list-1');

      expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith('regenerate_invitation_code', {
        p_list_id: 'list-1',
      });
      expect(supabaseServiceMock.client.single).toHaveBeenCalled();
    });

    it('returns the updated list with the new code', async () => {
      const list: List = {
        id: 'list-1',
        owner_id: 'user-1',
        name: 'Compra semanal',
        invitation_code: 'XYZ987',
        created_at: '2026-01-01T00:00:00.000Z',
        modified_at: '2026-01-02T00:00:00.000Z',
      };
      setup({ data: list, error: null });

      const result = await service.regenerateInvitationCode('list-1');

      expect(result.data).toEqual(list);
      expect(result.error).toBeNull();
    });

    it('propagates an error (e.g. RLS blocking a non-owner) without transforming it', async () => {
      const error = { message: 'Only the list owner can regenerate the invitation code' };
      setup({ data: null, error });

      const result = await service.regenerateInvitationCode('list-1');

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('deleteList', () => {
    it('deletes the list filtered by id', async () => {
      setup();

      await service.deleteList('list-1');

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('lists');
      expect(supabaseServiceMock.client.delete).toHaveBeenCalled();
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('id', 'list-1');
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'new row violates row-level security policy' };
      setup({ data: null, error });

      const result = await service.deleteList('list-1');

      expect(result.error).toEqual(error);
    });
  });

  describe('mergeListChange', () => {
    function makeList(overrides: Partial<List> = {}): List {
      return {
        id: 'list-1',
        owner_id: 'user-1',
        name: 'Compra semanal',
        invitation_code: 'ABC234',
        created_at: '2026-01-01T00:00:00.000Z',
        modified_at: '2026-01-01T00:00:00.000Z',
        ...overrides,
      };
    }

    // Exhaustive insert/update/delete/tie-breaking behavior is covered by
    // merge-change.spec.ts against the shared mergeChange function. These
    // just confirm ListService delegates to it correctly.
    it('delegates to the shared mergeChange function', () => {
      setup();
      const existing = makeList({ id: 'list-1' });
      const incoming = makeList({ id: 'list-2', name: 'Lista nueva' });

      const result = service.mergeListChange([existing], { eventType: 'INSERT', item: incoming });

      expect(result).toEqual([existing, incoming]);
    });

    it('removes the item matching the given id on DELETE', () => {
      setup();
      const toKeep = makeList({ id: 'list-2', name: 'Otra lista' });
      const toDelete = makeList({ id: 'list-1' });

      const result = service.mergeListChange([toDelete, toKeep], {
        eventType: 'DELETE',
        item: toDelete,
      });

      expect(result).toEqual([toKeep]);
    });
  });
});
