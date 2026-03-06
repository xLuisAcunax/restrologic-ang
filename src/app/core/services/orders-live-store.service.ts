import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { OrderService } from './order.service';
import { BranchSelectionService } from './branch-selection.service';
import { AuthService } from './auth.service';
import { createDayRangeIso } from '../../shared/utils/date-range.utils';
import { OrderEventsPollingService } from './order-events-polling.service';
import { Subscription } from 'rxjs';
import { RealtimeService } from './realtime.service';
import { Order } from '../models/order.model';

@Injectable({ providedIn: 'root' })
export class OrdersLiveStore {
  private ordersMap = signal<Map<string, Order>>(new Map());
  ordersList = computed(() =>
    Array.from(this.ordersMap().values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  );
  ready = signal(false);

  private orderService = inject(OrderService);
  private branchSelection = inject(BranchSelectionService);
  private auth = inject(AuthService);
  private eventPolling = inject(OrderEventsPollingService);
  private rt = inject(RealtimeService);
  private STORAGE_KEY = 'orders_snapshot_v3'; // Bump version to clear stale cache
  private currentKey: string | null = null;

  // fetch queue for created/updated/payment events
  private fetchQueue = new Set<string>();
  private fetchTimer: any = null;
  private visibilityBound = false;
  private pollingSubscription: Subscription | null = null;
  private realtimeSubscriptions: Subscription[] = [];

  constructor() {
    // DISABLED: Websocket/polling not implemented on backend yet
    // The effect below was auto-loading orders and starting polling
    // which calls endpoints that don't exist yet (404 errors)
    /*
    // React to branch changes and auth (load snapshot once per key)
    effect(() => {
      const tenantId = this.auth.me()?.tenantId;
      // Touch the reactive selectedBranchId signal so this effect re-runs on branch changes
      const _selected = this.branchSelection.selectedBranchId();
      const branchId = this.branchSelection.getEffectiveBranchId();
      const key = tenantId && branchId ? `${tenantId}:${branchId}` : null;
      if (!key) {
        this.reset();
        return;
      }

      if (this.currentKey !== key) {
        // New context: cleanup previous realtime and polling
        this.currentKey = key;
        // Try local restore first for instant UI
        const restored = this.tryRestoreSnapshot(key);
        if (restored) {
          this.ordersMap.set(restored);
          this.ready.set(true);
        } else {
          this.ready.set(false);
        }
        // Always fetch fresh in background
        this.loadInitialSnapshot(tenantId!, branchId!, true);

        // Setup realtime connection for new context and use polling until connected
        const token = this.auth.token;
      }

      // SSE removed: no event wiring
    });

    // Pause/resume polling based on tab visibility
    try {
      if (!this.visibilityBound && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () =>
          this.handleVisibilityChange()
        );
        this.visibilityBound = true;
      }
    } catch {}
    */
  }

  start() {
    // DISABLED: Websocket/polling not implemented on backend yet
    // this.beginPolling();
  }

  // --- Polling fallback/alternative ---
  private pollingTimer: any = null;
  private lastWatermark: string | null = null;
  private pollingInFlight = false;

  private beginPolling(immediate = true) {
    if (this.pollingSubscription) return;
    const tenantId = this.auth.me()?.tenantId;
    const branchId = this.branchSelection.getEffectiveBranchId();
    if (!tenantId || !branchId) return;

    this.pollingSubscription = this.eventPolling
      .startPolling(tenantId, branchId)
      .subscribe({
        next: (response) => {
          if (!response?.ok) return;

          response.events?.forEach((event) => {
            if (!event?.orderId) return;

            switch (event.eventType) {
              case 'order.created':
              case 'order.updated':
              case 'order.status_changed':
              case 'order.item_added':
              case 'order.payment_registered':
                this.enqueue(event.orderId);
                break;

              case 'order.deleted':
                this.remove(event.orderId);
                break;

              default:
                this.enqueue(event.orderId);
            }
          });
        },
        error: (err) => {
          // Silent error handling
        },
      });
  }

  private stopPolling() {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
      this.pollingSubscription = null;
    }
    const tenantId = this.auth.me()?.tenantId;
    const branchId = this.branchSelection.getEffectiveBranchId();
    if (tenantId && branchId) {
      this.eventPolling.stopPolling(tenantId, branchId);
    }
  }

