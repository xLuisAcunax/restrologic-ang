import { Injectable, effect, inject, Injector } from '@angular/core';
import { OrdersLiveStore } from '../../core/services/orders-live-store.service';
import { OrdersBadgeService } from './orders-badge.service';
import { Order, OrderItemStatusType } from '../../core/models/order.model';

@Injectable({ providedIn: 'root' })
export class OrdersBadgeInitializerService {
  private store = inject(OrdersLiveStore);
  private badge = inject(OrdersBadgeService);
  private injector = inject(Injector);
  private debounceTimer: any = null;
  private visibilityBound = false;

  constructor() {
    effect(
      () => {
        // Skip recompute while tab hidden to avoid flicker on background polling
        try {
          const hidden = (document as any)?.hidden === true;
          if (hidden) {
            return;
          }
        } catch {}

        const list = this.store.ordersList();
        const count = list.filter((o) => this.isOperationallyActive(o)).length;
        this.scheduleBadgeUpdate(count);
      },
      { injector: this.injector }
    );

    // Bind visibility change to recompute immediately on focus
    try {
      if (!this.visibilityBound && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          try {
            const hidden = (document as any).hidden;
            if (!hidden) {
              // Force immediate recompute on focus by reading orders list
              const list = this.store.ordersList();
              const count = list.filter((o) =>
                this.isOperationallyActive(o)
              ).length;
              this.badge.setInProgressCount(count);
            }
          } catch {}
        });
        this.visibilityBound = true;
      }
    } catch {}
  }

  private scheduleBadgeUpdate(count: number) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.badge.setInProgressCount(count);
      this.debounceTimer = null;
    }, 250);
  }

  private isOperationallyActive(order: Order): boolean {
    const status = this.normalizeOrderStatus(order);
    // Exclude terminal or non-operational states
    if (['cancelled', 'paid', 'closed', 'served', 'ready'].includes(status))
      return false;

    // Require at least one item that still needs work (pending/preparing)
    const activeItems = (order.items || []).filter((item: any) => {
      const st = this.normalizeItemStatus((item as any).status);
      return ['pending', 'preparing'].includes(st);
    });

    // If all non-cancelled items are served/ready, do not count the order
    const nonCancelled = (order.items || []).filter((item: any) => {
      const st = this.normalizeItemStatus((item as any).status);
      return st !== 'cancelled';
    });
    const allServed =
      nonCancelled.length > 0 &&
      nonCancelled.every((item: any) =>
        ['served', 'ready'].includes(
          this.normalizeItemStatus((item as any).status)
        )
      );

    if (allServed) return false;

    return activeItems.length > 0;
  }

  private normalizeOrderStatus(order: Order): string {
    const raw = order.status as any;
    if (typeof raw === 'string') return raw.toLowerCase();
    if (raw && typeof raw === 'object' && 'type' in raw) {
      return String((raw as any).type || '').toLowerCase();
    }
    return 'created';
  }

  private normalizeItemStatus(raw: any): OrderItemStatusType {
    const status =
      typeof raw === 'string'
        ? raw
        : (raw &&
            typeof raw === 'object' &&
            'type' in raw &&
            (raw as any).type) ||
          '';
    const normalized = String(status || '')
      .toLowerCase()
      .trim();
    const allowed: OrderItemStatusType[] = [
      'pending',
      'preparing',
      'ready',
      'served',
      'cancelled',
    ];
    return (
      allowed.includes(normalized as OrderItemStatusType)
        ? normalized
        : 'pending'
    ) as OrderItemStatusType;
  }
}
