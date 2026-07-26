import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { AuthService } from '../../../core/auth.service';
import { InvitationService, PendingRequest } from '../../../core/invitation.service';
import { ItemService, ListItem } from '../../../core/item.service';
import { LeaveListResult, List, ListChange, ListService } from '../../../core/list.service';
import {
  ChooseSuccessorDialog,
  SuccessorOption,
} from '../../../shared/choose-successor-dialog/choose-successor-dialog';
import { ConfirmModal } from '../../../shared/confirm-modal/confirm-modal';
import { Autofocus } from '../autofocus.directive';

// Which "leave list" confirmation copy to show (CA-09.1/09.2-09.3/09.4-09.5).
// Determined in startLeaveList() below.
type LeaveConfirmKind = 'non-owner' | 'transfer' | 'sole-owner';

@Component({
  selector: 'app-list-detail',
  imports: [RouterLink, Autofocus, ConfirmModal, ChooseSuccessorDialog],
  templateUrl: './list-detail.html',
  styleUrl: './list-detail.css',
})
export class ListDetail implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly listService = inject(ListService);
  private readonly itemService = inject(ItemService);
  private readonly authService = inject(AuthService);
  private readonly invitationService = inject(InvitationService);

  protected readonly listId = this.route.snapshot.paramMap.get('id');
  private itemsChannel: RealtimeChannel | null = null;
  private requestsChannel: RealtimeChannel | null = null;
  private listChannel: RealtimeChannel | null = null;

  private readonly noAccessErrorMessage =
    'No se ha podido cargar esta lista. Puede que no exista o que no tengas acceso.';

  protected readonly list = signal<List | null>(null);
  protected readonly currentUserId = computed(() => this.authService.user()?.id ?? null);
  protected readonly isOwner = computed(
    () => this.list() !== null && this.list()?.owner_id === this.currentUserId(),
  );

  // Owner-only, mirroring the "Invitar a esta lista" link itself: a
  // non-owner has no RLS access to this list's REQUEST-origin
  // membership_requests anyway, so loading/subscribing is gated on
  // isOwner() to avoid a pointless query. A deliberate scope decision (not
  // a per-list badge on /lists, only here) — see the invitations badge on
  // ListsComponent for the same visual/a11y pattern reused verbatim.
  protected readonly pendingRequests = signal<PendingRequest[]>([]);
  protected readonly pendingRequestsCount = computed(() => this.pendingRequests().length);
  protected readonly items = signal<ListItem[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly isAddingItem = signal(false);
  protected readonly addItemError = signal<string | null>(null);

  protected readonly togglingItemIds = signal<ReadonlySet<string>>(new Set());
  protected readonly toggleError = signal<string | null>(null);

  protected readonly editingItemId = signal<string | null>(null);
  protected readonly isEditingItem = signal(false);
  protected readonly editItemError = signal<string | null>(null);

  protected readonly deletingItemId = signal<string | null>(null);
  protected readonly isDeletingItem = signal(false);
  protected readonly deleteItemError = signal<string | null>(null);
  protected readonly deletingItem = computed(
    () => this.items().find((item) => item.id === this.deletingItemId()) ?? null,
  );

  // Leave list (RF-09, CA-09.1-09.6). Any member can leave; startLeaveList()
  // below decides which of the three flows applies. isOwner() alone isn't
  // enough to tell "transfer" from "sole owner deletes" apart, so an owner
  // click fetches getListMembers() once — the same call also supplies the
  // successor picker's options, so there's no separate lighter "just count
  // members" query to maintain.
  protected readonly isLoadingSuccessorOptions = signal(false);
  protected readonly successorOptionsError = signal<string | null>(null);
  protected readonly successorOptions = signal<SuccessorOption[] | null>(null);

  protected readonly leaveConfirmKind = signal<LeaveConfirmKind | null>(null);
  protected readonly chosenSuccessorId = signal<string | undefined>(undefined);
  protected readonly chosenSuccessorLabel = signal<string | null>(null);
  protected readonly isLeavingList = signal(false);
  protected readonly leaveListError = signal<string | null>(null);

  protected readonly leaveConfirmMessage = computed(() => {
    switch (this.leaveConfirmKind()) {
      case 'non-owner':
        return '¿Seguro que quieres abandonar esta lista?';
      case 'sole-owner':
        return 'Eres el único miembro de esta lista. Si la abandonas, se eliminará por completo junto con todos sus ítems. Esta acción no se puede deshacer.';
      case 'transfer': {
        const label = this.chosenSuccessorLabel();
        return label
          ? `¿Seguro que quieres abandonar la lista? La propiedad pasará a ${label}.`
          : '¿Seguro que quieres abandonar la lista? La propiedad pasará al miembro más antiguo.';
      }
      default:
        return '';
    }
  });

  constructor() {
    this.loadListDetail();
    this.subscribeToItems();
    this.subscribeToListChanges();
  }

  ngOnDestroy(): void {
    if (this.itemsChannel) {
      this.itemService.unsubscribeFromItems(this.itemsChannel);
      this.itemsChannel = null;
    }
    if (this.requestsChannel) {
      this.invitationService.unsubscribeFromMembershipRequests(this.requestsChannel);
      this.requestsChannel = null;
    }
    if (this.listChannel) {
      this.listService.unsubscribeFromLists(this.listChannel);
      this.listChannel = null;
    }
  }

  private subscribeToItems(): void {
    if (!this.listId) {
      return;
    }
    const listId = this.listId;

    this.itemsChannel = this.itemService.subscribeToItems(
      listId,
      (change) => {
        this.items.update((current) => this.itemService.mergeItemChange(current, change));
      },
      () => this.refreshItems(listId),
    );
  }

  private async refreshItems(listId: string): Promise<void> {
    const { data, error } = await this.itemService.getItems(listId);

    if (error) {
      console.warn('[refreshItems] failed to refresh:', error);
      return;
    }

    this.items.set(data ?? []);
  }

  // Reacts to this list's own row changing elsewhere (rename, or leave_list
  // transferring owner_id to someone else) and to it being deleted outright
  // (sole-owner leave_list). Filtered server-side to just this listId — see
  // subscribeToList in ListService for why that's safe without the
  // isRealMembershipChange-style guard ListsComponent needs for its
  // no-filter subscription on the same table.
  private subscribeToListChanges(): void {
    if (!this.listId) {
      return;
    }
    const listId = this.listId;

    this.listChannel = this.listService.subscribeToList(
      listId,
      (change) => this.handleListChange(change),
      () => this.refreshList(listId),
    );
  }

  private handleListChange(change: ListChange): void {
    if (change.eventType === 'DELETE') {
      this.list.set(null);
      this.loadError.set(this.noAccessErrorMessage);
      return;
    }

    this.list.set(change.item);
  }

  private async refreshList(listId: string): Promise<void> {
    const { data, error } = await this.listService.getList(listId);

    if (error || !data) {
      console.warn('[refreshList] failed to refresh:', error);
      this.list.set(null);
      this.loadError.set(this.noAccessErrorMessage);
      return;
    }

    this.list.set(data);
  }

  private async loadListDetail(): Promise<void> {
    if (!this.listId) {
      this.isLoading.set(false);
      this.loadError.set('No se ha podido cargar esta lista.');
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(null);

    const [listResult, itemsResult] = await Promise.all([
      this.listService.getList(this.listId),
      this.itemService.getItems(this.listId),
    ]);

    this.isLoading.set(false);

    if (listResult.error || !listResult.data) {
      this.loadError.set(this.noAccessErrorMessage);
      return;
    }

    this.list.set(listResult.data);

    if (this.isOwner()) {
      this.loadPendingRequestsCount(this.listId);
      this.subscribeToRequestsCount(this.listId);
    }

    if (itemsResult.error) {
      this.loadError.set('No se han podido cargar los ítems de esta lista.');
      return;
    }

    this.items.set(itemsResult.data ?? []);
  }

  private async loadPendingRequestsCount(listId: string): Promise<void> {
    const { data, error } = await this.invitationService.getPendingRequestsForList(listId);

    if (error) {
      return;
    }

    this.pendingRequests.set(data ?? []);
  }

  private subscribeToRequestsCount(listId: string): void {
    this.requestsChannel = this.invitationService.subscribeToListRequests(
      listId,
      (change) => {
        this.pendingRequests.update((current) =>
          this.invitationService.mergeListRequestsChange(current, change),
        );
      },
      () => this.loadPendingRequestsCount(listId),
    );
  }

  async submitAddItem(event: SubmitEvent, textInput: HTMLInputElement): Promise<void> {
    event.preventDefault();

    if (!this.listId) {
      return;
    }

    const text = textInput.value.trim();
    if (!text) {
      this.addItemError.set('El texto no puede estar vacío.');
      return;
    }

    this.isAddingItem.set(true);
    this.addItemError.set(null);

    const { data, error } = await this.itemService.addItem(this.listId, text);

    this.isAddingItem.set(false);

    if (error) {
      this.addItemError.set('No se ha podido añadir el ítem. Inténtalo de nuevo.');
      return;
    }

    if (data) {
      this.items.update((current) =>
        this.itemService.mergeItemChange(current, { eventType: 'INSERT', item: data }),
      );
    }
    textInput.value = '';
  }

  async toggleItem(item: ListItem): Promise<void> {
    const nextChecked = !item.checked;

    this.toggleError.set(null);
    this.items.update((current) =>
      this.itemService.mergeItemChange(current, {
        eventType: 'UPDATE',
        item: { ...item, checked: nextChecked },
      }),
    );
    this.togglingItemIds.update((current) => new Set(current).add(item.id));

    const { data, error } = await this.itemService.toggleChecked(item.id, nextChecked);

    this.togglingItemIds.update((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });

    if (error) {
      this.toggleError.set('No se ha podido actualizar el ítem. Inténtalo de nuevo.');
      this.items.update((current) =>
        this.itemService.mergeItemChange(current, { eventType: 'UPDATE', item }),
      );
      return;
    }

    if (data) {
      this.items.update((current) =>
        this.itemService.mergeItemChange(current, { eventType: 'UPDATE', item: data }),
      );
    }
  }

  startEditItem(itemId: string): void {
    this.deletingItemId.set(null);
    this.editItemError.set(null);
    this.editingItemId.set(itemId);
  }

  cancelEditItem(): void {
    this.editingItemId.set(null);
    this.editItemError.set(null);
  }

  async submitEditItem(event: SubmitEvent, item: ListItem, textInput: HTMLInputElement): Promise<void> {
    event.preventDefault();

    const newText = textInput.value.trim();
    if (!newText) {
      this.editItemError.set('El texto no puede estar vacío.');
      return;
    }

    this.isEditingItem.set(true);
    this.editItemError.set(null);

    const { data, error } = await this.itemService.updateText(item.id, newText);

    this.isEditingItem.set(false);

    if (error) {
      this.editItemError.set('No se ha podido editar el ítem. Inténtalo de nuevo.');
      return;
    }

    if (data) {
      this.items.update((current) =>
        this.itemService.mergeItemChange(current, { eventType: 'UPDATE', item: data }),
      );
    }
    this.editingItemId.set(null);
  }

  startDeleteItem(itemId: string): void {
    this.editingItemId.set(null);
    this.deleteItemError.set(null);
    this.deletingItemId.set(itemId);
  }

  cancelDeleteItem(): void {
    this.deletingItemId.set(null);
    this.deleteItemError.set(null);
  }

  async confirmDeleteItem(item: ListItem): Promise<void> {
    this.isDeletingItem.set(true);
    this.deleteItemError.set(null);

    const { error } = await this.itemService.deleteItem(item.id);

    this.isDeletingItem.set(false);

    if (error) {
      this.deleteItemError.set('No se ha podido eliminar el ítem. Inténtalo de nuevo.');
      return;
    }

    this.items.update((current) =>
      this.itemService.mergeItemChange(current, { eventType: 'DELETE', item }),
    );
    this.deletingItemId.set(null);
  }

  async startLeaveList(): Promise<void> {
    this.leaveListError.set(null);

    if (!this.isOwner()) {
      this.leaveConfirmKind.set('non-owner');
      return;
    }

    if (!this.listId) {
      return;
    }

    this.isLoadingSuccessorOptions.set(true);
    this.successorOptionsError.set(null);

    const { data, error } = await this.listService.getListMembers(this.listId);

    this.isLoadingSuccessorOptions.set(false);

    if (error) {
      this.successorOptionsError.set(
        'No se han podido cargar los miembros de la lista. Inténtalo de nuevo.',
      );
      return;
    }

    const currentUserId = this.currentUserId();
    const otherMembers = (data ?? []).filter((member) => member.user_id !== currentUserId);

    if (otherMembers.length === 0) {
      this.leaveConfirmKind.set('sole-owner');
      return;
    }

    this.successorOptions.set(
      otherMembers.map((member): SuccessorOption => ({
        id: member.user_id,
        label: `${member.profile.first_name} ${member.profile.last_name} (${member.profile.username})`,
      })),
    );
  }

  confirmSuccessorChoice(successorId: string | undefined): void {
    const options = this.successorOptions() ?? [];
    const chosenOption = successorId ? options.find((option) => option.id === successorId) : undefined;

    this.chosenSuccessorId.set(successorId);
    this.chosenSuccessorLabel.set(chosenOption?.label ?? null);
    this.successorOptions.set(null);
    this.leaveConfirmKind.set('transfer');
  }

  cancelSuccessorChoice(): void {
    this.successorOptions.set(null);
  }

  cancelLeaveList(): void {
    this.leaveConfirmKind.set(null);
    this.chosenSuccessorId.set(undefined);
    this.chosenSuccessorLabel.set(null);
    this.leaveListError.set(null);
  }

  async confirmLeaveList(): Promise<void> {
    if (!this.listId) {
      return;
    }

    this.isLeavingList.set(true);
    this.leaveListError.set(null);

    const kind = this.leaveConfirmKind();
    const successorId = kind === 'transfer' ? this.chosenSuccessorId() : undefined;
    const { data, error } = await this.listService.leaveList(this.listId, successorId);

    this.isLeavingList.set(false);

    if (error) {
      this.leaveListError.set(this.toReadableLeaveError(error.message));
      return;
    }

    // The branch shown in the modal (kind) was decided from a getListMembers()
    // snapshot taken before the user confirmed — membership can change in
    // between (someone joins/leaves) and leave_list() correctly re-evaluates
    // at execution time, but its actual outcome can then differ from what was
    // promised. Surface that rather than silently navigating away as if the
    // promised outcome happened.
    if (kind && data) {
      const mismatchMessage = this.buildLeaveOutcomeMismatchMessage(kind, successorId, data);
      if (mismatchMessage) {
        window.alert(mismatchMessage);
      }
    }

    this.router.navigate(['/lists']);
  }

  private buildLeaveOutcomeMismatchMessage(
    kind: LeaveConfirmKind,
    chosenSuccessorId: string | undefined,
    result: LeaveListResult,
  ): string | null {
    if (kind === 'sole-owner' && !result.list_deleted) {
      return 'La situación de la lista cambió justo antes de confirmar: se transfirió la propiedad a otro miembro, en vez de eliminarse la lista como se te mostró.';
    }

    if (kind === 'transfer' && result.list_deleted) {
      return 'La situación de la lista cambió justo antes de confirmar: se eliminó la lista, en vez de transferirse la propiedad como se te mostró.';
    }

    if (kind === 'transfer' && chosenSuccessorId && result.new_owner_id !== chosenSuccessorId) {
      return 'La situación de la lista cambió justo antes de confirmar: la propiedad se transfirió a otra persona distinta de la que elegiste.';
    }

    return null;
  }

  private toReadableLeaveError(message: string): string {
    const normalized = message.toLowerCase();

    if (normalized.includes('chosen successor is not a member')) {
      return 'La persona elegida ha dejado de ser miembro de esta lista. Vuelve a intentarlo.';
    }

    if (normalized.includes('cannot transfer ownership to yourself')) {
      return 'No puedes transferir la propiedad a ti mismo.';
    }

    if (normalized.includes('you are not a member of this list')) {
      return 'Ya no eres miembro de esta lista.';
    }

    return 'No se ha podido abandonar la lista. Inténtalo de nuevo.';
  }
}
