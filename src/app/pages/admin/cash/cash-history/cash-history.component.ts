import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { BranchSelectionService } from '../../../../core/services/branch-selection.service';
import {
  BusinessService,
  BranchSummary,
} from '../../../../core/services/business.service';
import {
  CashDrawerDto,
  CashDrawerService,
} from '../../../../core/services/cash-drawer.service';
import { UserService } from '../../../../core/services/user.service';
import { LocalDateTimePipe } from '../../../../shared/pipes/local-datetime.pipe';
import {
  todayAsInputLocalDate,
  createDayRangeIso,
} from '../../../../shared/utils/date-range.utils';

@Component({
  selector: 'app-cash-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-history.component.html',
})
export class CashHistoryComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly branchSelection = inject(BranchSelectionService);
  private readonly businessService = inject(BusinessService);
  private readonly cashDrawerService = inject(CashDrawerService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  // Filters
  readonly maxDate = todayAsInputLocalDate();
  startDate = signal<string>(this.maxDate);
  endDate = signal<string>(this.maxDate);

  // Context
  tenantId = computed(() => this.auth.me()?.tenantId || '');
  branches = signal<BranchSummary[]>([]);
  usersById = signal<Map<string, string>>(new Map());

  // Data
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  drawers = signal<CashDrawerDto[]>([]);

  // Pagination
  page = signal<number>(1);
  pageSize = signal<number>(10);
  total = computed(() => this.drawers().length);
  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );
  paged = computed(() => {
    const p = Math.max(1, Math.min(this.page(), this.totalPages()));
    const start = (p - 1) * this.pageSize();
    return this.drawers().slice(start, start + this.pageSize());
  });

  ngOnInit(): void {
    this.loadBranches();
    const branchId = this.branchSelection.getEffectiveBranchId();
    if (branchId) {
      this.loadUsers(branchId);
    }

    this.search();
  }

  private loadBranches() {
    this.businessService.getBranches().subscribe((res) => {
      this.branches.set(res || []);
    });
  }

  private loadUsers(branchId: string) {
    this.userService.getBranchUsers(branchId).subscribe({
      next: (res) => {
        const entries = (res || []).map((user: any) => {
          const id = String(
            user?.id ?? user?._id ?? user?.userId ?? user?.uid ?? '',
          );
          const display = (
            user?.fullName ||
            user?.name ||
            user?.email ||
            id
          ).trim();
          return [id, display] as [string, string];
        });
        this.usersById.set(new Map(entries));
      },
      error: () => this.usersById.set(new Map()),
    });
  }

  onDateChange(which: 'start' | 'end', value: string) {
    if (which === 'start') this.startDate.set(value);
    else this.endDate.set(value);
  }

  search() {
    const tenantId = this.tenantId();
    const branchId = this.branchSelection.getEffectiveBranchId();
    if (!tenantId || !branchId) return;

    this.loading.set(true);
    this.error.set(null);

    // Mismo formato que order-history: convertir día local a rango ISO
    const rangeStart = createDayRangeIso(this.startDate());
    const rangeEnd = createDayRangeIso(this.endDate());

    this.cashDrawerService
      .listDrawerHistory(tenantId, branchId, {
        status: 'closed',
        start: rangeStart?.start,
        end: rangeEnd?.end,
      })
      .subscribe({
        next: (res) => {
          const list = (res.data || []).sort((a, b) => {
            const aDate = a.closedAt || a.openedAt || a.createdAt;
            const bDate = b.closedAt || b.openedAt || b.createdAt;
            return aDate < bDate ? 1 : -1; // desc
          });
          this.drawers.set(list);
          this.page.set(1);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            err?.error?.message || 'No se pudo cargar el historial de caja.',
          );
        },
      });
  }

  goToDetail(drawer: CashDrawerDto) {
    this.router.navigate(['/admin/cash-history', drawer.id]);
  }

  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 2,
    }).format(value ?? 0);
  }

  userName(id: string | null | undefined): string {
    if (!id) return '—';
    const map = this.usersById();
    return map.get(String(id)) || String(id);
  }
}
