import {
  Injectable,
  inject,
  signal,
  computed,
  effect,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { DashboardSettingsService } from './dashboard-settings.service';
import { AuthService } from '../../core/services/auth.service';
import {
  BusinessService,
  BranchSummary,
} from '../../core/services/business.service';
import { OrderService } from '../../core/services/order.service';
import { OrdersLiveStore } from '../../core/services/orders-live-store.service';
import { BranchSelectionService } from '../../core/services/branch-selection.service';
import { createDayRangeIso } from '../utils/date-range.utils';
import { Order } from '../../core/models/order.model';

type DashboardMetrics = {
  ordersToday: number;
  salesToday: number;
  ordersPrevDay: number;
  salesPrevDay: number;
  growthOrdersPct: number; // (today-prev)/prev
  growthSalesPct: number; // (today-prev)/prev
};

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private auth = inject(AuthService);
  private business = inject(BusinessService);
  private ordersApi = inject(OrderService);
  private ordersLiveStore = inject(OrdersLiveStore);
  private settings = inject(DashboardSettingsService);
  private branchSelection = inject(BranchSelectionService);
  // SSE removed: rely on OrdersLiveStore updates and periodic refresh settings

  // State signals
  readonly tenantId = signal<string>('');
  readonly branches = signal<BranchSummary[]>([]);
  // Use global branch selection from header
  readonly selectedBranchId = computed(
    () => this.branchSelection.selectedBranchId() || '',
  );

  readonly loadingMetrics = signal<boolean>(false);
  readonly loadingRecent = signal<boolean>(false);
  readonly loadingMonthly = signal<boolean>(false);

  readonly metrics = signal<DashboardMetrics | null>(null);
  readonly recentOrders = signal<Order[]>([]);
  readonly monthlySales = signal<number[]>(new Array(12).fill(0));
  readonly monthlyOrderCounts = signal<number[]>(new Array(12).fill(0));
  readonly error = signal<string | null>(null);

  // Extra aggregations for richer dashboard
  readonly hourlySalesToday = signal<number[]>(new Array(24).fill(0));
  readonly statusToday = signal<Record<string, number>>({});
  readonly sourceToday = signal<Record<string, number>>({});
  readonly topProductsToday = signal<
    Array<{ name: string; qty: number; total: number }>
  >([]);
  readonly monthToDateSales = signal<number>(0);
  readonly prevMonthSales = signal<number>(0);
  readonly monthTarget = signal<number>(0);
  readonly monthProgressPct = signal<number>(0);

  // Derived
  readonly hasBranch = computed(() => !!this.selectedBranchId());

  private previousBranchId: string | null = null;
  private branchWatcherInterval: any = null;
  private refreshScheduled = false;

  constructor(private injector: Injector) {
    // Watch for branch changes from header and auto-refresh
    this.startBranchWatcher();

    // React to store changes (polling updates) and refresh dashboards (throttled)
    effect(() => {
      // Touch orders list to create dependency
      void this.ordersLiveStore.ordersList();
      this.scheduleRefreshSoon();
    });
  }

  private startBranchWatcher() {
    if (this.branchWatcherInterval) return;
    this.branchWatcherInterval = setInterval(() => {
      const currentBranchId = this.selectedBranchId();
      if (currentBranchId && currentBranchId !== this.previousBranchId) {
        this.previousBranchId = currentBranchId;
        this.refreshAll();
      }
    }, 500);
  }

  init() {
    if (this.tenantId()) return; // already initialized
    const user = this.auth.me();
    this.tenantId.set(user?.tenantId || '');
    if (!this.tenantId()) return;

    this.business.getBranches().subscribe({
      next: (res) => {
        const list = res || [];
        this.branches.set(list);
        if (list.length > 0) {
          // Use global branch selection; if not set, set it to first branch
          const currentBranch = this.branchSelection.selectedBranchId();
          if (!currentBranch) {
            this.branchSelection.setSelectedBranchId(list[0].id);
          }
          // Load initial datasets
          this.loadMetrics();
          this.loadRecentOrders();
          this.loadMonthlySales(new Date().getFullYear());
          this.setupAutoRefresh();
        }
      },
      error: (err) => {
        console.error('Dashboard: error loading branches', err);
        this.error.set('No se pudieron cargar las sucursales');
      },
    });
  }

  private setupAutoRefresh() {
    // Reactive timer based on settings
    runInInjectionContext(this.injector, () => {
      effect(() => {
        if (!this.hasBranch()) return;
        // Enable periodic refresh based on settings (SSE removed)
        const enabled = this.settings.autoRefreshEnabled();
        const interval = this.settings.refreshIntervalMs();
        if (!enabled) return;
        const handle = setTimeout(
          () => {
            this.refreshAll();
          },
          Math.max(1000, interval),
        );
        return () => clearTimeout(handle);
      });
    });
  }

  refreshAll() {
    if (!this.hasBranch()) return;
    this.loadMetrics();
    this.loadRecentOrders();
    this.loadMonthlySales(new Date().getFullYear());
  }

  selectBranch(branchId: string) {
    // Update global branch selection (will trigger watcher and auto-refresh)
    this.branchSelection.setSelectedBranchId(branchId);
  }

  private loadMetrics() {
    if (!this.hasBranch()) return;
    this.loadingMetrics.set(true);
    const todayLocal = this.formatLocalDate(new Date());
    const prevLocal = this.formatLocalDate(new Date(Date.now() - 86400000));
    const todayRange = createDayRangeIso(todayLocal);
    const prevRange = createDayRangeIso(prevLocal);
    if (!todayRange || !prevRange) {
      this.loadingMetrics.set(false);
      return;
    }
    const { start: startPrev, end: endPrev } = prevRange;
    const tenantId = this.tenantId();
    const branchId = this.selectedBranchId();

    // Use OrdersLiveStore for today
    const todayOrders = this.ordersLiveStore.ordersList();
    // Día previo puede seguir usando rango completo; hoy usa OrdersLiveStore.
    this.ordersApi.getActiveOrders(tenantId, branchId).subscribe({
      next: (resPrev) => {
        const prevOrders = resPrev.data || [];
        this.computeMetrics(todayOrders, prevOrders);
        this.computeTodayAggregations(todayOrders);
        this.loadingMetrics.set(false);
      },
      error: (errPrev) => {
        console.error('Dashboard prev day orders error', errPrev);
        this.computeMetrics(todayOrders, []);
        this.computeTodayAggregations(todayOrders);
        this.loadingMetrics.set(false);
      },
    });
  }

  private computeMetrics(todayOrders: Order[], prevOrders: Order[]) {
    const salesToday = todayOrders.reduce((a, o) => a + (o.total || 0), 0);
    const salesPrev = prevOrders.reduce((a, o) => a + (o.total || 0), 0);
    const ordersToday = todayOrders.length;
    const ordersPrev = prevOrders.length;

    const growthOrdersPct =
      ordersPrev > 0 ? ((ordersToday - ordersPrev) / ordersPrev) * 100 : 100;
    const growthSalesPct =
      salesPrev > 0 ? ((salesToday - salesPrev) / salesPrev) * 100 : 100;

    this.metrics.set({
      ordersToday,
      salesToday,
      ordersPrevDay: ordersPrev,
      salesPrevDay: salesPrev,
      growthOrdersPct,
      growthSalesPct,
    });
  }

  private computeTodayAggregations(orders: Order[]) {
    // Hourly sales
    const hours = new Array(24).fill(0);
    // Status counts
    const statusMap: Record<string, number> = {};
    // Source counts
    const sourceMap: Record<string, number> = {};
    // Top products
    const productMap: Record<
      string,
      { name: string; qty: number; total: number }
    > = {};

    orders.forEach((o) => {
      const d = new Date(o.createdAt);
      const h = d.getHours();
      hours[h] += o.total || 0;

      const st = String((o.status as any) || '').toLowerCase();
      statusMap[st] = (statusMap[st] || 0) + 1;

      const src = o.source || 'internal';
      sourceMap[src] = (sourceMap[src] || 0) + 1;

      (o.items || []).forEach((it) => {
        const key = it.productId + '|' + (it.productName || '');
        if (!productMap[key]) {
          productMap[key] = {
            name: it.productName || key.split('|')[1] || 'Producto',
            qty: 0,
            total: 0,
          };
        }
        productMap[key].qty += ((it as any).quantity || 0) as number;
        productMap[key].total +=
          (it.unitPrice || 0) * (((it as any).quantity || 0) as number);
      });
    });

    const top = Object.values(productMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    this.hourlySalesToday.set(hours);
    this.statusToday.set(statusMap);
    this.sourceToday.set(sourceMap);
    this.topProductsToday.set(top);
  }

  private loadRecentOrders(limit = 8) {
    if (!this.hasBranch()) return;
    this.loadingRecent.set(true);
    // Use OrdersLiveStore for today
    const list = this.ordersLiveStore
      .ordersList()
      .slice()
      .sort((a, b) => {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
    this.recentOrders.set(list.slice(0, limit));
    this.loadingRecent.set(false);
  }

  private loadMonthlySales(year: number) {
    if (!this.hasBranch()) return;
    this.loadingMonthly.set(true);
    const startIso = new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString();
    const endIso = new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString();
    // Para métricas mensuales seguimos usando rango completo
    this.ordersApi
      .getOrders(this.tenantId(), this.selectedBranchId(), {
        start: startIso,
        end: endIso,
      })
      .subscribe({
        next: (res) => {
          const data = res.data || [];
          const monthlyTotals = new Array(12).fill(0);
          const monthlyCounts = new Array(12).fill(0);
          data.forEach((o) => {
            const d = new Date(o.createdAt);
            const m = d.getMonth();
            monthlyTotals[m] += o.total || 0;
            monthlyCounts[m] += 1;
          });
          this.monthlySales.set(monthlyTotals);
          this.monthlyOrderCounts.set(monthlyCounts);

          // Month-to-date and previous month totals for goal progress
          const now = new Date();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
          const prevMonth = prevMonthDate.getMonth();
          const prevYear = prevMonthDate.getFullYear();

          let mtd = 0;
          let prevTotal = 0;
          data.forEach((o) => {
            const d = new Date(o.createdAt);
            const isCurrentMonth =
              d.getFullYear() === currentYear && d.getMonth() === currentMonth;
            const isPrevMonth =
              d.getFullYear() === prevYear && d.getMonth() === prevMonth;
            if (isCurrentMonth && d.getDate() <= now.getDate()) {
              mtd += o.total || 0;
            }
            if (isPrevMonth) {
              prevTotal += o.total || 0;
            }
          });
          // Use configured monthly target if defined (>0); fallback heuristic +10% sobre mes anterior
          const configuredTarget = this.settings.getSettings().monthlyTargetCOP;
          const target =
            configuredTarget > 0 ? configuredTarget : prevTotal * 1.1;
          const progressPct = target > 0 ? (mtd / target) * 100 : 0;
          this.monthToDateSales.set(mtd);
          this.prevMonthSales.set(prevTotal);
          this.monthTarget.set(target);
          this.monthProgressPct.set(progressPct);
          this.loadingMonthly.set(false);
        },
        error: (err) => {
          console.error('Dashboard monthly sales error', err);
          this.loadingMonthly.set(false);
          this.monthlySales.set(new Array(12).fill(0));
          this.monthlyOrderCounts.set(new Array(12).fill(0));
        },
      });
  }

  // Helper
  private formatLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Public refreshers
  reloadMetrics() {
    this.loadMetrics();
  }
  reloadRecent() {
    this.loadRecentOrders();
  }
  reloadMonthly(year?: number) {
    this.loadMonthlySales(year || new Date().getFullYear());
  }

  private scheduleRefreshSoon() {
    if (this.refreshScheduled) return;
    this.refreshScheduled = true;
    setTimeout(() => {
      this.refreshScheduled = false;
      this.refreshAll();
    }, 1200);
  }
}
