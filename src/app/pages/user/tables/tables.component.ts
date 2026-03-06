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
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TableStatusEnum } from '../../../core/enums/table-status.enum';

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

  loggedUser = signal<LoggedUser>(this.auth.me()!);
  branchId = signal<string>('');
  branch = signal<BranchSummary | null>(null);
  tables = signal<Table[]>([]);

  // Map to store active orders by tableId
  tableOrders = signal<Map<string, Order>>(new Map());

  // Timer to refresh elapsed time
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  // Signal to trigger UI updates for elapsed time
  private timerTick = signal(0);

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
  }

  ngOnInit(): void {
    // Start timer to update elapsed time every minute
    this.timerInterval = setInterval(() => {
      this.timerTick.update((v) => v + 1);
    }, 60000); // Update every minute
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  loadTables(branchId: string) {
    if (!branchId) return;

    // First load tables
    this.tableService.getTables(branchId).subscribe({
      next: (tables) => {
        this.tables.set(tables);

        // Load orders for all tables so we can detect active orders
        // even if the backend status isn't 'Occupied'
        if (tables.length === 0) {
          this.tableOrders.set(new Map());
          return;
        }

        this.loadOrdersForTables(tables);
      },
      error: (err) => {
        console.error('[loadTables] Error loading tables:', err);
      },
    });
  }

  /**
   * Load open orders for the given tables (occupied tables)
   */
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
              // Check if order is fully paid - if so, free the table
              const status = (order.status || '').toString().toLowerCase();
              const isFullyPaid = status === 'paid' || status === 'closed';

              if (isFullyPaid) {
                // Order is paid, mark table for freeing
                tablesToFree.push(table);
              } else {
                // Order is still active, add to map
                orderMap.set(table.id, order);
              }
            } else {
              // No open order found for occupied table - mark for freeing
              tablesToFree.push(table);
            }

            // When all requests complete, update the signal and free tables
            if (completed === tables.length) {
              this.tableOrders.set(orderMap);
              // Free all tables that need to be freed
              for (const t of tablesToFree) {
                this.freeTableAutomatically(t);
              }
            }
          },
        });
    }
  }

  /**
   * Automatically free a table that has a paid order or no order
   */
  private freeTableAutomatically(table: Table) {
    const tenantId = this.loggedUser()?.tenantId;
    const branchId = this.branchId();

    if (tenantId && branchId && table.id) {
      this.tableService
        .updateTableStatus(tenantId, branchId, table.id, TableStatusEnum.Free)
        .subscribe({
          next: () => {
            console.log('[Tables] Auto-freed table:', table.id);
            // Update local table status without reloading
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
    return null;
  }

  statusBadge(table: Table) {
    // const s = String(table.status || '');
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

    dialogRef.closed.subscribe((result) => {
      // Reload tables to reflect any changes (order created, status changed, etc.)
      const currentBranchId = this.branchId();
      if (currentBranchId) {
        this.loadTables(currentBranchId);
      }
    });
  }

  elapsedForTable(table: Table): string | null {
    // Trigger reactivity on timer tick
    this.timerTick();

    const order = this.tableOrders().get(table.id);
    if (!order?.createdAt) return null;

    const start = new Date(order.createdAt).getTime();

    // If order is served, freeze the timer at the time it was served (use updatedAt)
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
    // Trigger reactivity on timer tick
    this.timerTick();

    const order = this.tableOrders().get(table.id);
    if (!order?.createdAt) return null;

    const start = new Date(order.createdAt).getTime();

    // If order is served, freeze the timer at the time it was served (use updatedAt)
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

    // Color based on time elapsed (not affected by served status)
    let className = 'badge-success text-white';
    if (totalMinutes >= 30 && totalMinutes < 60) {
      className = 'badge-warning';
    } else if (totalMinutes >= 60) {
      className = 'badge-error text-white';
    }

    return { time, class: className };
  }

  /**
   * Get the order for a table (if any)
   */
  getOrderForTable(table: Table): Order | undefined {
    return this.tableOrders().get(table.id);
  }

  /**
   * Check if order status is "served" (all items served)
   */
  isOrderServed(table: Table): boolean {
    const order = this.tableOrders().get(table.id);
    if (!order) return false;
    const status = this.normalizeOrderStatus(order.status);
    return status === 'served';
  }

  /**
   * Get a human-readable label for the order status
   */
  getOrderStatusLabel(table: Table): string {
    console.log('table', table);
    const order = this.tableOrders().get(table.id);
    if (!order) return '';
    console.log('order', order);
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

  /**
   * Get badge class for order status
   */
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

  /**
   * Normalize order status to lowercase
   */
  private normalizeOrderStatus(status: OrderStatus | string): string {
    return String(status || '').toLowerCase();
  }
}
