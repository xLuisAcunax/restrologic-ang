import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../../shared/services/dashboard.service';
import { AuthService } from '../../../core/services/auth.service';
import { Order } from '../../../core/models/order.model';

@Component({
  selector: 'admin-dashboard',
  imports: [CommonModule],
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  readonly dashboard = inject(DashboardService);
  private readonly auth = inject(AuthService);

  readonly displayName = computed(() => {
    const me = this.auth.me();
    return me?.fullName || me?.email || 'Admin';
  });

  readonly todayLabel = computed(() =>
    new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date()),
  );

  readonly latestTopProducts = computed(() =>
    this.dashboard.topProductsToday().slice(0, 5),
  );
  readonly latestOrders = computed(() =>
    this.dashboard.recentOrders().slice(0, 6),
  );
  readonly hourlyBars = computed(() => {
    const hours = this.dashboard.hourlySalesToday();
    const max = Math.max(...hours, 0);
    return hours.map((value, hour) => ({
      hour,
      value,
      heightPct: max > 0 ? Math.max(8, Math.round((value / max) * 100)) : 8,
    }));
  });

  constructor() {
    this.dashboard.init();
  }

  metricTrendClass(value: number): string {
    if (value > 0) return 'text-success';
    if (value < 0) return 'text-error';
    return 'text-base-content/40';
  }

  metricTrendLabel(value: number): string {
    if (!Number.isFinite(value) || value === 0) return '0%';
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(1)}%`;
  }

  orderStatusLabel(order: Order): string {
    const normalized = String(order.status || '').toLowerCase();
    switch (normalized) {
      case 'pending':
        return 'Pendiente';
      case 'confirmed':
        return 'Confirmada';
      case 'preparing':
      case 'inpreparation':
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
        return normalized || 'Sin estado';
    }
  }

  orderStatusBadgeClass(order: Order): string {
    const normalized = String(order.status || '').toLowerCase();
    switch (normalized) {
      case 'pending':
        return 'badge-warning';
      case 'confirmed':
      case 'ready':
        return 'badge-info';
      case 'preparing':
      case 'inpreparation':
        return 'badge-warning';
      case 'served':
      case 'paid':
      case 'closed':
        return 'badge-success';
      case 'cancelled':
        return 'badge-error';
      default:
        return 'badge-ghost';
    }
  }

  orderPartyLabel(order: Order): string {
    if (order.tableName) return order.tableName;
    if (order.customer?.name) return order.customer.name;
    return `Orden #${order.code || order.id.slice(0, 8)}`;
  }

  orderSecondaryLabel(order: Order): string {
    if (order.customer?.phone) return order.customer.phone;
    if (order.source === 'public-menu') return 'Menú público';
    return order.source || 'Operación interna';
  }

  productProgress(index: number): number {
    const products = this.latestTopProducts();
    const maxQty = Math.max(...products.map((product) => product.qty), 0);
    const current = products[index]?.qty || 0;
    if (maxQty <= 0) return 0;
    return Math.round((current / maxQty) * 100);
  }
}
