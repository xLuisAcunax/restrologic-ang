import { Component, OnInit, computed, inject } from '@angular/core';

import { AuthService } from '../../../../core/services/auth.service';
import { OrderService } from '../../../../core/services/order.service';
import { DeliveryStatusBadge } from '../../../../shared/components/delivery-status-badge/delivery-status-badge.component';
import { DeliveryStatus } from '../../../../core/models/order.model';
import { OrdersLiveStore } from '../../../../core/services/orders-live-store.service';

@Component({
  selector: 'app-my-deliveries',
  standalone: true,
  imports: [DeliveryStatusBadge],
  templateUrl: './my-deliveries.component.html',
  styleUrls: ['./my-deliveries.component.css'],
})
export class MyDeliveriesComponent implements OnInit {
  private auth = inject(AuthService);
  private orderService = inject(OrderService);
  private ordersStore = inject(OrdersLiveStore);

  loading = computed(
    () => !!this.branchId() && !!this.driverId() && !this.ordersStore.ready(),
  );

  tenantId = computed(() => this.auth.me()?.tenantId || '');
  branchId = computed(() => this.auth.me()?.branchId || '');
  driverId = computed(() => this.auth.me()?.id || '');

  myOrders = computed(() => {
    const branchId = this.branchId();
    const driverId = this.driverId();

    return this.ordersStore.ordersList().filter((order) => {
      if (!branchId || !driverId) {
        return false;
      }

      return (
        order.branchId === branchId &&
        order.delivery?.driverId === driverId &&
        !!order.delivery
      );
    });
  });

  pendingOrders = computed(() =>
    this.myOrders().filter(
      (o) =>
        o.delivery?.status === 'pending' || o.delivery?.status === 'assigned',
    ),
  );

  activeOrders = computed(() =>
    this.myOrders().filter(
      (o) =>
        o.delivery?.status === 'accepted' ||
        o.delivery?.status === 'picked_up' ||
        o.delivery?.status === 'in_transit',
    ),
  );

  completedOrders = computed(() =>
    this.myOrders().filter(
      (o) =>
        o.delivery?.status === 'delivered' ||
        o.delivery?.status === 'cancelled' ||
        o.delivery?.status === 'failed',
    ),
  );

  ngOnInit() {
    this.ordersStore.start();
  }

  updateStatus(orderId: string, newStatus: DeliveryStatus) {
    const tid = this.tenantId();
    const bid = this.branchId();

    if (!tid || !bid) return;

    this.orderService
      .updateDeliveryStatus(tid, bid, orderId, { status: newStatus })
      .subscribe({
        next: () => {
          this.ordersStore.ensureById(orderId);
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

