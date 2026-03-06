import { Component, inject, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicContextService } from '../../../shared/services/public-context.service';
import { OrderService } from '../../../core/services/order.service';
import { PublicTrackingService } from '../../../shared/services/public-tracking.service';
import { interval, Subscription, switchMap, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RealtimeService } from '../../../core/services/realtime.service';
import {
  OrderStatusHistoryDto,
  PublicOrderTracking,
} from '../../../core/models/order.model';

@Component({
  selector: 'app-order-success',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-success.component.html',
  styleUrls: ['./order-success.component.css'],
})
export class OrderSuccessComponent implements OnDestroy {
  orderId = '';
  displayCode = '';
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  ctx = inject(PublicContextService);
  private orderSvc = inject(OrderService);
  private trackingStore = inject(PublicTrackingService);
  private rt = inject(RealtimeService);

  tracking: PublicOrderTracking | null = null;
  history: OrderStatusHistoryDto[] = [];
  loading = true;
  error: string | null = null;
  private pollSub?: Subscription;
  private readonly POLL_INTERVAL_MS = 3000; // 3s (<= 20 req/min)
  private attempts = 0;
  private readonly MAX_ATTEMPTS = 10; // ~30s -> ~30s (more tolerant)
  lastUpdatedAt: string | null = null;
  private realtimeSubs: Subscription[] = [];
  liveConnected = false;
  lastRtError: string | null = null;
  private tenantId: string | null = null;
  private branchId: string | null = null;

  constructor() {
    // Read orderId from query params or fallback to stored tracking ID
    this.orderId =
      this.route.snapshot.queryParamMap.get('orderId') ??
      this.route.snapshot.paramMap.get('orderId') ??
      this.trackingStore.read();
    this.displayCode = this.orderId;
    // Read tenant/branch from query params to join the namespace
    this.tenantId =
      this.route.snapshot.queryParamMap.get('tenantId') || this.ctx.tenantId();
    this.branchId =
      this.route.snapshot.queryParamMap.get('branchId') || this.ctx.branchId();
    if (this.tenantId && this.branchId) {
      // Keep context updated for navigation back
      this.ctx.setTenantBranch(this.tenantId, this.branchId);
    }
    this.startPolling();
  }

  manualRefresh() {
    if (!this.orderId) return;
    this.loading = true;
    this.orderSvc
      .getOrderTracking(this.orderId)
      .pipe(
        catchError((err) => {
          const status = (err && err.status) || 0;
          if (status === 404) {
            this.error =
              'Este pedido ya no está disponible (posiblemente completado o expirado).';
            this.trackingStore.clear();
            this.loading = false;
            return of({ ok: false, data: null });
          }
          console.error('Public tracking refresh failed', err);
          return of({ ok: false, data: null });
        }),
      )
      .subscribe((res: any) => {
        this.loading = false;
        if (res.ok && res.data) {
          this.setTracking(res.data as PublicOrderTracking);
        }
      });
  }

  goBackToMenu() {
    const tenantId =
      this.route.snapshot.queryParamMap.get('tenantId') || this.ctx.tenantId();
    const branchId =
      this.route.snapshot.queryParamMap.get('branchId') || this.ctx.branchId();

    // If we have the params, navigate with them; else fallback to plain /menu
    if (tenantId && branchId) {
      this.router.navigate(['/menu'], {
        queryParams: { tenantId, branchId },
      });
    } else {
      this.router.navigate(['/menu']);
    }
  }

