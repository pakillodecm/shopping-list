import { TestBed } from '@angular/core/testing';
import type { User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { ItemService, ListItem } from './item.service';
import { SupabaseService } from './supabase.service';

interface QueryResult {
  data: unknown;
  error: unknown;
}

/**
 * A single chainable mock standing in for a Supabase query builder.
 * Every chain method returns the same object (so calls can be asserted
 * individually) and it resolves `result` whether the code calls `.single()`
 * or just awaits the builder directly, matching the real thenable builder.
 */
function createSupabaseServiceMock(result: QueryResult) {
  const builder = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    overrideTypes: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };

  builder.from.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.delete.mockReturnValue(builder);
  builder.overrideTypes.mockReturnValue(builder);

  return { client: builder };
}

function createAuthServiceMock(user: Partial<User> | null) {
  return { user: () => user };
}

describe('ItemService', () => {
  let supabaseServiceMock: ReturnType<typeof createSupabaseServiceMock>;
  let authServiceMock: ReturnType<typeof createAuthServiceMock>;
  let service: ItemService;

  function setup(result: QueryResult = { data: null, error: null }, user: Partial<User> | null = null) {
    TestBed.resetTestingModule();
    supabaseServiceMock = createSupabaseServiceMock(result);
    authServiceMock = createAuthServiceMock(user);
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: supabaseServiceMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    });
    service = TestBed.inject(ItemService);
  }

  describe('getItems', () => {
    it('selects list_items filtered by list_id, ordered by created_at ascending', async () => {
      setup();

      await service.getItems('list-1');

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('list_items');
      expect(supabaseServiceMock.client.select).toHaveBeenCalledWith('*');
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('list_id', 'list-1');
      expect(supabaseServiceMock.client.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });

    it('returns the data/error Supabase gives back', async () => {
      const items: ListItem[] = [
        {
          id: 'item-1',
          list_id: 'list-1',
          product_id: null,
          author_id: 'user-1',
          text: 'Leche',
          checked: false,
          created_at: 'x',
          modified_at: 'x',
        },
      ];
      setup({ data: items, error: null });

      const result = await service.getItems('list-1');

      expect(result.data).toEqual(items);
      expect(result.error).toBeNull();
    });
  });

  describe('addItem', () => {
    it('inserts with list_id, text and the current user id as author_id', async () => {
      setup({ data: null, error: null }, { id: 'user-1' });

      await service.addItem('list-1', 'Pan');

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('list_items');
      expect(supabaseServiceMock.client.insert).toHaveBeenCalledWith({
        list_id: 'list-1',
        text: 'Pan',
        author_id: 'user-1',
      });
      expect(supabaseServiceMock.client.select).toHaveBeenCalled();
      expect(supabaseServiceMock.client.single).toHaveBeenCalled();
    });

    it('inserts with a null author_id when there is no authenticated user', async () => {
      setup({ data: null, error: null }, null);

      await service.addItem('list-1', 'Pan');

      expect(supabaseServiceMock.client.insert).toHaveBeenCalledWith({
        list_id: 'list-1',
        text: 'Pan',
        author_id: null,
      });
    });

    it('returns the created item Supabase gives back', async () => {
      const item: ListItem = {
        id: 'item-1',
        list_id: 'list-1',
        product_id: null,
        author_id: 'user-1',
        text: 'Pan',
        checked: false,
        created_at: 'x',
        modified_at: 'x',
      };
      setup({ data: item, error: null }, { id: 'user-1' });

      const result = await service.addItem('list-1', 'Pan');

      expect(result.data).toEqual(item);
      expect(result.error).toBeNull();
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'new row violates row-level security policy' };
      setup({ data: null, error }, { id: 'user-1' });

      const result = await service.addItem('list-1', 'Pan');

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('toggleChecked', () => {
    it('updates the checked field for the given item id', async () => {
      setup();

      await service.toggleChecked('item-1', true);

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('list_items');
      expect(supabaseServiceMock.client.update).toHaveBeenCalledWith({ checked: true });
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('id', 'item-1');
      expect(supabaseServiceMock.client.select).toHaveBeenCalled();
      expect(supabaseServiceMock.client.single).toHaveBeenCalled();
    });

    it('propagates an error (e.g. RLS blocking the operation) without transforming it', async () => {
      const error = { message: 'new row violates row-level security policy' };
      setup({ data: null, error });

      const result = await service.toggleChecked('item-1', true);

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('updateText', () => {
    it('updates the text field for the given item id', async () => {
      setup();

      await service.updateText('item-1', 'Pan integral');

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('list_items');
      expect(supabaseServiceMock.client.update).toHaveBeenCalledWith({ text: 'Pan integral' });
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('id', 'item-1');
      expect(supabaseServiceMock.client.select).toHaveBeenCalled();
      expect(supabaseServiceMock.client.single).toHaveBeenCalled();
    });

    it('propagates an error (e.g. RLS blocking the operation) without transforming it', async () => {
      const error = { message: 'new row violates row-level security policy' };
      setup({ data: null, error });

      const result = await service.updateText('item-1', 'Pan integral');

      expect(result.error).toEqual(error);
      expect(result.data).toBeNull();
    });
  });

  describe('deleteItem', () => {
    it('deletes the item filtered by id', async () => {
      setup();

      await service.deleteItem('item-1');

      expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('list_items');
      expect(supabaseServiceMock.client.delete).toHaveBeenCalled();
      expect(supabaseServiceMock.client.eq).toHaveBeenCalledWith('id', 'item-1');
    });

    it('propagates an error without transforming it', async () => {
      const error = { message: 'new row violates row-level security policy' };
      setup({ data: null, error });

      const result = await service.deleteItem('item-1');

      expect(result.error).toEqual(error);
    });
  });

  describe('mergeItemChange', () => {
    function makeItem(overrides: Partial<ListItem> = {}): ListItem {
      return {
        id: 'item-1',
        list_id: 'list-1',
        product_id: null,
        author_id: 'user-1',
        text: 'Leche',
        checked: false,
        created_at: '2026-01-01T00:00:00.000Z',
        modified_at: '2026-01-01T00:00:00.000Z',
        ...overrides,
      };
    }

    it('inserts a new item when it does not exist in the current array', () => {
      setup();
      const existing = makeItem({ id: 'item-1' });
      const incoming = makeItem({ id: 'item-2', text: 'Pan' });

      const result = service.mergeItemChange([existing], { eventType: 'INSERT', item: incoming });

      expect(result).toEqual([existing, incoming]);
    });

    it('replaces the existing item when the incoming modified_at is more recent', () => {
      setup();
      const existing = makeItem({ modified_at: '2026-01-01T00:00:00.000Z', text: 'Leche' });
      const incoming = makeItem({ modified_at: '2026-01-02T00:00:00.000Z', text: 'Leche entera' });

      const result = service.mergeItemChange([existing], { eventType: 'UPDATE', item: incoming });

      expect(result).toEqual([incoming]);
    });

    it('ignores the incoming update when its modified_at is older than the current item', () => {
      setup();
      const existing = makeItem({ modified_at: '2026-01-02T00:00:00.000Z', text: 'Leche entera' });
      const incoming = makeItem({ modified_at: '2026-01-01T00:00:00.000Z', text: 'Leche' });

      const result = service.mergeItemChange([existing], { eventType: 'UPDATE', item: incoming });

      expect(result).toEqual([existing]);
    });

    it('applies the incoming update when modified_at is exactly equal (tie)', () => {
      setup();
      const existing = makeItem({ modified_at: '2026-01-01T00:00:00.000Z', text: 'Leche' });
      const incoming = makeItem({ modified_at: '2026-01-01T00:00:00.000Z', text: 'Leche fresca' });

      const result = service.mergeItemChange([existing], { eventType: 'UPDATE', item: incoming });

      expect(result).toEqual([incoming]);
    });

    it('removes the item matching the given id on DELETE, regardless of modified_at', () => {
      setup();
      const toKeep = makeItem({ id: 'item-2', text: 'Pan' });
      const toDelete = makeItem({ id: 'item-1', modified_at: '2099-01-01T00:00:00.000Z' });
      const deleteChange = makeItem({ id: 'item-1', modified_at: '2000-01-01T00:00:00.000Z' });

      const result = service.mergeItemChange([toDelete, toKeep], {
        eventType: 'DELETE',
        item: deleteChange,
      });

      expect(result).toEqual([toKeep]);
    });

    it('does not mutate the array passed in', () => {
      setup();
      const existing = makeItem();
      const current = [existing];

      service.mergeItemChange(current, {
        eventType: 'UPDATE',
        item: makeItem({ modified_at: '2026-01-02T00:00:00.000Z', text: 'Nuevo' }),
      });

      expect(current).toEqual([existing]);
    });
  });
});
