import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService } from '../../../core/services/order.service';
import { DriverService, Driver } from '../../../core/services/driver.service';
import { Dialog } from '@angular/cdk/dialog';
import { DeliveryAssignmentModal } from '../../../shared/components/delivery-assignment-modal/delivery-assignment-modal.component';
import { DeliveryStatusBadge } from '../../../shared/components/delivery-status-badge/delivery-status-badge.component';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { DeliveryStatus, Order } from '../../../core/models/order.model';

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
export class DeliveriesComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private orderService = inject(OrderService);
  private driverService = inject(DriverService);
  private dialog = inject(Dialog);
  private branchSelection = inject(BranchSelectionService);

  // State
  orders = signal<Order[]>([]);
  drivers = signal<Driver[]>([]);
  loading = signal(true);
  selectedStatus = signal<DeliveryStatus | 'all'>('all');
  selectedDriver = signal<string | 'all'>('all');
  autoRefreshInterval: any = null;

  // Computed
  tenantId = computed(() => this.auth.me()?.tenantId || '');
  branchId = computed(() => {
    // Para usuarios admin, usar la sucursal seleccionada en el header (BranchSelectionService)
    const explicit = this.branchSelection.selectedBranchId();
    if (explicit) return explicit;
    // Usuarios regulares tienen branchId en su perfil
    return this.auth.me()?.branchId || '';
  });

  filteredOrders = computed(() => {
    let result = this.orders();

    if (this.selectedStatus() !== 'all') {
      result = result.filter(
        (o) => o.delivery?.status === this.selectedStatus(),
      );
    }

    if (this.selectedDriver() !== 'all') {
      result = result.filter(
        (o) => o.delivery?.driverId === this.selectedDriver(),
      );
    }

    return result;
  });

  pendingCount = computed(
    () => this.orders().filter((o) => o.delivery?.status === 'pending').length,
  );

  ngOnInit() {
    // Solo cargar si hay sucursal seleccionada
    if (this.branchId()) {
      this.loadOrders();
      this.loadDrivers();
      this.startAutoRefresh();
    } else {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.stopAutoRefresh();
  }

  loadOrders() {
    const tid = this.tenantId();
    const bid = this.branchId();
    if (!tid) {
      console.warn('[Deliveries] Missing tenant ID');
      return;
    }
    if (!bid) {
      console.warn('[Deliveries] No branch selected.');
      this.loading.set(false);
      this.orders.set([]);
      return;
    }

    this.loading.set(true);
    console.log('[Deliveries] Loading orders for:', { tid, bid });
    // Primer intento: endpoint filtrado por requiresDelivery
    this.orderService.getDeliveryOrders(tid, bid).subscribe({
      next: (response) => {
        const orders = response?.data || [];
        console.log(
          '[Deliveries] Primary endpoint result (requiresDelivery=true):',
          orders,
        );
        if (!orders || orders.length === 0) {
          console.warn(
            '[Deliveries] Empty result. Fallback: loading all orders and filtering manually.',
          );
          this.loadOrdersFallback(tid, bid);
          return;
        }
        orders.forEach((order: Order, idx: number) => {
          console.log(`[Deliveries] (Primary) Order ${idx}:`, {
            id: order.id,
            orderNumber: order.code,
            source: order.source,
            status: order.status,
            hasDelivery: !!order.delivery,
            requiresDelivery: order.delivery?.requiresDelivery,
            deliveryStatus: order.delivery?.status,
            deliveryDriverId: order.delivery?.driverId,
          });
        });
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[Deliveries] Primary endpoint error:', err);
        console.warn(
          '[Deliveries] Fallback after error: loading all orders and filtering manually.',
        );
        this.loadOrdersFallback(tid, bid);
      },
    });
  }

  private loadOrdersFallback(tid: string, bid: string) {
    this.orderService.getOrders(tid, bid).subscribe({
      next: (resp) => {
        const all = resp.data || [];
        console.log('[Deliveries][Fallback] All orders count:', all.length);
        const deliveryCandidates = all.filter((o: any) => {
          // Solo incluir órdenes que explícitamente requieren delivery
          return (
            (o.delivery && o.delivery.requiresDelivery === true) ||
            o.requiresDelivery === true
          );
        });
        console.log(
          '[Deliveries][Fallback] Candidates count:',
          deliveryCandidates.length,
        );
        // Construir delivery object mínimo si falta
        const normalized = deliveryCandidates.map((o: any) => {
          if (!o.delivery) {
            o.delivery = {
              requiresDelivery: true,
              address: o.customer?.address,
              distanceKm: o.distanceKm ?? null,
              fee: o.deliveryFee ?? null,
              driverId: o.deliveryDriverId ?? null,
              status: (o.deliveryStatus as DeliveryStatus) || 'pending',
              assignedAt: null,
              pickedUpAt: null,
              deliveredAt: null,
              cancelledAt: null,
              failedAt: null,
              eta: null,
              location: null,
              routeEtaMinutes: null,
              trackingId: o.deliveryTracking?.id ?? null,
              notes: o.customer?.notes ?? null,
            };
          }
          return o as Order;
        });
        normalized.forEach((o, i) => {
          console.log(`[Deliveries][Fallback] Normalized ${i}:`, {
            id: o.id,
            orderNumber: o.code,
            deliveryStatus: o.delivery?.status,
            address: o.delivery?.address,
          });
        });
        this.orders.set(normalized);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[Deliveries][Fallback] Error loading all orders:', err);
        this.loading.set(false);
      },
    });
  }

  loadDrivers() {
    const tid = this.tenantId();
    const bid = this.branchId();
    if (!tid || !bid) return;

    this.driverService.getAvailableDrivers(tid, bid, true).subscribe({
      next: (drivers) => this.drivers.set(drivers),
      error: (err) => console.error('Error loading drivers:', err),
    });
  }

  openAssignmentModal(order: Order) {
    console.log('[Deliveries] Opening assignment modal for order:', {
      id: order.id,
      orderNumber: order.code,
      branchId: order.branchId,
      delivery: order.delivery,
      requiresDelivery: order.delivery?.requiresDelivery,
    });

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
        this.loadOrders(); // Refresh after assignment
      } else if (isOptimisticAssignmentResult(result)) {
        const updated = this.orders().map((o) => {
          if (o.id !== order.id) return o;
          const now = new Date().toISOString();
          const raw: any = o; // acceso a campos planos si existen
          if (!o.delivery) {
            o.delivery = {
              requiresDelivery: true,
              address: raw.customer?.address,
              distanceKm: raw.distanceKm ?? null,
              fee: raw.deliveryFee ?? raw.delivery?.fee ?? null,
              driverId: result.driverId,
              status: 'pending',
              assignedAt: now,
              pickedUpAt: null,
              deliveredAt: null,
              cancelledAt: null,
              failedAt: null,
              eta: null,
              location: null,
              routeEtaMinutes: null,
              trackingId: raw.deliveryTracking?.id ?? null,
              notes: result.notes ?? raw.customer?.notes ?? null,
            };
          } else {
            o.delivery.driverId = result.driverId;
            o.delivery.assignedAt = now;
            if (result.notes) o.delivery.notes = result.notes;
          }
          return { ...o };
        });
        this.orders.set(updated);
      }
    });
  }

  startAutoRefresh() {
    // Refresh every 10 seconds
    if (!this.branchId()) return; // Evitar polling sin sucursal
    this.autoRefreshInterval = setInterval(() => {
      if (this.branchId()) {
        this.loadOrders();
      }
    }, 10000);
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
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
}
