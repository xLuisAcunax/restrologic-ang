import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  DestroyRef,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { CircuitBreakerService } from '../../../core/services/circuit-breaker.service';
import { ErrorHandlerService } from '../../../core/services/error-handler.service';
import { RequestThrottleService } from '../../../core/services/request-throttle.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  BusinessService,
  BranchSummary,
} from '../../../core/services/business.service';
import {
  CashDrawerDto,
  CashDrawerService,
  CashMovementDto,
  CashDrawerStatus,
  CashDrawerResponse,
  CashDrawerListResponse,
} from '../../../core/services/cash-drawer.service';
import { OrderService } from '../../../core/services/order.service';
import { OrdersLiveStore } from '../../../core/services/orders-live-store.service';
import { LocalDateTimePipe } from '../../../shared/pipes/local-datetime.pipe';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { Subscription } from 'rxjs';

type CashActionState = 'idle' | 'working' | 'success' | 'error';

@Component({
  selector: 'app-user-cash',
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './cash.component.html',
})
export class UserCashComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private businessService = inject(BusinessService);
  private cashDrawerService = inject(CashDrawerService);
  private ordersStore = inject(OrdersLiveStore);
  private fb = inject(FormBuilder);
  private branchSelection = inject(BranchSelectionService);

  // Servicios de Resiliencia
  private circuitBreaker = inject(CircuitBreakerService);
  private errorHandler = inject(ErrorHandlerService);
  private throttle = inject(RequestThrottleService);

  private autoRefreshInterval?: ReturnType<typeof setInterval>;
  private previousBranchId: string | null = null;
  private refreshScheduled = false;

  readonly tenantId = signal<string>('');
  readonly branches = signal<BranchSummary[]>([]);
  readonly userRoles = signal<string[]>([]);
  readonly isAdmin = signal<boolean>(false);

  readonly loadingBranches = signal(false);
  readonly loadingDrawer = signal(false);
  readonly loadingHistory = signal(false);

  readonly currentDrawer = signal<CashDrawerDto | null>(null);
  readonly drawerHistory = signal<CashDrawerDto[]>([]);
  readonly drawerError = signal<string | null>(null);
  private lastNullDrawerCheck = 0; // timestamp of last successful null response

  readonly openDrawerState = signal<CashActionState>('idle');
  readonly openDrawerError = signal<string | null>(null);

  readonly movementState = signal<CashActionState>('idle');
  readonly movementError = signal<string | null>(null);

  readonly closingState = signal<CashActionState>('idle');
  readonly closingError = signal<string | null>(null);

  readonly statusFilter = signal<CashDrawerStatus | 'all'>('all');

  readonly openDrawerForm = this.fb.nonNullable.group({
    openingFloat: this.fb.nonNullable.control<number>(0, {
      validators: [Validators.required, Validators.min(0)],
    }),
    notes: this.fb.control<string>(''),
  });

  readonly movementForm = this.fb.nonNullable.group({
    type: this.fb.nonNullable.control<'income' | 'outcome'>('income', {
      validators: [Validators.required],
    }),
    reason: this.fb.nonNullable.control<string>('', {
      validators: [Validators.required, Validators.minLength(3)],
    }),
    amount: this.fb.nonNullable.control<number>(0, {
      validators: [Validators.required, Validators.min(0.01)],
    }),
    reference: this.fb.control<string>(''),
  });

  readonly closingForm = this.fb.nonNullable.group({
    closingFloat: this.fb.nonNullable.control<number>(0, {
      validators: [Validators.required, Validators.min(0)],
    }),
    closingNotes: this.fb.control<string>(''),
  });

  readonly showOpenForm = signal(false);
  readonly showMovementForm = signal(false);
  readonly showClosingForm = signal(false);

  readonly hasOpenDrawer = computed(() => !!this.currentDrawer());

  readonly runningBalance = computed(() => {
    const drawer = this.currentDrawer();
    if (!drawer) {
      return 0;
    }
    return drawer.openingFloat + drawer.totalIncome - drawer.totalOutcome;
  });

  // Categorized movements
  readonly paymentMovements = computed(() => {
    const movements = this.currentDrawer()?.movements ?? [];
    return movements.filter((m) => m.reason?.startsWith('Payment:'));
  });

  // Cash payments only (physical cash in drawer) - case insensitive
  readonly cashPayments = computed(() => {
    return this.paymentMovements().filter(
      (m) => m.reason?.toLowerCase() === 'payment:cash',
    );
  });

  // Other payment methods (Card, Nequi, Transfer, Daviplata, etc.)
  readonly otherPayments = computed(() => {
    return this.paymentMovements().filter(
      (m) => m.reason?.toLowerCase() !== 'payment:cash',
    );
  });

  readonly changeMovements = computed(() => {
    const movements = this.currentDrawer()?.movements ?? [];
    return movements.filter((m) => m.reason === 'Change');
  });

  readonly manualMovements = computed(() => {
    const movements = this.currentDrawer()?.movements ?? [];
    return movements.filter(
      (m) =>
        !m.reason?.startsWith('Payment:') &&
        m.reason !== 'Change' &&
        m.reason !== 'Opening',
    );
  });

  readonly totalPayments = computed(() => {
    return this.paymentMovements().reduce((sum, m) => sum + m.amount, 0);
  });

  readonly totalCashPayments = computed(() => {
    return this.cashPayments().reduce((sum, m) => sum + m.amount, 0);
  });

  readonly totalOtherPayments = computed(() => {
    return this.otherPayments().reduce((sum, m) => sum + m.amount, 0);
  });

  readonly totalChange = computed(() => {
    return this.changeMovements().reduce((sum, m) => sum + m.amount, 0);
  });

  readonly totalManualIncome = computed(() => {
    return this.manualMovements()
      .filter((m) => m.type === 'Income' || m.type === 'income')
      .reduce((sum, m) => sum + m.amount, 0);
  });

  readonly totalManualOutcome = computed(() => {
    return this.manualMovements()
      .filter((m) => m.type === 'Outcome' || m.type === 'outcome')
      .reduce((sum, m) => sum + m.amount, 0);
  });

  // Cash balance = opening + cash payments + manual income - change - manual outcome
  readonly cashBalance = computed(() => {
    const drawer = this.currentDrawer();
    if (!drawer) return 0;
    return (
      drawer.openingFloat +
      this.totalCashPayments() +
      this.totalManualIncome() -
      this.totalChange() -
      this.totalManualOutcome()
    );
  });

  readonly statusOptions: Array<{
    value: CashDrawerStatus | 'all';
    label: string;
  }> = [
      { value: 'all', label: 'Todos' },
      { value: 'open', label: 'Abiertas' },
      { value: 'closed', label: 'Cerradas' },
    ];

  ngOnInit(): void {
    const user = this.auth.me();
    this.tenantId.set(user?.tenantId || '');
    this.userRoles.set(this.auth.getRole() || []);
    const hasAdminRole =
      this.userRoles().includes('Admin') || this.userRoles().includes('Super');
    this.isAdmin.set(hasAdminRole);

    if (this.tenantId()) {
      this.initializeBranchContext(this.tenantId());
    }

    // Watch for branch changes using subscription instead of effect
    this.previousBranchId = this.branchSelection.selectedBranchId();

    // Auto-refresh every 30 seconds to check for new movements/orders
    this.startAutoRefresh();

    // SSE removed: rely on polling updates via OrdersLiveStore and manual actions

    // Also refresh on branch changes (check every second)
    this.startBranchWatcher();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    this.stopBranchWatcher();
    // No SSE subscriptions to clean up
  }

  private startAutoRefresh(): void {
    // Auto refresh deshabilitado: la vista reaccionará solo a:
    // - Eventos SSE (orderEvents)
    // - Cambios manuales (abrir/cerrar, movimientos)
    // - Cambio de sucursal
    // Para reactivar en el futuro, restaurar el setInterval aquí.
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = undefined;
    }
    // No forzar refresh adicional aquí; los eventos SSE y acciones del usuario disparan las cargas.
  }

  private branchWatcherInterval?: ReturnType<typeof setInterval>;

  private startBranchWatcher(): void {
    // Check for branch changes every 500ms
    this.branchWatcherInterval = setInterval(() => {
      const currentBranchId = this.branchSelection.selectedBranchId();
      if (currentBranchId && currentBranchId !== this.previousBranchId) {
        console.log(
          '[Cash] Branch changed from',
          this.previousBranchId,
          'to',
          currentBranchId,
        );
        this.previousBranchId = currentBranchId;
        this.refreshDrawer();
        this.loadDrawerHistory();
      }
    }, 500);
  }

  private stopBranchWatcher(): void {
    if (this.branchWatcherInterval) {
      clearInterval(this.branchWatcherInterval);
      this.branchWatcherInterval = undefined;
    }
  }

  // Throttled refresh used when receiving SSE events
  private scheduleRefreshSoon() {
    if (this.refreshScheduled) return;
    this.refreshScheduled = true;
    setTimeout(() => {
      this.refreshScheduled = false;
      // Solo refrescar estado de la caja abierta; el historial se refresca con acciones explícitas
      this.refreshDrawer();
    }, 1200);
  }

  private initializeBranchContext(tenantId: string) {
    this.loadingBranches.set(true);
    const user = this.auth.me();

    // Regular users: fix branch to assigned one and keep a local label for display
    if (!this.isAdmin() && user?.branchId) {
      this.businessService.getBranch(user.branchId).subscribe({
        next: (res) => {
          this.branches.set([res]);
          // Persist into global service so other views share it
          this.branchSelection.setSelectedBranchId(user.branchId!);
          this.loadingBranches.set(false);
          this.refreshDrawer();
          this.loadDrawerHistory();
        },
        error: (err) => {
          console.error('Error loading branch for cashier view:', err);
          this.loadingBranches.set(false);
        },
      });
      return;
    }

    // Admin: branches are handled by header; ensure we have some selection to work with
    const current = this.branchSelection.selectedBranchId();
    if (current) {
      this.refreshDrawer();
      this.loadDrawerHistory();
    }
    this.loadingBranches.set(false);
  }

  refreshDrawer() {
    const branchId = this.branchSelection.selectedBranchId();
    if (!this.tenantId() || !branchId) {
      return;
    }
    // Throttle repeated null checks (no open drawer) to avoid spam
    if (
      !this.currentDrawer() &&
      Date.now() - this.lastNullDrawerCheck < 10000
    ) {
      return;
    }

    this.loadingDrawer.set(true);
    this.drawerError.set(null);

    this.cashDrawerService
      .getCurrentDrawerNullable(this.tenantId(), branchId)
      .subscribe({
        next: (drawer: CashDrawerDto | null) => {
          this.currentDrawer.set(drawer);
          this.loadingDrawer.set(false);
          const hasDrawer = !!drawer;
          this.showOpenForm.set(!hasDrawer);
          this.showClosingForm.set(false);
          if (drawer) {
            this.patchClosingDefaults(drawer);
            this.warmOrdersForMovements(drawer.movements || []);
          } else {
            this.lastNullDrawerCheck = Date.now();
          }
        },
        error: (err: HttpErrorResponse) => {
          console.error('Error fetching open cash drawer:', err);
          const message =
            err?.error?.error ||
            err?.error?.message ||
            'No se pudo obtener la caja abierta.';
          this.drawerError.set(message);
          this.loadingDrawer.set(false);
        },
      });
  }

  loadDrawerHistory() {
    const branchId = this.branchSelection.selectedBranchId();
    if (!this.tenantId() || !branchId) {
      return;
    }

    this.loadingHistory.set(true);
    const status = this.statusFilter();

    this.cashDrawerService
      .listDrawerHistory(this.tenantId(), branchId, {
        status: status === 'all' ? undefined : status,
      })
      .subscribe({
        next: (res: CashDrawerListResponse) => {
          const data = res.data || [];
          this.drawerHistory.set(data.slice(0, 10));
          this.loadingHistory.set(false);
        },
        error: (err: HttpErrorResponse) => {
          console.error('Error listing cash drawers:', err);
          this.loadingHistory.set(false);
        },
      });
  }

  submitOpenDrawer() {
    const branchId = this.branchSelection.selectedBranchId();
    if (!this.tenantId() || !branchId) {
      return;
    }

    if (this.openDrawerForm.invalid) {
      this.openDrawerForm.markAllAsTouched();
      return;
    }

    this.openDrawerState.set('working');
    this.openDrawerError.set(null);

    const { openingFloat, notes } = this.openDrawerForm.getRawValue();

    this.cashDrawerService
      .openDrawer(this.tenantId(), branchId, {
        openingFloat,
        notes: notes?.trim() || undefined,
      })
      .subscribe({
        next: (res: CashDrawerResponse) => {
          this.openDrawerState.set('success');
          this.currentDrawer.set(res.data);
          this.openDrawerForm.reset({ openingFloat: 0, notes: '' });
          this.showOpenForm.set(false);
          this.showMovementForm.set(true);
          this.patchClosingDefaults(res.data);
          this.loadDrawerHistory();
        },
        error: (err: HttpErrorResponse) => {
          console.error('Error opening cash drawer:', err);
          const message =
            err?.error?.error ||
            err?.error?.message ||
            'No se pudo abrir la caja. Intenta nuevamente.';
          this.openDrawerError.set(message);
          this.openDrawerState.set('error');
        },
      });
  }

  async submitMovement() {
    const branchId = this.branchSelection.selectedBranchId();
    if (!this.tenantId() || !branchId || !this.currentDrawer()) {
      return;
    }

    if (this.movementForm.invalid) {
      this.movementForm.markAllAsTouched();
      return;
    }

    this.movementState.set('working');
    this.movementError.set(null);

    try {
      const { type, reason, amount, reference } =
        this.movementForm.getRawValue();

      // Usar circuit breaker para operaciones de pago
      const circuitKey = `payment-${this.tenantId()}-${branchId}`;

      // Verificar estado del circuit breaker
      if (!this.circuitBreaker.canExecute(circuitKey)) {
        throw new Error(
          'Servicio de pagos no disponible en este momento. Intenta más tarde.',
        );
      }

      const res = await this.cashDrawerService
        .appendMovement(this.tenantId(), branchId, this.currentDrawer()!.id, {
          type,
          concept: reason.trim(),
          source: 'other',
          amount,
          orderId: reference?.trim() || undefined,
          notes: undefined,
        })
        .toPromise();

      if (!res) throw new Error('No se recibió respuesta del servidor');

      // Registrar éxito en circuit breaker
      this.circuitBreaker.recordSuccess(circuitKey);

      this.movementState.set('success');
      this.currentDrawer.set(res.data);
      this.movementForm.reset({
        type: 'income',
        reason: '',
        amount: 0,
        reference: '',
      });
      this.patchClosingDefaults(res.data);
      this.loadDrawerHistory();

      // Reset success state después de 3 segundos
      setTimeout(() => this.movementState.set('idle'), 3000);
    } catch (error: any) {
      console.error('Error adding cash movement:', error);

      // Registrar fallo en circuit breaker
      const circuitKey = `payment-${this.tenantId()}-${branchId}`;
      this.circuitBreaker.recordFailure(circuitKey);

      // Manejar error con contexto
      const handled = this.errorHandler.handleError(error, {
        operation: 'registrar movimiento de caja',
        serviceName: 'CashDrawerService',
        tenantId: this.tenantId(),
        branchId,
      });

      this.movementError.set(handled.userMessage);
      this.movementState.set('error');
    }
  }

  toggleMovementForm() {
    this.showMovementForm.update((value) => !value);
  }

  toggleCloseForm() {
    const next = !this.showClosingForm();
    this.showClosingForm.set(next);
    if (next && this.currentDrawer()) {
      this.patchClosingDefaults(this.currentDrawer()!);
    }
  }

  private patchClosingDefaults(_drawer: CashDrawerDto) {
    // Use cashBalance (only physical cash) for closing
    const expected = this.cashBalance();
    this.closingForm.patchValue({
      closingFloat: Math.round((expected + Number.EPSILON) * 100) / 100,
      closingNotes: '',
    });
  }

  getClosingVariancePreview(): number {
    const closingValue = this.closingForm.controls.closingFloat.value ?? 0;
    return closingValue - this.cashBalance();
  }

  submitClosing() {
    const branchId = this.branchSelection.selectedBranchId();
    if (!this.tenantId() || !branchId || !this.currentDrawer()) {
      return;
    }

    if (this.closingForm.invalid) {
      this.closingForm.markAllAsTouched();
      return;
    }

    const drawer = this.currentDrawer();
    if (!drawer) {
      return;
    }

    // Use cashBalance (only physical cash) for closing variance calculation
    const expected = this.cashBalance();
    const { closingFloat, closingNotes } = this.closingForm.getRawValue();
    const variance = Math.round(((closingFloat ?? 0) - expected) * 100) / 100;

    if (Math.abs(variance) >= 0.01) {
      const notes = (closingNotes || '').trim();
      if (notes.length < 3) {
        this.closingForm.controls.closingNotes.setErrors({ required: true });
        this.closingForm.controls.closingNotes.markAsTouched();
        this.closingError.set(
          'Ingresa una explicación para la diferencia detectada en el cierre.',
        );
        return;
      }
    }

    this.closingState.set('working');
    this.closingError.set(null);

    this.cashDrawerService
      .closeDrawer(this.tenantId(), branchId, drawer.id, {
        closingFloat,
        expectedClosing: expected,
        variance,
        closingNotes: closingNotes?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.closingState.set('success');
          this.currentDrawer.set(null);
          this.showClosingForm.set(false);
          this.showMovementForm.set(false);
          this.showOpenForm.set(true);
          this.closingForm.reset({ closingFloat: 0, closingNotes: '' });
          this.loadDrawerHistory();
          this.refreshDrawer();
        },
        error: (err: HttpErrorResponse) => {
          console.error('Error closing cash drawer:', err);
          const message =
            err?.error?.error ||
            err?.error?.message ||
            'No se pudo cerrar la caja. Intenta nuevamente.';
          this.closingError.set(message);
          this.closingState.set('error');
        },
      });
  }

  formatCurrency(value: number | null | undefined): string {
    const amount = Number(value ?? 0);
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `COP ${amount.toFixed(2)}`;
    }
  }

  formatMovementReason(reason: string | undefined): string {
    if (!reason) return '-';
    if (reason === 'Opening') return 'Apertura';
    if (reason === 'Change') return 'Cambio/Vuelto';
    if (reason.startsWith('Payment:')) {
      const method = reason.replace('Payment:', '');
      const methodNames: Record<string, string> = {
        Cash: 'Pago efectivo',
        Card: 'Pago tarjeta',
        Nequi: 'Pago Nequi',
        Transfer: 'Pago transferencia',
        Daviplata: 'Pago Daviplata',
      };
      return methodNames[method] || `Pago ${method}`;
    }
    return reason;
  }

  getMovementBadgeClass(movement: CashMovementDto): string {
    if (movement.reason?.startsWith('Payment:')) return 'badge-info';
    if (movement.reason === 'Change') return 'badge-warning';
    if (movement.reason === 'Opening') return 'badge-neutral';
    return movement.type === 'Income' || movement.type === 'income'
      ? 'badge-success'
      : 'badge-error';
  }

  getMovementTypeLabel(movement: CashMovementDto): string {
    if (movement.reason?.startsWith('Payment:')) return 'Pago';
    if (movement.reason === 'Change') return 'Cambio';
    if (movement.reason === 'Opening') return 'Apertura';
    return movement.type === 'Income' || movement.type === 'income'
      ? 'Ingreso'
      : 'Egreso';
  }

  trackMovement(index: number, movement: CashMovementDto) {
    return movement.id || index;
  }

  trackDrawer(index: number, drawer: CashDrawerDto) {
    return drawer.id || index;
  }

  onStatusFilterChange(value: CashDrawerStatus | 'all') {
    this.statusFilter.set(value);
    this.loadDrawerHistory();
  }

  private warmOrdersForMovements(movements: CashMovementDto[]) {
    const orderIds = movements
      .map((m) => m.orderId)
      .filter((id): id is string => !!id && id.length > 0);

    if (orderIds.length === 0) {
      return;
    }

    const uniqueIds = Array.from(new Set(orderIds));
    // SSE desactivado: polling ya gestionado por OrdersLiveStore; no repetir start
    uniqueIds.forEach((id) => (this as any).ordersStore['enqueue']?.(id));
  }

  orderNumberDisplay(orderId: string | null | undefined): string {
    if (!orderId) {
      return '-';
    }
    const order = this.ordersStore['ordersList']
      ? this.ordersStore.ordersList().find((o) => o.id === orderId)
      : undefined;
    const num = order?.code;
    if (typeof num === 'number') {
      return `#${num}`;
    }
    // Fallback: últimos 6 caracteres del ID
    return orderId.length > 6 ? `...${orderId.slice(-6)}` : orderId;
  }

  // 1. Calcular SOLO el dinero físico (Efectivo)
  // Fórmula: Base Inicial + Pagos en Efectivo + Ingresos Manuales - Egresos Manuales - Vueltos
  cashInDrawer = computed(() => {
    const drawer = this.currentDrawer();
    if (!drawer) return 0;

    let total = drawer.openingFloat;

    for (const m of drawer.movements) {
      const reason = m.reason?.toLowerCase() ?? '';
      const type = m.type?.toLowerCase() ?? '';

      // Pagos en efectivo
      if (reason === 'payment:cash') {
        total += m.amount;
        continue;
      }

      // Vueltos/cambio (restan efectivo)
      if (reason === 'change') {
        total -= m.amount;
        continue;
      }

      // Ignorar apertura y otros pagos digitales
      if (reason === 'opening' || reason.startsWith('payment:')) {
        continue;
      }

      // Ingresos/Egresos manuales (se asumen en efectivo)
      if (type === 'income') {
        total += m.amount;
      } else if (type === 'outcome') {
        total -= m.amount;
      }
    }

    return total;
  });

  // 2. Calcular dinero Digital / Bancos
  // Fórmula: Suma de todos los pagos donde el método NO sea efectivo (tarjeta, nequi, transfer, etc.)
  digitalAmount = computed(() => {
    const drawer = this.currentDrawer();
    if (!drawer) return 0;

    return drawer.movements.reduce((acc, m) => {
      const reason = m.reason?.toLowerCase() ?? '';
      // Sumar solo pagos que NO sean efectivo
      if (reason.startsWith('payment:') && reason !== 'payment:cash') {
        return acc + m.amount;
      }
      return acc;
    }, 0);
  });
}
