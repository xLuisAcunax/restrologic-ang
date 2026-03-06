import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../../core/services/auth.service';
import { OrderService } from '../../../../core/services/order.service';
import { DeliveryStatusBadge } from '../../../../shared/components/delivery-status-badge/delivery-status-badge.component';
import { DeliveryStatus, Order } from '../../../../core/models/order.model';

@Component({
  selector: 'app-my-deliveries',
  standalone: true,
  imports: [CommonModule, DeliveryStatusBadge],
  templateUrl: './my-deliveries.component.html',
  styleUrls: ['./my-deliveries.component.css'],
})
export class MyDeliveriesComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private orderService = inject(OrderService);

  orders = signal<Order[]>([]);
  loading = signal(true);
  autoRefreshInterval: any = null;

  tenantId = computed(() => this.auth.me()?.tenantId || '');
  branchId = computed(() => this.auth.me()?.branchId || '');
  driverId = computed(() => this.auth.me()?.id || '');

  pendingOrders = computed(() =>
    this.orders().filter(
      (o) =>
        o.delivery?.status === 'pending' || o.delivery?.status === 'assigned',
    ),
  );

  activeOrders = computed(() =>
    this.orders().filter(
      (o) =>
        o.delivery?.status === 'accepted' ||
        o.delivery?.status === 'picked_up' ||
        o.delivery?.status === 'in_transit',
    ),
  );

  completedOrders = computed(() =>
    this.orders().filter(
      (o) =>
        o.delivery?.status === 'delivered' ||
        o.delivery?.status === 'cancelled' ||
        o.delivery?.status === 'failed',
    ),
  );

  ngOnInit() {
    if (this.tenantId() && this.branchId() && this.driverId()) {
      this.loadMyDeliveries();
      this.startAutoRefresh();
    } else {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.stopAutoRefresh();
  }

  loadMyDeliveries() {
    const tid = this.tenantId();
    const bid = this.branchId();
    const did = this.driverId();

    if (!tid || !bid || !did) {
      console.warn('[MyDeliveries] Missing required IDs');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    console.log('[MyDeliveries] Loading deliveries for driver:', did);
    console.log('[MyDeliveries] TenantId:', tid, 'BranchId:', bid);

    // Use the new driver-specific endpoint
    this.orderService.getDriverOrders(tid, bid, did).subscribe({
      next: (orders) => {
        console.log('[MyDeliveries] Orders received:', orders.length);
        console.log('[MyDeliveries] Orders:', orders);

        this.orders.set(orders);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[MyDeliveries] Error loading deliveries:', err);
        this.loading.set(false);
      },
    });
  }

  startAutoRefresh() {
    this.autoRefreshInterval = setInterval(() => {
      if (this.tenantId() && this.branchId() && this.driverId()) {
        this.loadMyDeliveries();
      }
    }, 10000);
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
  }

  updateStatus(order: Order, newStatus: DeliveryStatus) {
    const tid = this.tenantId();
    const bid = this.branchId();

    if (!tid || !bid) return;

    this.orderService
      .updateDeliveryStatus(tid, bid, order.id, { status: newStatus })
      .subscribe({
        next: (updatedOrder) => {
          console.log('[MyDeliveries] Status updated:', updatedOrder);
          this.loadMyDeliveries();
        },
        error: (err) => {
          console.error('[MyDeliveries] Error updating status:', err);
        },
      });
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
