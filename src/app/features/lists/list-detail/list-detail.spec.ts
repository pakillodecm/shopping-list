import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../core/auth.service';
import { InvitationService } from '../../../core/invitation.service';
import { ItemService } from '../../../core/item.service';
import {
  LeaveListResult,
  List,
  ListChange,
  ListMember,
  ListService,
} from '../../../core/list.service';
import { ListDetail } from './list-detail';

// Focused on confirmLeaveList's TOCTOU handling (Tanda 1, hallazgo 13.1):
// startLeaveList()'s branch (kind) is decided from a getListMembers() snapshot
// taken before the user confirms; membership can change in between, so
// leave_list()'s actual result (list_deleted / new_owner_id) can differ from
// what the modal promised. These tests drive the component through its real
// public flow (startLeaveList -> optionally confirmSuccessorChoice ->
// confirmLeaveList) rather than poking at protected signals directly.

const LIST_ID = 'list-1';
const OWNER_ID = 'user-1';

function makeList(overrides: Partial<List> = {}): List {
  return {
    id: LIST_ID,
    owner_id: OWNER_ID,
    name: 'Compra semanal',
    invitation_code: 'ABC234',
    created_at: '2026-01-01T00:00:00.000Z',
    modified_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMember(userId: string, joinedAt: string): ListMember {
  return {
    user_id: userId,
    joined_at: joinedAt,
    profile: { username: userId, first_name: userId, last_name: '' },
  };
}

// Distinct first/last name so successor-label assertions read unambiguously
// (makeMember's own first_name/last_name are both derived from userId, which
// makes the expected label string hard to eyeball correctly).
function makeNamedMember(userId: string, joinedAt: string): ListMember {
  return {
    user_id: userId,
    joined_at: joinedAt,
    profile: { username: 'anag', first_name: 'Ana', last_name: 'García' },
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

describe('ListDetail.confirmLeaveList (leave-list outcome mismatch)', () => {
  let navigateSpy: ReturnType<typeof vi.fn>;
  let leaveListMock: ReturnType<typeof vi.fn>;
  let getListMembersMock: ReturnType<typeof vi.fn>;
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  async function setup(currentUserId: string, list: List, members: ListMember[]) {
    navigateSpy = vi.fn();
    leaveListMock = vi.fn();
    getListMembersMock = vi.fn().mockResolvedValue({ data: members, error: null });

    const dummyChannel = {} as RealtimeChannel;

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => LIST_ID } } },
        },
        { provide: Router, useValue: { navigate: navigateSpy } },
        { provide: AuthService, useValue: { user: () => ({ id: currentUserId }) } },
        {
          provide: ListService,
          useValue: {
            getList: vi.fn().mockResolvedValue({ data: list, error: null }),
            leaveList: leaveListMock,
            getListMembers: getListMembersMock,
            subscribeToList: vi.fn().mockReturnValue(dummyChannel),
            unsubscribeFromLists: vi.fn(),
          },
        },
        {
          provide: ItemService,
          useValue: {
            getItems: vi.fn().mockResolvedValue({ data: [], error: null }),
            subscribeToItems: vi.fn().mockReturnValue(dummyChannel),
            unsubscribeFromItems: vi.fn(),
          },
        },
        {
          provide: InvitationService,
          useValue: {
            getPendingRequestsForList: vi.fn().mockResolvedValue({ data: [], error: null }),
            subscribeToListRequests: vi.fn().mockReturnValue(dummyChannel),
            unsubscribeFromMembershipRequests: vi.fn(),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(ListDetail);
    await flushMicrotasks();

    return fixture.componentInstance;
  }

  it('warns when the modal promised deleting the list (sole owner) but it was transferred instead', async () => {
    // Snapshot at click time: owner alone -> "sole-owner" branch shown.
    const component = await setup(OWNER_ID, makeList(), [makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z')]);
    await component.startLeaveList();

    // Someone joined between the modal opening and the confirm click, so the
    // server actually transferred ownership instead of deleting the list.
    const result: LeaveListResult = { list_deleted: false, new_owner_id: 'user-2' };
    leaveListMock.mockResolvedValue({ data: result, error: null });

    await component.confirmLeaveList();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toMatch(/transfirió la propiedad/);
    expect(navigateSpy).toHaveBeenCalledWith(['/lists']);
  });

  it('warns when the modal promised a transfer but the list was deleted instead (last other member left)', async () => {
    const component = await setup(OWNER_ID, makeList(), [
      makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z'),
      makeMember('user-2', '2026-01-02T00:00:00.000Z'),
    ]);
    await component.startLeaveList();
    component.confirmSuccessorChoice(undefined); // automatic successor

    // The other member left in between, so this user ended up the sole
    // owner and the server deleted the list instead of transferring it.
    const result: LeaveListResult = { list_deleted: true, new_owner_id: null };
    leaveListMock.mockResolvedValue({ data: result, error: null });

    await component.confirmLeaveList();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toMatch(/se eliminó la lista/);
    expect(navigateSpy).toHaveBeenCalledWith(['/lists']);
  });

  it('warns when the modal promised transferring to a chosen successor but a different person ended up owning it', async () => {
    const component = await setup(OWNER_ID, makeList(), [
      makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z'),
      makeMember('user-2', '2026-01-02T00:00:00.000Z'),
      makeMember('user-3', '2026-01-03T00:00:00.000Z'),
    ]);
    await component.startLeaveList();
    component.confirmSuccessorChoice('user-2');

    const result: LeaveListResult = { list_deleted: false, new_owner_id: 'user-3' };
    leaveListMock.mockResolvedValue({ data: result, error: null });

    await component.confirmLeaveList();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toMatch(/otra persona distinta/);
    expect(navigateSpy).toHaveBeenCalledWith(['/lists']);
  });

  it('does not warn when the server outcome matches what the modal promised (sole owner deleted)', async () => {
    const component = await setup(OWNER_ID, makeList(), [makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z')]);
    await component.startLeaveList();

    const result: LeaveListResult = { list_deleted: true, new_owner_id: null };
    leaveListMock.mockResolvedValue({ data: result, error: null });

    await component.confirmLeaveList();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/lists']);
  });

  it('does not warn when the server outcome matches the chosen successor', async () => {
    const component = await setup(OWNER_ID, makeList(), [
      makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z'),
      makeMember('user-2', '2026-01-02T00:00:00.000Z'),
    ]);
    await component.startLeaveList();
    component.confirmSuccessorChoice('user-2');

    const result: LeaveListResult = { list_deleted: false, new_owner_id: 'user-2' };
    leaveListMock.mockResolvedValue({ data: result, error: null });

    await component.confirmLeaveList();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/lists']);
  });

  it('never warns for a non-owner leaving (no ownership outcome to compare)', async () => {
    const component = await setup('user-2', makeList({ owner_id: OWNER_ID }), []);
    await component.startLeaveList();

    const result: LeaveListResult = { list_deleted: false, new_owner_id: null };
    leaveListMock.mockResolvedValue({ data: result, error: null });

    await component.confirmLeaveList();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/lists']);
  });
});

// Complementary coverage (Etapa 7, cuarta pieza): the rest of the leave-list
// state machine (branch routing, successor choice, confirm copy, error
// mapping) and the list-detail-specific Realtime subscription, none of which
// the TOCTOU suite above exercises. Shares the same driving style: call the
// component's real public methods rather than poking protected signals.

interface SetupOptions {
  currentUserId: string;
  list: List;
  getListMembersResult?: { data: ListMember[] | null; error: { message: string } | null };
  getListResult?: { data: List | null; error: { message: string } | null };
}

interface SetupResult {
  component: ListDetail;
  navigateSpy: ReturnType<typeof vi.fn>;
  leaveListMock: ReturnType<typeof vi.fn>;
  getListMembersMock: ReturnType<typeof vi.fn>;
  getListMock: ReturnType<typeof vi.fn>;
  capturedOnListChange: (change: ListChange) => void;
  capturedOnListReconnect: () => void;
}

async function setupListDetail(options: SetupOptions): Promise<SetupResult> {
  const navigateSpy = vi.fn();
  const leaveListMock = vi.fn();
  const getListMembersMock = vi
    .fn()
    .mockResolvedValue(options.getListMembersResult ?? { data: [], error: null });
  const getListMock = vi
    .fn()
    .mockResolvedValue(options.getListResult ?? { data: options.list, error: null });

  let capturedOnListChange: ((change: ListChange) => void) | null = null;
  let capturedOnListReconnect: (() => void) | null = null;
  const subscribeToListMock = vi.fn(
    (_listId: string, onChange: (change: ListChange) => void, onReconnect: () => void) => {
      capturedOnListChange = onChange;
      capturedOnListReconnect = onReconnect;
      return {} as RealtimeChannel;
    },
  );

  const dummyChannel = {} as RealtimeChannel;

  TestBed.configureTestingModule({
    providers: [
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => LIST_ID } } },
      },
      { provide: Router, useValue: { navigate: navigateSpy } },
      { provide: AuthService, useValue: { user: () => ({ id: options.currentUserId }) } },
      {
        provide: ListService,
        useValue: {
          getList: getListMock,
          leaveList: leaveListMock,
          getListMembers: getListMembersMock,
          subscribeToList: subscribeToListMock,
          unsubscribeFromLists: vi.fn(),
        },
      },
      {
        provide: ItemService,
        useValue: {
          getItems: vi.fn().mockResolvedValue({ data: [], error: null }),
          subscribeToItems: vi.fn().mockReturnValue(dummyChannel),
          unsubscribeFromItems: vi.fn(),
        },
      },
      {
        provide: InvitationService,
        useValue: {
          getPendingRequestsForList: vi.fn().mockResolvedValue({ data: [], error: null }),
          subscribeToListRequests: vi.fn().mockReturnValue(dummyChannel),
          unsubscribeFromMembershipRequests: vi.fn(),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(ListDetail);
  await flushMicrotasks();

  if (!capturedOnListChange || !capturedOnListReconnect) {
    throw new Error('subscribeToList was not called as expected');
  }

  return {
    component: fixture.componentInstance,
    navigateSpy,
    leaveListMock,
    getListMembersMock,
    getListMock,
    capturedOnListChange,
    capturedOnListReconnect,
  };
}

describe('ListDetail.startLeaveList (branch routing)', () => {
  it('routes a non-owner straight to the non-owner confirm, without loading members', async () => {
    const { component, getListMembersMock } = await setupListDetail({
      currentUserId: 'user-2',
      list: makeList({ owner_id: OWNER_ID }),
    });

    await component.startLeaveList();

    expect(component['leaveConfirmKind']()).toBe('non-owner');
    expect(getListMembersMock).not.toHaveBeenCalled();
  });

  it('routes an owner with other members to the successor picker (transfer branch)', async () => {
    const members = [
      makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z'),
      makeNamedMember('user-2', '2026-01-02T00:00:00.000Z'),
    ];
    const { component } = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
      getListMembersResult: { data: members, error: null },
    });

    await component.startLeaveList();

    expect(component['leaveConfirmKind']()).toBeNull();
    expect(component['successorOptionsError']()).toBeNull();
    expect(component['successorOptions']()).toEqual([{ id: 'user-2', label: 'Ana García (anag)' }]);
  });

  it('routes a sole owner straight to the sole-owner confirm', async () => {
    const { component } = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
      getListMembersResult: { data: [makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z')], error: null },
    });

    await component.startLeaveList();

    expect(component['leaveConfirmKind']()).toBe('sole-owner');
    expect(component['successorOptions']()).toBeNull();
  });

  it('surfaces an error and sets no branch when getListMembers fails', async () => {
    const { component } = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
      getListMembersResult: { data: null, error: { message: 'network error' } },
    });

    await component.startLeaveList();

    expect(component['leaveConfirmKind']()).toBeNull();
    expect(component['successorOptions']()).toBeNull();
    expect(component['isLoadingSuccessorOptions']()).toBe(false);
    expect(component['successorOptionsError']()).toMatch(/no se han podido cargar los miembros/i);
  });
});

describe('ListDetail.confirmSuccessorChoice', () => {
  async function setupWithSuccessorOptions() {
    const members = [
      makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z'),
      makeNamedMember('user-2', '2026-01-02T00:00:00.000Z'),
    ];
    const result = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
      getListMembersResult: { data: members, error: null },
    });
    await result.component.startLeaveList();
    return result;
  }

  it('stores the chosen successor id/label, closes the picker, and opens the transfer confirm', async () => {
    const { component } = await setupWithSuccessorOptions();

    component.confirmSuccessorChoice('user-2');

    expect(component['chosenSuccessorId']()).toBe('user-2');
    expect(component['chosenSuccessorLabel']()).toBe('Ana García (anag)');
    expect(component['successorOptions']()).toBeNull();
    expect(component['leaveConfirmKind']()).toBe('transfer');
  });

  it('stores no id/label for the automatic (undefined) choice', async () => {
    const { component } = await setupWithSuccessorOptions();

    component.confirmSuccessorChoice(undefined);

    expect(component['chosenSuccessorId']()).toBeUndefined();
    expect(component['chosenSuccessorLabel']()).toBeNull();
    expect(component['successorOptions']()).toBeNull();
    expect(component['leaveConfirmKind']()).toBe('transfer');
  });
});

describe('ListDetail.leaveConfirmMessage', () => {
  it('is empty before any leave flow has started', async () => {
    const { component } = await setupListDetail({
      currentUserId: 'user-2',
      list: makeList({ owner_id: OWNER_ID }),
    });

    expect(component['leaveConfirmMessage']()).toBe('');
  });

  it('shows the plain confirm copy for a non-owner', async () => {
    const { component } = await setupListDetail({
      currentUserId: 'user-2',
      list: makeList({ owner_id: OWNER_ID }),
    });

    await component.startLeaveList();

    expect(component['leaveConfirmMessage']()).toBe('¿Seguro que quieres abandonar esta lista?');
  });

  it('shows the strong deletion warning for a sole owner', async () => {
    const { component } = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
      getListMembersResult: {
        data: [makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z')],
        error: null,
      },
    });

    await component.startLeaveList();

    expect(component['leaveConfirmMessage']()).toMatch(/se eliminará por completo/);
  });

  it('names the chosen successor when one was picked', async () => {
    const members = [
      makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z'),
      makeNamedMember('user-2', '2026-01-02T00:00:00.000Z'),
    ];
    const { component } = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
      getListMembersResult: { data: members, error: null },
    });

    await component.startLeaveList();
    component.confirmSuccessorChoice('user-2');

    expect(component['leaveConfirmMessage']()).toBe(
      '¿Seguro que quieres abandonar la lista? La propiedad pasará a Ana García (anag).',
    );
  });

  it('mentions the automatic seniority rule when no successor was chosen', async () => {
    const members = [
      makeMember(OWNER_ID, '2026-01-01T00:00:00.000Z'),
      makeMember('user-2', '2026-01-02T00:00:00.000Z'),
    ];
    const { component } = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
      getListMembersResult: { data: members, error: null },
    });

    await component.startLeaveList();
    component.confirmSuccessorChoice(undefined);

    expect(component['leaveConfirmMessage']()).toBe(
      '¿Seguro que quieres abandonar la lista? La propiedad pasará al miembro más antiguo.',
    );
  });
});

