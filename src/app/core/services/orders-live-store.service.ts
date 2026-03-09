import { Injectable, Injector, computed, effect, inject, signal } from '@angular/core';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { BranchSelectionService } from './branch-selection.service';
import { Order } from '../models/order.model';
import { OrderService } from './order.service';
import { RealtimeService } from './realtime.service';

@Injectable({ providedIn: 'root' })
export class OrdersLiveStore {
  private readonly orderService = inject(OrderService);
  private readonly branchSelection = inject(BranchSelectionService);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(RealtimeService);
  private readonly injector = inject(Injector);

  private readonly ordersMap = signal<Map<string, Order>>(new Map());
  readonly ordersList = computed(() =>
    Array.from(this.ordersMap().values()).sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    ),
  );
  readonly ready = signal(false);

  private readonly storageKey = 'orders_snapshot_v4';
  private currentKey: string | null = null;
  private activationVersion = 0;
  private readonly realtimeSubscription: Subscription;
  private fetchQueue = new Set<string>();
  private fetchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.realtimeSubscription = this.realtime.orderEvents$.subscribe((event) => {
      this.handleRealtimeEvent(event);
    });

    effect(
      () => {
        const tenantId = this.auth.me()?.tenantId || null;
        const token = this.auth.token;
        const _selectedBranchId = this.branchSelection.selectedBranchId();
        const branchId = this.branchSelection.getEffectiveBranchId();
        const key = tenantId && branchId && token ? `${tenantId}:${branchId}` : null;

        if (!key || !tenantId || !branchId) {
          this.currentKey = null;
          this.activationVersion += 1;
          this.reset();
          void this.realtime.disconnect();
          return;
        }

        if (this.currentKey !== key) {
          void this.activateContext(tenantId, branchId, key);
          return;
        }

        void this.realtime.connectToOrdersBranch(branchId);
      },
      { injector: this.injector },
    );
  }

  start(): void {
    const branchId = this.branchSelection.getEffectiveBranchId();
    if (branchId) {
      void this.realtime.connectToOrdersBranch(branchId);
    }
  }

  getById(id: string): Order | undefined {
    return this.ordersMap().get(id);
  }

  ensureById(id: string): void {
    this.enqueue(id);
  }

  ensureMany(ids: string[]): void {
    ids.forEach((id) => this.enqueue(id));
  }

  private async activateContext(
    tenantId: string,
    branchId: string,
    key: string,
  ): Promise<void> {
    const version = ++this.activationVersion;
    this.currentKey = key;

    const restored = this.tryRestoreSnapshot(key);
    if (restored) {
      this.ordersMap.set(restored);
      this.ready.set(true);
    } else {
      this.ordersMap.set(new Map());
      this.ready.set(false);
    }

    try {
      await this.realtime.connectToOrdersBranch(branchId);
    } catch {
      // Keep the snapshot or empty state; API refresh below still runs.
    }

    this.loadInitialSnapshot(branchId, version);
  }

  private loadInitialSnapshot(branchId: string, version: number): void {
    this.orderService.listOpenOrders({ branchId, expand: 'items' }).subscribe({
      next: (orders) => {
        if (version !== this.activationVersion) {
          return;
        }

        const map = new Map<string, Order>();
        (orders || []).forEach((order) => {
          if (order?.id && !this.isTerminalOrder(order)) {
            map.set(order.id, order);
          }
        });

        this.ordersMap.set(map);
        this.ready.set(true);
        this.persistSnapshot(map, this.currentKey || '');
      },
      error: () => {
        if (version !== this.activationVersion) {
          return;
        }

        if (!this.ready()) {
          this.ordersMap.set(new Map());
          this.ready.set(true);
        }
      },
    });
  }

  private handleRealtimeEvent(event: {
    name: string;
    orderId?: string;
    branchId?: string;
  }): void {
    const currentBranchId = this.branchSelection.getEffectiveBranchId();
    if (!currentBranchId) {
      return;
    }

    if (event.branchId && event.branchId !== currentBranchId) {
      return;
    }

    if (!event.orderId) {
      return;
    }

    if (event.name === 'OrderDeleted') {
      this.remove(event.orderId);
      return;
    }

    this.enqueue(event.orderId);
  }

  private enqueue(orderId: string): void {
    if (!orderId) {
      return;
    }

    this.fetchQueue.add(orderId);
    if (this.fetchTimer) {
      return;
    }

    this.fetchTimer = setTimeout(() => {
      const ids = Array.from(this.fetchQueue);
      this.fetchQueue.clear();
      this.fetchTimer = null;
      this.fetchMany(ids);
    }, 250);
  }

  private fetchMany(ids: string[]): void {
    const next = (index: number) => {
      if (index >= ids.length) {
        return;
      }

      const orderId = ids[index];
      forkJoin({
        order: this.orderService.getOrder(orderId),
        items: this.orderService
          .listOrderItems(orderId)
          .pipe(catchError(() => of([] as any[]))),
      }).subscribe({
        next: ({ order, items }) => {
          const merged: Order = {
            ...order,
            items: Array.isArray(items) ? (items as any) : [],
          };
          this.upsert(merged);
          next(index + 1);
        },
        error: () => {
          next(index + 1);
        },
      });
    };

    next(0);
  }

  private upsert(order: Order): void {
    if (this.isTerminalOrder(order)) {
      this.remove(order.id);
      return;
    }

    const map = new Map(this.ordersMap());
    const existing = map.get(order.id);

    if (
      existing &&
      (!order.items || order.items.length === 0) &&
      existing.items?.length
    ) {
      order = { ...order, items: existing.items };
    }

    map.set(order.id, order);
    this.ordersMap.set(map);
    this.persistSnapshot(map, this.currentKey || '');
  }

  private remove(orderId: string): void {
    const map = new Map(this.ordersMap());
    map.delete(orderId);
    this.ordersMap.set(map);
    this.persistSnapshot(map, this.currentKey || '');
  }

  private isTerminalOrder(order: Order): boolean {
    const status = String(order?.status || '').trim().toLowerCase();
    return ['paid', 'closed', 'cancelled'].includes(status);
  }

  private reset(): void {
    this.ordersMap.set(new Map());
    this.ready.set(false);
    this.fetchQueue.clear();
    if (this.fetchTimer) {
      clearTimeout(this.fetchTimer);
      this.fetchTimer = null;
    }
  }

  private persistSnapshot(map: Map<string, Order>, key: string): void {
    if (!key) {
      return;
    }

    try {
      const payload = JSON.stringify({
        key,
        ts: Date.now(),
        data: Array.from(map.values()).slice(0, 300),
      });
      localStorage.setItem(this.storageKey, payload);
    } catch {}
  }

  private tryRestoreSnapshot(key: string): Map<string, Order> | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || parsed.key !== key) {
        return null;
      }

      if (Date.now() - (parsed.ts || 0) > 6 * 60 * 60 * 1000) {
        return null;
      }

      const map = new Map<string, Order>();
      const list: Order[] = Array.isArray(parsed.data) ? parsed.data : [];
      list.forEach((order) => {
        if (order?.id && !this.isTerminalOrder(order)) {
          map.set(order.id, order);
        }
      });

      return map;
    } catch {
      return null;
    }
  }
}