  private startPolling() {
    if (!this.orderId) {
      this.loading = false;
      this.error = 'Falta el identificador del pedido.';
      console.error('[Tracking] No orderId provided');
      return;
    }

    console.log('[Tracking] Starting polling for order:', this.orderId);

    const fetchTracking$ = () =>
      this.orderSvc.getOrderTracking(this.orderId).pipe(
        catchError((err) => {
          // Attempt to detect 404 (Not Found) vs generic error
          const status = (err && err.status) || 0;
          console.error('[Tracking] Fetch error:', status, err);
          if (status === 404) {
            this.error =
              'Este pedido ya no está disponible (posiblemente completado o expirado).';
            this.trackingStore.clear();
            this.loading = false;
            this.pollSub?.unsubscribe();
            return of({ ok: false, data: null });
          }
          console.error('Public tracking fetch failed', err);
          return of({ ok: false, data: null });
        }),
      );

    // Immediate
    fetchTracking$().subscribe((res: any) => {
      console.log('[Tracking] Initial fetch result:', res);
      this.loading = false;
      if (res.ok && res.data) {
        this.setTracking(res.data as PublicOrderTracking);
      } else {
        this.error = this.error || 'No se pudo cargar el estado del pedido.';
      }
    });

    this.pollSub = interval(this.POLL_INTERVAL_MS)
      .pipe(switchMap(() => fetchTracking$()))
      .subscribe((res) => {
        this.loading = false; // ensure we never get stuck showing only the loader
        this.attempts++;
        if (res.ok && res.data) {
          this.setTracking(res.data as PublicOrderTracking);
          // Si está inactiva o estado terminal, detener polling
          if (
            !this.tracking?.isActive ||
            this.isTerminal(this.latestStatus())
          ) {
            this.pollSub?.unsubscribe();
          }
          return;
        }
        // Keep showing last known tracking if available; only error out if we never had data
        if (this.attempts >= this.MAX_ATTEMPTS && !this.tracking) {
          this.error =
            this.error ||
            'No se pudo obtener el estado del pedido (tiempo agotado).';
          this.pollSub?.unsubscribe();
        }
      });
  }

  private setTracking(trk: PublicOrderTracking) {
    console.log('[Tracking] setTracking called with:', trk);
    this.tracking = trk;
    this.lastUpdatedAt = new Date().toISOString();
    // Prefer human friendly code
    const code = (trk as any).orderNumber ?? this.orderId;
    if (code) this.displayCode = String(code);
    console.log(
      '[Tracking] Tracking state updated, triggering change detection',
    );
    this.cdr.detectChanges();

    // Filtrar solo cambios de estado de la ORDEN (no de items individuales)
    // El backend puede incluir cambios de items en statusHistory, pero para el cliente
    // solo importa ver el progreso de la orden completa (created → preparing → ready → served)
    const allHistory = (trk.statusHistory || []).slice();
    const orderLevelStatuses = [
      'created',
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'served',
      'paid',
      'closed',
      'cancelled',
    ];

    this.history = allHistory
      .filter((entry) => {
        const status =
          typeof entry.status === 'object' &&
            entry.status &&
            'type' in entry.status
            ? (entry.status as any).type
            : entry.status;
        const normalized = String(status || '').toLowerCase();
        // Solo mantener estados que son de orden completa (no de items individuales)
        return orderLevelStatuses.includes(normalized);
      })
      .sort((a, b) => {
        const at = new Date(a.changedAt || 0).getTime();
        const bt = new Date(b.changedAt || 0).getTime();
        return at - bt;
      })
      // Eliminar duplicados consecutivos del mismo estado
      .reduce((acc: OrderStatusHistoryDto[], curr) => {
        if (acc.length === 0) return [curr];
        const lastStatus =
          typeof acc[acc.length - 1].status === 'object'
            ? (acc[acc.length - 1].status as any).type
            : acc[acc.length - 1].status;
        const currStatus =
          typeof curr.status === 'object'
            ? (curr.status as any).type
            : curr.status;
        // Solo agregar si es diferente al último
        if (
          String(lastStatus).toLowerCase() !== String(currStatus).toLowerCase()
        ) {
          return [...acc, curr];
        }
        return acc;
      }, []);
  }

  latestStatus(): string {
    const st = this.tracking?.status as any;
    if (!st) return '';
    return typeof st === 'object' && 'type' in st
      ? String(st.type)
      : String(st);
  }

