import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { BranchSummary } from '../../../core/services/business.service';
import { Table, TableService } from '../../../core/services/table.service';
import { OrderService } from '../../../core/services/order.service';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { Dialog } from '@angular/cdk/dialog';
import { TableDetailsComponent } from './table-details.component';
import { LoggedUser } from '../../../core/models/user.model';
import { Order, OrderStatus } from '../../../core/models/order.model';
import { Subscription } from 'rxjs';
import { TableStatusEnum } from '../../../core/enums/table-status.enum';
import {
  RealtimeService,
  TablePresenceInfo,
} from '../../../core/services/realtime.service';
import { OrdersLiveStore } from '../../../core/services/orders-live-store.service';

@Component({
  selector: 'app-user-tables',
  imports: [CommonModule, FormsModule],
  templateUrl: './tables.component.html',
})
export class UserTablesComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private tableService = inject(TableService);
  private dialog = inject(Dialog);
  private branchSelection = inject(BranchSelectionService);
  private orderService = inject(OrderService);
  private realtime = inject(RealtimeService);
  private ordersStore = inject(OrdersLiveStore);

  loggedUser = signal<LoggedUser>(this.auth.me()!);
  branchId = signal<string>('');
  branch = signal<BranchSummary | null>(null);
  tables = signal<Table[]>([]);
  lockMessage = signal<string | null>(null);
  blockedTableId = signal<string | null>(null);

  // Map to store active orders by tableId
  tableOrders = signal<Map<string, Order>>(new Map());

  // Timer to refresh elapsed time
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  // Signal to trigger UI updates for elapsed time
  private timerTick = signal(0);
  private realtimeSubscription: Subscription | null = null;
  private readonly tableNameCollator = new Intl.Collator('es', {
    numeric: true,
    sensitivity: 'base',
  });

  constructor() {
    effect(() => {
      const selectedBranch = this.branchSelection.selectedBranch();
      const selectedBranchId = this.branchSelection.selectedBranchId();

      if (selectedBranch && selectedBranchId) {
        this.branch.set(selectedBranch);
        this.branchId.set(selectedBranchId);
        this.loadTables(selectedBranchId);
      }
    });

    effect(() => {
      const branchId = this.branchId();
      const ready = this.ordersStore.ready();
      const liveOrders = this.ordersStore.ordersList();

      if (!branchId || !ready) {
        return;
      }

      const nextOrders = new Map<string, Order>();
      liveOrders
        .filter((order) => order.branchId === branchId)
        .filter((order) => !!order.tableId)
        .filter((order) => !this.isTerminalOrderStatus(order.status))
        .forEach((order) => {
          if (order.tableId) {
            nextOrders.set(order.tableId, order);
          }
        });

      this.tableOrders.set(nextOrders);
      this.refreshTablesFromOrderMap(nextOrders);
    });

    effect(() => {
      const blockedTableId = this.blockedTableId();
      const tables = this.tables();

      if (!blockedTableId) {
        return;
      }

      const blockedTable = tables.find((table) => table.id === blockedTableId);
      if (!blockedTable || !blockedTable.locked) {
        this.blockedTableId.set(null);
        this.lockMessage.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.timerInterval = setInterval(() => {
      this.timerTick.update((v) => v + 1);
    }, 60000);

    this.realtimeSubscription = this.realtime.orderEvents$.subscribe(
      (event) => {
        const currentBranchId = this.branchId();
        if (!currentBranchId || event.branchId !== currentBranchId) {
          return;
        }

        if (event.name === 'TableLocked' || event.name === 'TableReleased') {
          this.applyTablePresenceEvent(event.payload as TablePresenceInfo);
        }
      },
    );
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.realtimeSubscription?.unsubscribe();
    this.realtimeSubscription = null;
  }

  loadTables(branchId: string) {
    if (!branchId) return;

    this.tableService.getTables(branchId).subscribe({
      next: (tables) => {
        const currentOrders = this.tableOrders();
        this.tables.set(
          this.sortTablesByName(
            this.preserveTablePresence(
              this.applyOrderMapToTables(tables || [], currentOrders),
            ),
          ),
        );
        void this.syncTableLocks(branchId);
      },
      error: (err) => {
        console.error('[loadTables] Error loading tables:', err);
      },
    });
  }

  getLockIndicator(table: Table): string | null {
    if (!table.locked || !table.lockedBy?.userName) {
      return null;
    }

    return `Bloqueada`;
  }

  statusBadge(table: Table) {
    const s = ''.toString();
    switch (s) {
      case 'Libre':
        return 'badge-success';
      case 'Ocupada':
        return 'badge-error';
      case 'Reservada':
        return 'badge-warning';
      case 'Inhabilitada':
        return 'badge-neutral';
      default:
        return 'badge-ghost';
    }
  }

  openTableDetails(table: Table) {
    if (this.isLockedByAnotherUser(table)) {
      const lockedBy = table.lockedBy?.userName || 'otro usuario';
      this.blockedTableId.set(table.id);
      this.lockMessage.set(
        `La mesa ${table.name || ''} está siendo atendida por ${lockedBy}.`,
      );
      return;
    }

    this.lockMessage.set(null);
    this.blockedTableId.set(null);

    const dialogRef = this.dialog.open(TableDetailsComponent, {
      width: '75vw',
      height: '90vh',
      panelClass: 'table-details-modal',
      autoFocus: false,
      data: {
        table,
        branch: this.branchId(),
        branchId: this.branchSelection.getEffectiveBranchId(),
      },
    });

    dialogRef.closed.subscribe(() => {
      const currentBranchId = this.branchId();
      if (currentBranchId) {
        this.ordersStore.refreshCurrentBranch();
        this.loadTables(currentBranchId);
      }
    });
  }

  elapsedForTable(table: Table): string | null {
    this.timerTick();

    const order = this.tableOrders().get(table.id);
    if (!order?.createdAt) return null;

    const start = new Date(order.createdAt).getTime();
    const isServed = this.normalizeOrderStatus(order.status) === 'served';
    const servedAt = this.getStatusChangedAt(order, 'served');
    const end =
      isServed && servedAt
        ? servedAt.getTime()
        : Date.now();

    const diffMs = end - start;
    if (diffMs < 0) return null;

    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
  }

  elapsedInfoForTable(table: Table): { time: string; class: string } | null {
    this.timerTick();

    const order = this.tableOrders().get(table.id);
    if (!order?.createdAt) return null;

    const start = new Date(order.createdAt).getTime();
    const isServed = this.normalizeOrderStatus(order.status) === 'served';
    const servedAt = this.getStatusChangedAt(order, 'served');
    const end =
      isServed && servedAt
        ? servedAt.getTime()
        : Date.now();

    const diffMs = end - start;
    if (diffMs < 0) return null;

    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const time = hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;

    let className = 'badge-success text-white';
    if (totalMinutes >= 30 && totalMinutes < 60) {
      className = 'badge-warning';
    } else if (totalMinutes >= 60) {
      className = 'badge-error text-white';
    }

    return { time, class: className };
  }

  getOrderForTable(table: Table): Order | undefined {
    return this.tableOrders().get(table.id);
  }

  isOrderServed(table: Table): boolean {
    const order = this.tableOrders().get(table.id);
    if (!order) return false;
    const status = this.normalizeOrderStatus(order.status);
    return status === 'served';
  }

  getOrderStatusLabel(table: Table): string {
    const order = this.tableOrders().get(table.id);
    if (!order) return '';
    const status = this.normalizeOrderStatus(order.status);
    switch (status) {
      case 'created':
      case 'pending':
        return 'Pendiente';
      case 'confirmed':
        return 'Confirmada';
      case 'preparing':
        return 'Preparando';
      case 'ready':
        return 'Lista';
      case 'served':
        return 'Servida';
      case 'paid':
        return 'Pagada';
      case 'closed':
        return 'Cerrada';
      case 'cancelled':
        return 'Cancelada';
      default:
        return 'Pendiente';
    }
  }

  getOrderStatusBadgeClass(table: Table): string {
    const order = this.tableOrders().get(table.id);
    if (!order) return 'badge-ghost';
    const status = this.normalizeOrderStatus(order.status);
    switch (status) {
      case 'created':
      case 'pending':
        return 'badge-ghost';
      case 'confirmed':
        return 'badge-info text-white';
      case 'preparing':
        return 'badge-warning';
      case 'ready':
        return 'badge-accent';
      case 'served':
        return 'badge-success text-white';
      case 'paid':
      case 'closed':
        return 'badge-neutral';
      case 'cancelled':
        return 'badge-error text-white';
      default:
        return 'badge-ghost';
    }
  }

  private normalizeOrderStatus(status: OrderStatus | string): string {
    return String(status || '').toLowerCase();
  }

  private isTerminalOrderStatus(status: OrderStatus | string): boolean {
    const normalized = this.normalizeOrderStatus(status);
    return ['paid', 'closed', 'cancelled'].includes(normalized);
  }

  private getStatusChangedAt(
    order: Order,
    targetStatus: OrderStatus | string,
  ): Date | null {
    const target = this.normalizeOrderStatus(targetStatus);
    const history = (order.statusHistory || [])
      .map((entry) => {
        const rawStatus =
          typeof entry.status === 'string'
            ? entry.status
            : entry.status?.type || '';
        return {
          code: this.normalizeOrderStatus(rawStatus),
          changedAt: entry.changedAt ? new Date(entry.changedAt) : null,
        };
      })
      .filter((entry) => entry.code === target && entry.changedAt)
      .sort(
        (a, b) => a.changedAt!.getTime() - b.changedAt!.getTime(),
      );

    return history.at(-1)?.changedAt ?? null;
  }

  private applyOrderMapToTables(
    tables: Table[],
    currentOrders: Map<string, Order>,
  ): Table[] {
    return tables.map((table) => {
      const hasActiveOrder = currentOrders.has(table.id);
      return {
        ...table,
        status: hasActiveOrder
          ? TableStatusEnum.Occupied
          : this.normalizeTableStatus(table.status) === TableStatusEnum.Occupied
            ? TableStatusEnum.Free
          : table.status,
      };
    });
  }

  private refreshTablesFromOrderMap(currentOrders: Map<string, Order>): void {
    this.tables.update((tables) =>
      this.sortTablesByName(this.applyOrderMapToTables(tables, currentOrders)),
    );
  }

  private preserveTablePresence(tables: Table[]): Table[] {
    const currentPresence = new Map(
      this.tables().map((table) => [
        table.id,
        {
          locked: !!table.locked,
          lockedBy: table.lockedBy ?? null,
          lockedAt: table.lockedAt ?? null,
        },
      ]),
    );

    return tables.map((table) => {
      const presence = currentPresence.get(table.id);
      if (!presence) {
        return table;
      }

      return {
        ...table,
        locked: presence.locked,
        lockedBy: presence.locked ? presence.lockedBy : null,
        lockedAt: presence.locked ? presence.lockedAt : null,
      };
    });
  }

  private normalizeTableStatus(status: Table['status']): TableStatusEnum {
    if (typeof status === 'number') {
      return status as TableStatusEnum;
    }

    const raw = String(status || '')
      .toLowerCase()
      .trim();
    switch (raw) {
      case 'occupied':
      case 'ocupada':
        return TableStatusEnum.Occupied;
      case 'reserved':
      case 'reservada':
        return TableStatusEnum.Reserved;
      case 'cleaning':
      case 'limpiando':
        return TableStatusEnum.Cleaning;
      case 'disabled':
      case 'inhabilitada':
        return TableStatusEnum.Disabled;
      default:
        return TableStatusEnum.Free;
    }
  }

  private async syncTableLocks(branchId: string): Promise<void> {
    const locks = await this.realtime.getActiveTableLocks(branchId);
    const lockMap = new Map(locks.map((lock) => [lock.tableId, lock]));
    this.tables.update((tables) =>
      this.sortTablesByName(
        tables.map((table) => {
          const presence = lockMap.get(table.id);
          if (!presence) {
            return { ...table, locked: false, lockedBy: null, lockedAt: null };
          }

          return {
            ...table,
            locked: presence.locked,
            lockedBy: presence.lockedBy ?? null,
            lockedAt: presence.lockedAt ?? null,
          };
        }),
      ),
    );
  }

  private applyTablePresenceEvent(presence: TablePresenceInfo): void {
    if (!presence?.tableId) {
      return;
    }

    this.tables.update((tables) =>
      this.sortTablesByName(
        tables.map((table) => {
          if (table.id !== presence.tableId) {
            return table;
          }

          return {
            ...table,
            locked: presence.locked,
            lockedBy: presence.locked ? (presence.lockedBy ?? null) : null,
            lockedAt: presence.locked ? (presence.lockedAt ?? null) : null,
          };
        }),
      ),
    );
  }

  private sortTablesByName(tables: Table[]): Table[] {
    return [...tables].sort((a, b) => {
      const left = (a.name || '').trim() || a.id;
      const right = (b.name || '').trim() || b.id;
      return this.tableNameCollator.compare(left, right);
    });
  }

  private isLockedByAnotherUser(table: Table): boolean {
    const currentUserId = this.loggedUser()?.id;
    return (
      !!table.locked &&
      !!table.lockedBy?.userId &&
      table.lockedBy.userId !== currentUserId
    );
  }
}

