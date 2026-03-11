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
import { of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
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

  constructor() {
    effect(() => {
      const selectedBranch = this.branchSelection.selectedBranch();
      const selectedBranchId = this.branchSelection.selectedBranchId();

      if (selectedBranch && selectedBranchId) {
        this.branch.set(selectedBranch);
        this.branchId.set(selectedBranchId);
        this.loadTables(selectedBranchId);
        void this.syncTableLocks(selectedBranchId);
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
        .forEach((order) => {
          if (order.tableId) {
            nextOrders.set(order.tableId, order);
          }
        });

      this.tableOrders.set(nextOrders);
      this.tables.update((tables) =>
        tables.map((table) => {
          const hasActiveOrder = nextOrders.has(table.id);
          return {
            ...table,
            status: hasActiveOrder
              ? TableStatusEnum.Occupied
              : this.normalizeTableStatus(table.status) ===
                  TableStatusEnum.Occupied
                ? TableStatusEnum.Free
                : table.status,
          };
        }),
      );
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
        this.tables.set(
          this.preserveTablePresence(
            this.reconcileTablesWithLiveOrders(tables || []),
          ),
        );

        if ((tables || []).length === 0) {
          this.tableOrders.set(new Map());
          return;
        }

        this.loadOrdersForTables(tables || []);
      },
      error: (err) => {
        console.error('[loadTables] Error loading tables:', err);
      },
    });
  }

  private loadOrdersForTables(tables: Table[]) {
    const orderMap = new Map<string, Order>();
    const tablesToFree: Table[] = [];
    let completed = 0;

    for (const table of tables) {
      this.orderService
        .getOpenOrderForTable(table.id)
        .pipe(catchError(() => of(null)))
        .subscribe({
          next: (order) => {
            completed++;
            if (order) {
              const status = (order.status || '').toString().toLowerCase();
              const isFullyPaid = status === 'paid' || status === 'closed';

              if (isFullyPaid) {
                tablesToFree.push(table);
              } else {
                orderMap.set(table.id, order);
              }
            } else {
              tablesToFree.push(table);
            }

            if (completed === tables.length) {
              this.tableOrders.set(orderMap);
              for (const t of tablesToFree) {
                this.freeTableAutomatically(t);
              }
            }
          },
        });
    }
  }

  private freeTableAutomatically(table: Table) {
    const tenantId = this.loggedUser()?.tenantId;
    const branchId = this.branchId();

    if (tenantId && branchId && table.id) {
      this.tableService
        .updateTableStatus(tenantId, branchId, table.id, TableStatusEnum.Free)
        .subscribe({
          next: () => {
            console.log('[Tables] Auto-freed table:', table.id);
            this.tables.update((tables) =>
              tables.map((t) =>
                t.id === table.id ? { ...t, status: TableStatusEnum.Free } : t,
              ),
            );
          },
          error: (err) => {
            console.warn('[Tables] Could not auto-free table:', table.id, err);
          },
        });
    }
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
        `La mesa ${table.name || ''} est� siendo atendida por ${lockedBy}.`,
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
        this.loadTables(currentBranchId);
        void this.syncTableLocks(currentBranchId);
      }
    });
  }

  elapsedForTable(table: Table): string | null {
    this.timerTick();

    const order = this.tableOrders().get(table.id);
    if (!order?.createdAt) return null;

    const start = new Date(order.createdAt).getTime();
    const isServed = this.normalizeOrderStatus(order.status) === 'served';
    const end =
      isServed && order.updatedAt
        ? new Date(order.updatedAt).getTime()
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
    const end =
      isServed && order.updatedAt
        ? new Date(order.updatedAt).getTime()
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

  private reconcileTablesWithLiveOrders(tables: Table[]): Table[] {
    const currentOrders = this.tableOrders();
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
    );
  }

  private applyTablePresenceEvent(presence: TablePresenceInfo): void {
    if (!presence?.tableId) {
      return;
    }

    this.tables.update((tables) =>
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
    );
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