  // Friendly labels in Spanish for customer-facing UI
  private titleCase(input: string): string {
    if (!input) return '';
    return input
      .toLowerCase()
      .split(/[\s_-]+/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  private statusMap: Record<string, string> = {
    created: '📝 Pedido recibido',
    pending: '⏳ Pendiente',
    confirmed: '✅ Confirmado',
    preparing: '👩‍🍳 Preparando tu pedido',
    ready: '📦 Listo para entregar/retirar',
    // Clarificar que "served" en pedidos del menú público significa que ya se entregó al repartidor
    served: '🚚 Entregado al repartidor',
    paid: '💵 Pagado',
    closed: '🔒 Finalizado',
    cancelled: '❌ Cancelado',
  };

  displayLatestStatus(): string {
    const raw = this.latestStatus();
    return this.statusMap[raw.toLowerCase()] ?? this.titleCase(raw);
  }

  isServed(): boolean {
    return this.latestStatus().toLowerCase() === 'served';
  }

  public isTerminal(status: string): boolean {
    const s = status.toLowerCase();
    const terminal = s === 'served' || s === 'closed' || s === 'cancelled';
    if (terminal) this.trackingStore.clear();
    return terminal;
  }

  // Normalize delivery tracking to an array of events regardless of backend shape
  deliveryEvents(): { status: string; at?: string; by?: string }[] {
    const dt = this.tracking?.deliveryTracking as any;
    if (!dt) return [];
    if (Array.isArray(dt)) return dt as any[];
    if (dt && Array.isArray(dt.history)) return dt.history as any[];
    return [];
  }

  friendlyHistoryLabel(entry: OrderStatusHistoryDto): string {
    const status =
      typeof entry.status === 'object' && entry.status && 'type' in entry.status
        ? (entry.status as any).type
        : entry.status;
    const key = String(status).toLowerCase();
    return this.statusMap[key] ?? this.titleCase(String(status));
  }

  friendlyChangedBy(changedBy: any): string {
    if (!changedBy) return '—';
    if (typeof changedBy === 'string') {
      if (changedBy === 'public') return 'Tú';
      // Heuristic: if it looks like an id/hash, show a friendly fallback
      if (/^[a-f0-9]{24}$/i.test(changedBy) || changedBy.length > 12) {
        return 'Personal del restaurante';
      }
      return changedBy;
    }
    const candidate = [changedBy.fullName, changedBy.name]
      .filter((v) => typeof v === 'string' && v.trim().length > 0)
      .shift();
    return candidate || 'Personal del restaurante';
  }

  private deliveryMap: Record<string, string> = {
    pending: '⏳ Pendiente',
    assigned: '🧍‍♂️ Repartidor asignado',
    picked_up: '📦 Pedido recogido',
    in_transit: '🚚 En camino',
    delivered: '✅ Entregado',
    failed: '⚠️ Entrega fallida',
  };

  // Mensaje contextual cuando el pedido está listo o en tránsito (solo delivery)
  contextualMessage(): string | null {
    const status = this.latestStatus().toLowerCase();
    const deliveryStatus = (this.tracking?.deliveryStatus || '').toLowerCase();
    // Asumimos siempre delivery por ahora
    const requiresDelivery = true;

    if (status === 'ready' && deliveryStatus === 'pending') {
      return 'Tu pedido está listo y será asignado a un repartidor en breve.';
    }
    if (deliveryStatus === 'assigned') {
      return 'Un repartidor fue asignado y pronto recogerá tu pedido.';
    }
    if (deliveryStatus === 'picked_up' || deliveryStatus === 'in_transit') {
      return 'El repartidor ya tiene tu pedido y va en camino a tu domicilio.';
    }
    if (deliveryStatus === 'delivered') {
      return 'Tu pedido fue entregado. ¡Buen provecho!';
    }
    if (deliveryStatus === 'failed') {
      return 'Hubo un problema con la entrega. Contacta al restaurante.';
    }
    return null;
  }

  friendlyDeliveryStatus(status?: string | null): string {
    if (!status) return 'Pendiente';
    const key = status.toLowerCase();
    return this.deliveryMap[key] ?? this.titleCase(status);
  }

  badgeClass(status: string): string {
    switch (status.toUpperCase()) {
      case 'CREATED':
      case 'PENDING':
        return 'badge badge-neutral';
      case 'CONFIRMED':
      case 'PREPARING':
        return 'badge badge-warning';
      case 'READY':
        return 'badge badge-info';
      case 'SERVED':
        return 'badge badge-success';
      case 'PAID':
        return 'badge badge-primary';
      case 'CLOSED':
        return 'badge badge-accent';
      case 'CANCELLED':
        return 'badge badge-error';
      default:
        return 'badge';
    }
  }

  trackHistory = (_: number, entry: OrderStatusHistoryDto) => {
    return entry.changedAt || JSON.stringify(entry.status) || _;
  };

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.realtimeSubs.forEach((s) => s.unsubscribe());
    this.realtimeSubs = [];
  }
}
