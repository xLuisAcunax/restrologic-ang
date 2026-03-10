import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { DriverService, Driver } from '../../../core/services/driver.service';
import { Dialog } from '@angular/cdk/dialog';
import { DeliveryAssignmentModal } from '../../../shared/components/delivery-assignment-modal/delivery-assignment-modal.component';
import { DeliveryStatusBadge } from '../../../shared/components/delivery-status-badge/delivery-status-badge.component';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { DeliveryStatus, Order } from '../../../core/models/order.model';
import { OrdersLiveStore } from '../../../core/services/orders-live-store.service';

interface OptimisticAssignmentResult {
  status: 'optimistic';
  driverId: string;
  notes: string | null;
}

function isOptimisticAssignmentResult(r: any): r is OptimisticAssignmentResult {
  return (
    r &&
    typeof r === 'object' &&
    r.status === 'optimistic' &&
    typeof (r as any).driverId === 'string'
  );
}

@Component({
  selector: 'app-deliveries',
  standalone: true,
  imports: [CommonModule, FormsModule, DeliveryStatusBadge],
  templateUrl: './deliveries.component.html',
  styleUrl: './deliveries.component.css',
})
export class DeliveriesComponent implements OnInit {
  private auth = inject(AuthService);
  private driverService = inject(DriverService);
  private dialog = inject(Dialog);
  private branchSelection = inject(BranchSelectionService);
  private ordersStore = inject(OrdersLiveStore);

  drivers = signal<Driver[]>([]);
  selectedStatus = signal<DeliveryStatus | 'all'>('all');
  selectedDriver = signal<string | 'all'>('all');

  tenantId = computed(() => this.auth.me()?.tenantId || '');
  branchId = computed(() => {
    const explicit = this.branchSelection.selectedBranchId();
    if (explicit) return explicit;
    return this.auth.me()?.branchId || '';
  });

  loading = computed(() => !!this.branchId() && !this.ordersStore.ready());

  private dispatchableOrders = computed(() => {
    const branchId = this.branchId();
    const orders = this.ordersStore.ordersList();

    return orders.filter((order) => this.isDispatchableDelivery(order, branchId));
  });

  filteredOrders = computed(() => {
    let result = this.dispatchableOrders();

    if (this.selectedStatus() !== 'all') {
      result = result.filter((o) => o.delivery?.status === this.selectedStatus());
    }

    if (this.selectedDriver() !== 'all') {
      result = result.filter((o) => o.delivery?.driverId === this.selectedDriver());
    }

    return result;
  });

  pendingCount = computed(
    () =>
      this.dispatchableOrders().filter((o) => o.delivery?.status === 'pending')
        .length,
  );

  constructor() {
    effect(() => {
      const branchId = this.branchId();
      const tenantId = this.tenantId();

      if (!branchId || !tenantId) {
        this.drivers.set([]);
        return;
      }

      this.ordersStore.start();
      this.loadDrivers(tenantId, branchId);
    });
  }

  ngOnInit() {
    this.ordersStore.start();
  }

  refresh() {
    const tenantId = this.tenantId();
    const branchId = this.branchId();
    if (!tenantId || !branchId) return;
    this.loadDrivers(tenantId, branchId);
  }

  openAssignmentModal(order: Order) {
    const dialogRef = this.dialog.open(DeliveryAssignmentModal, {
      data: {
        orderId: order.id,
        currentDriverId: order.delivery?.driverId || null,
        drivers: this.drivers(),
        branchId: order.branchId,
      },
      width: '500px',
    });

    dialogRef.closed.subscribe((result) => {
      if (result === 'assigned') {
        this.ordersStore.ensureById(order.id);
      } else if (isOptimisticAssignmentResult(result)) {
        this.ordersStore.ensureById(order.id);
      }
    });
  }

  onStatusFilterChange(status: DeliveryStatus | 'all') {
    this.selectedStatus.set(status);
  }

  onDriverFilterChange(driverId: string | 'all') {
    this.selectedDriver.set(driverId);
  }

  getDriverName(driverId: string | null | undefined): string {
    if (!driverId) return 'Sin asignar';
    const driver = this.drivers().find((d) => d.id === driverId);
    return driver?.name || 'Desconocido';
  }

  formatTime(isoString: string | null | undefined): string {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatCurrency(amount: number | null | undefined): string {
    if (!amount) return '$0';
    return `$${amount.toLocaleString('es-CO')}`;
  }

  private loadDrivers(tenantId: string, branchId: string) {
    this.driverService.getAvailableDrivers(tenantId, branchId, true).subscribe({
      next: (drivers) => this.drivers.set(drivers),
      error: () => this.drivers.set([]),
    });
  }

  private isDispatchableDelivery(order: Order, branchId: string): boolean {
    if (!order || !branchId || order.branchId !== branchId) {
      return false;
    }

    const orderStatus = this.orderDispatchStatus(order);
    const deliveryStatus = String(order.delivery?.status || 'pending')
      .trim()
      .toLowerCase();
    const isDelivery = !!order.delivery || order.requiresDelivery === true;
    const isReadyForDispatch = ['ready', 'served'].includes(orderStatus);
    const isDeliveryOpen = !['delivered', 'cancelled', 'failed'].includes(
      deliveryStatus,
    );

    return isDelivery && isReadyForDispatch && isDeliveryOpen;
  }

  private orderDispatchStatus(order: Order): string {
    const itemStatuses = (order.items || [])
      .map((item) => this.normalizeItemStatus(item.status ?? ''))
      .filter((status) => status !== 'cancelled');

    if (itemStatuses.length > 0) {
      if (itemStatuses.every((status) => status === 'served')) {
        return 'served';
      }

      if (itemStatuses.every((status) => ['ready', 'served'].includes(status))) {
        return 'ready';
      }
    }

    return String(order.status || '').trim().toLowerCase();
  }

  private normalizeItemStatus(status: string): string {
    const normalized = String(status || '').trim().toLowerCase();

    switch (normalized) {
      case 'inpreparation':
        return 'preparing';
      default:
        return normalized;
    }
  }
}