  private handleVisibilityChange() {
    try {
      const hidden = (document as any).hidden;
      if (hidden) {
        this.stopPolling();
      } else {
        this.beginPolling(true);
      }
    } catch {}
  }

  // Public helpers for consumers
  getById(id: string): Order | undefined {
    return this.ordersMap().get(id);
  }
  ensureById(id: string) {
    this.enqueue(id);
  }
  ensureMany(ids: string[]) {
    ids.forEach((id) => this.enqueue(id));
  }

  private loadInitialSnapshot(
    tenantId: string,
    branchId: string,
    background = false,
  ) {
    // Intento 1: cargar sólo órdenes activas (mucho más liviano)
    if (!background) this.ready.set(false);
    this.orderService.getActiveOrders(tenantId, branchId).subscribe({
      next: (activeRes) => {
        const activeList = activeRes.data || [];
        // Si vienen órdenes activas, usar esas y finalizar
        if (activeList.length > 0) {
          const map = new Map<string, Order>();
          activeList.forEach((o) => o?.id && map.set(o.id, o));
          this.ordersMap.set(map);
          this.ready.set(true);
          this.persistSnapshot(map, `${tenantId}:${branchId}`);
          this.beginPolling();
          return;
        }
        // Fallback: rango ampliado para capturar históricas recientes (incluye públicas)
        this.loadFallbackRange(tenantId, branchId, background);
      },
      error: () => {
        // Error en activo => fallback directo
        this.loadFallbackRange(tenantId, branchId, background);
      },
    });
  }

  private loadFallbackRange(
    tenantId: string,
    branchId: string,
    background: boolean,
  ) {
    // Cargar últimos 7 días para capturar órdenes recientes (incluyendo públicas)
    const todayLocal = new Date();
    const sevenDaysAgo = new Date(todayLocal);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const startRange = createDayRangeIso(this.formatLocalDate(sevenDaysAgo));
    const endRange = createDayRangeIso(this.formatLocalDate(todayLocal));

    // Mantener ready false si era carga inicial
    const controller = new AbortController();
    const timeoutMs = 3000; // Slightly longer timeout for wider range
    const timeoutId = setTimeout(() => {
      controller.abort();
      // Mark ready with empty data; UI can show retry
      if (!this.ready()) {
        this.ordersMap.set(new Map());
        this.ready.set(true);
        this.beginPolling();
      }
    }, timeoutMs);

    this.orderService
      .getOrders(tenantId, branchId, {
        start: startRange?.start,
        end: endRange?.end,
      })
      .subscribe({
        next: (res) => {
          clearTimeout(timeoutId);
          const map = new Map<string, Order>();
          const rawCount = res.data?.length || 0;
          (res.data || []).forEach((o) => {
            if (o?.id) map.set(o.id, o);
          });
          this.ordersMap.set(map);
          this.ready.set(true);
          this.persistSnapshot(map, `${tenantId}:${branchId}`);
          this.beginPolling();
        },
        error: (err) => {
          clearTimeout(timeoutId);
          this.ordersMap.set(new Map());
          this.ready.set(true);
          this.beginPolling();
        },
      });
  }

  private enqueue(orderId: string) {
    if (!orderId) return;
    console.log('[OrdersLiveStore] Enqueueing order:', orderId);
    this.fetchQueue.add(orderId);
    if (this.fetchTimer) return;
    // Debounce small bursts
    this.fetchTimer = setTimeout(() => {
      const ids = Array.from(this.fetchQueue);
      console.log('[OrdersLiveStore] Fetching queue:', ids);
      this.fetchQueue.clear();
      this.fetchTimer = null;
      this.fetchMany(ids);
    }, 400);
  }