describe('ListDetail.toReadableLeaveError', () => {
  async function setupNonOwnerReadyToConfirm() {
    const result = await setupListDetail({
      currentUserId: 'user-2',
      list: makeList({ owner_id: OWNER_ID }),
    });
    await result.component.startLeaveList(); // -> 'non-owner', enough to reach confirmLeaveList
    return result;
  }

  it.each([
    ['Chosen successor is not a member of this list', /ha dejado de ser miembro/],
    ['Cannot transfer ownership to yourself', /transferir la propiedad a ti mismo/],
    ['You are not a member of this list', /ya no eres miembro/i],
    ['some unexpected database error', /no se ha podido abandonar la lista/i],
  ])('maps "%s" to the matching Spanish message', async (rawMessage, expected) => {
    const { component, leaveListMock } = await setupNonOwnerReadyToConfirm();
    leaveListMock.mockResolvedValue({ data: null, error: { message: rawMessage } });

    await component.confirmLeaveList();

    expect(component['leaveListError']()).toMatch(expected);
  });
});

describe('ListDetail Realtime: subscribeToList / handleListChange', () => {
  it('updates the local list on an UPDATE event (e.g. a rename from another device)', async () => {
    const { component, capturedOnListChange } = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
    });

    const renamed = makeList({ name: 'Compra renombrada' });
    capturedOnListChange({ eventType: 'UPDATE', item: renamed });

    expect(component['list']()).toEqual(renamed);
  });

  it('clears the list and sets the no-access error on a DELETE event', async () => {
    const { component, capturedOnListChange } = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
    });

    capturedOnListChange({ eventType: 'DELETE', item: makeList() });

    expect(component['list']()).toBeNull();
    expect(component['loadError']()).toMatch(/no se ha podido cargar esta lista/i);
  });

  it('refetches and updates the list when the channel reconnects', async () => {
    const { component, getListMock, capturedOnListReconnect } = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
    });

    const refreshed = makeList({ name: 'Nombre tras reconectar' });
    getListMock.mockResolvedValue({ data: refreshed, error: null });

    capturedOnListReconnect();
    await flushMicrotasks();

    expect(component['list']()).toEqual(refreshed);
  });

  it('clears the list and sets the no-access error if the reconnect refetch fails', async () => {
    const { component, getListMock, capturedOnListReconnect } = await setupListDetail({
      currentUserId: OWNER_ID,
      list: makeList(),
    });

    getListMock.mockResolvedValue({ data: null, error: { message: 'gone' } });

    capturedOnListReconnect();
    await flushMicrotasks();

    expect(component['list']()).toBeNull();
    expect(component['loadError']()).toMatch(/no se ha podido cargar esta lista/i);
  });
});
