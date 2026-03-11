import {
  Injectable,
  inject,
  signal,
  computed,
  effect,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { DashboardSettingsService } from './dashboard-settings.service';
import { AuthService } from '../../core/services/auth.service';
import {
  BusinessService,
  BranchSummary,
} from '../../core/services/business.service';
import { OrdersLiveStore } from '../../core/services/orders-live-store.service';
import { BranchSelectionService } from '../../core/services/branch-selection.service';
import { Order } from '../../core/models/order.model';
import { environment } from '../../../environments/environment';

type DashboardMetrics = {
  ordersToday: number;
  salesToday: number;
  ordersPrevDay: number;
  salesPrevDay: number;
  growthOrdersPct: number;
  growthSalesPct: number;
};

type DashboardSummaryResponse = {
  date: string;
  metrics: {
    ordersToday: number;
    salesToday: number;
    ordersPrevDay: number;
    salesPrevDay: number;
    growthOrdersPct: number;
    growthSalesPct: number;
    averageTicketToday: number;
  };
  tables: {
    active: number;
    total: number;
    occupancyPct: number;
  };
  hourlySalesToday: number[];
  topProductsToday: Array<{ productId: string; name: string; qty: number; total: number }>;
  recentOrders: Array<{
    id: string;
    code: string;
    tableId: string;
    tableName?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    source?: string | null;
    status: string;
    createdAt: string;
    total: number;
  }>;
  monthly: {
    monthToDateSales: number;
    prevMonthSales: number;
  };
};

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private business = inject(BusinessService);
  private ordersLiveStore = inject(OrdersLiveStore);
  private settings = inject(DashboardSettingsService);
  private branchSelection = inject(BranchSelectionService);
  private readonly base = environment.apiBaseUrl;

  readonly tenantId = signal<string>('');
  readonly branches = signal<BranchSummary[]>([]);
  readonly selectedBranchId = computed(
    () => this.branchSelection.selectedBranchId() || '',
  );

  readonly loadingMetrics = signal<boolean>(false);
  readonly loadingRecent = signal<boolean>(false);
  readonly loadingMonthly = signal<boolean>(false);
  readonly loadingTables = signal<boolean>(false);

  readonly metrics = signal<DashboardMetrics | null>(null);
  readonly recentOrders = signal<Order[]>([]);
  readonly monthlySales = signal<number[]>(new Array(12).fill(0));
  readonly monthlyOrderCounts = signal<number[]>(new Array(12).fill(0));
  readonly error = signal<string | null>(null);

  readonly hourlySalesToday = signal<number[]>(new Array(24).fill(0));
  readonly topProductsToday = signal<
    Array<{ name: string; qty: number; total: number }>
  >([]);
  readonly monthToDateSales = signal<number>(0);
  readonly prevMonthSales = signal<number>(0);
  readonly monthTarget = signal<number>(0);
  readonly monthProgressPct = signal<number>(0);
  readonly totalTables = signal<number>(0);
  readonly activeTablesCount = signal<number>(0);
  readonly activeTablesPct = signal<number>(0);
  readonly averageTicketToday = signal<number>(0);

  readonly hasBranch = computed(() => !!this.selectedBranchId());

  private previousBranchId: string | null = null;
  private branchWatcherInterval: any = null;
  private refreshScheduled = false;

  constructor(private injector: Injector) {
    this.startBranchWatcher();

    effect(() => {
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
    if (this.tenantId()) return;
    const user = this.auth.me();
    this.tenantId.set(user?.tenantId || '');
    if (!this.tenantId()) return;

    this.business.getBranches().subscribe({
      next: (res) => {
        const list = res || [];
        this.branches.set(list);
        if (list.length === 0) {
          this.error.set('No hay sucursales disponibles para el dashboard.');
          return;
        }

        const currentBranch = this.branchSelection.selectedBranchId();
        if (!currentBranch) {
          this.branchSelection.setSelectedBranchId(list[0].id);
        }

        this.loadSummary();
        this.setupAutoRefresh();
      },
      error: (err) => {
        console.error('Dashboard: error loading branches', err);
        this.error.set('No se pudieron cargar las sucursales');
      },
    });
  }

  private setupAutoRefresh() {
    runInInjectionContext(this.injector, () => {
      effect(() => {
        if (!this.hasBranch()) return;
        const enabled = this.settings.autoRefreshEnabled();
        const interval = this.settings.refreshIntervalMs();
        if (!enabled) return;
        const handle = setTimeout(() => {
          this.refreshAll();
        }, Math.max(1000, interval));
        return () => clearTimeout(handle);
      });
    });
  }

  refreshAll() {
    if (!this.hasBranch()) return;
    this.loadSummary();
  }

  selectBranch(branchId: string) {
    this.branchSelection.setSelectedBranchId(branchId);
  }

  private loadSummary() {
    if (!this.hasBranch()) return;
    this.loadingMetrics.set(true);
    this.loadingRecent.set(true);
    this.loadingMonthly.set(true);
    this.loadingTables.set(true);
    this.error.set(null);

    const params = new HttpParams()
      .set('branchId', this.selectedBranchId())
      .set('date', this.formatLocalDate(new Date()))
      .set('offsetMinutes', String(new Date().getTimezoneOffset()));

    this.http
      .get<DashboardSummaryResponse>(`${this.base}/dashboard/summary`, { params })
      .subscribe({
        next: (summary) => {
          this.metrics.set({
            ordersToday: summary.metrics.ordersToday,
            salesToday: summary.metrics.salesToday,
            ordersPrevDay: summary.metrics.ordersPrevDay,
            salesPrevDay: summary.metrics.salesPrevDay,
            growthOrdersPct: summary.metrics.growthOrdersPct,
            growthSalesPct: summary.metrics.growthSalesPct,
          });
          this.averageTicketToday.set(summary.metrics.averageTicketToday || 0);
          this.totalTables.set(summary.tables.total || 0);
          this.activeTablesCount.set(summary.tables.active || 0);
          this.activeTablesPct.set(Math.round(summary.tables.occupancyPct || 0));
          this.hourlySalesToday.set(summary.hourlySalesToday || new Array(24).fill(0));
          this.topProductsToday.set(summary.topProductsToday || []);
          this.recentOrders.set(
            (summary.recentOrders || []).map((order) => ({
              id: order.id,
              code: order.code,
              branchId: this.selectedBranchId(),
              tableId: order.tableId,
              tableName: order.tableName || undefined,
              status: order.status as any,
              items: [],
              subtotal: order.total,
              total: order.total,
              createdAt: order.createdAt,
              source: order.source || undefined,
              customer: order.customerName || order.customerPhone
                ? {
                    name: order.customerName || '',
                    phone: order.customerPhone || '',
                  }
                : undefined,
            })) as Order[],
          );
          this.monthToDateSales.set(summary.monthly?.monthToDateSales || 0);
          this.prevMonthSales.set(summary.monthly?.prevMonthSales || 0);
          const configuredTarget = this.settings.getSettings().monthlyTargetCOP;
          const target = configuredTarget > 0
            ? configuredTarget
            : (summary.monthly?.prevMonthSales || 0) * 1.1;
          this.monthTarget.set(target);
          this.monthProgressPct.set(
            target > 0
              ? ((summary.monthly?.monthToDateSales || 0) / target) * 100
              : 0,
          );
          this.loadingMetrics.set(false);
          this.loadingRecent.set(false);
          this.loadingMonthly.set(false);
          this.loadingTables.set(false);
        },
        error: (err) => {
          console.error('Dashboard summary error', err);
          this.error.set('No se pudo cargar el resumen del dashboard.');
          this.loadingMetrics.set(false);
          this.loadingRecent.set(false);
          this.loadingMonthly.set(false);
          this.loadingTables.set(false);
        },
      });
  }

  private formatLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  reloadMetrics() {
    this.loadSummary();
  }
  reloadRecent() {
    this.loadSummary();
  }
  reloadMonthly() {
    this.loadSummary();
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