  private fetchMany(ids: string[]) {
    const tenantId = this.auth.me()?.tenantId;
    const branchId = this.branchSelection.getEffectiveBranchId();
    if (!tenantId || !branchId) return;

    // Fetch sequentially to avoid spikes
    const next = (i: number) => {
      if (i >= ids.length) return;
      const id = ids[i];
      this.orderService.getOrder(tenantId, branchId, id).subscribe({
        next: (res) => {
          if (res?.data?.id) {
            this.upsert(res.data);
          } else {
            // Try public endpoint as fallback
            this.orderService.getPublicOrder(id, tenantId, branchId).subscribe({
              next: (pub) => {
                if (pub?.data) {
                  const reconstructed: Order = {
                    id: id,
                    tenantId,
                    branchId,
                    tableId: '',
                    status:
                      (pub.data.status as any)?.type ||
                      (pub.data.status as any) ||
                      'created',
                    items: (pub.data as any).items || [],
                    subtotal: (pub.data as any).subtotal || 0,
                    total: (pub.data as any).total || 0,
                    createdBy: (pub.data as any).createdBy || 'public',
                    createdAt:
                      (pub.data as any).createdAt || new Date().toISOString(),
                    source: 'public-menu',
                    customer: (pub.data as any).customer,
                    orderNumber: (pub.data as any).orderNumber,
                  } as any;
                  this.upsert(reconstructed);
                }
              },
              error: (err) => {
                // Silent error
              },
            });
          }
          next(i + 1);
        },
        error: (err) => {
          // Try public endpoint on error
          this.orderService.getPublicOrder(id, tenantId, branchId).subscribe({
            next: (pub) => {
              if (pub?.data) {
                const reconstructed: Order = {
                  id: id,
                  tenantId,
                  branchId,
                  tableId: '',
                  status:
                    (pub.data.status as any)?.type ||
                    (pub.data.status as any) ||
                    'created',
                  items: (pub.data as any).items || [],
                  subtotal: (pub.data as any).subtotal || 0,
                  total: (pub.data as any).total || 0,
                  createdBy: (pub.data as any).createdBy || 'public',
                  createdAt:
                    (pub.data as any).createdAt || new Date().toISOString(),
                  source: 'public-menu',
                  customer: (pub.data as any).customer,
                  orderNumber: (pub.data as any).orderNumber,
                } as any;
                this.upsert(reconstructed);
              }
            },
            error: () => {
              // Silent error
            },
          });
          next(i + 1);
        },
      });
    };
    next(0);
  }

  private upsert(order: Order) {
    console.log('[OrdersLiveStore] Upserting order:', {
      id: order.id,
      source: order.source,
      status: order.status,
      itemsCount: order.items?.length || 0,
    });
    const map = new Map(this.ordersMap());
    const existing = map.get(order.id);
    // Si la actualización llega sin ítems (algunos eventos mínimos) conservar los anteriores
    if (
      existing &&
      (!order.items || order.items.length === 0) &&
      existing.items?.length
    ) {
      order = { ...order, items: existing.items };
    }
    map.set(order.id, order);
    this.ordersMap.set(map);
    this.schedulePersist(map);
  }

  private remove(orderId: string) {
    const map = new Map(this.ordersMap());
    map.delete(orderId);
    this.ordersMap.set(map);
    this.schedulePersist(map);
  }

  private reset() {
    this.ordersMap.set(new Map());
    this.ready.set(false);
  }

  private formatLocalDate(date: Date) {
    const year = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${year}-${m}-${d}`;
  }

  // Snapshot persistence
  private persistTimer: any = null;
  private schedulePersist(map: Map<string, Order>) {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistSnapshot(map, this.currentKey || '');
    }, 500); // debounce writes
  }

  private persistSnapshot(map: Map<string, Order>, key: string) {
    if (!key) return;
    try {
      const arr = Array.from(map.values()).slice(0, 300); // cap to 300 orders
      const payload = JSON.stringify({ key, data: arr, ts: Date.now() });
      localStorage.setItem(this.STORAGE_KEY, payload);
    } catch {}
  }

  private tryRestoreSnapshot(key: string): Map<string, Order> | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.key !== key) return null;
      // Optional staleness check (6h)
      if (Date.now() - (parsed.ts || 0) > 6 * 60 * 60 * 1000) return null;
      const orders: Order[] = Array.isArray(parsed.data) ? parsed.data : [];
      const map = new Map<string, Order>();
      orders.forEach((o) => {
        if (o?.id) map.set(o.id, o);
      });
      return map;
    } catch {
      return null;
    }
  }
}
