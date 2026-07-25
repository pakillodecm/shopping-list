import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../core/auth.service';
import { InvitationService } from '../../../core/invitation.service';
import { ItemService } from '../../../core/item.service';
import { LeaveListResult, List, ListMember, ListService } from '../../../core/list.service';
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
