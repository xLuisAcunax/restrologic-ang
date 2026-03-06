import {
  Injectable,
  inject,
  signal,
  runInInjectionContext,
  Injector,
  effect,
} from '@angular/core';
import { BranchSelectionService } from '../../core/services/branch-selection.service';
import { AuthService } from '../../core/services/auth.service';
import { OrdersLiveStore } from '../../core/services/orders-live-store.service';
import { DeliveryOrderToast, Order } from '../../core/models/order.model';

@Injectable({ providedIn: 'root' })
export class OrderNotificationService {
  private branchSelectionService = inject(BranchSelectionService);
  private authService = inject(AuthService);
  private ordersStore = inject(OrdersLiveStore);

  // Toast list (reactive)
  toasts = signal<DeliveryOrderToast[]>([]);

  // Sound control
  private readonly soundKey = 'rl_notif_sound_enabled';
  soundEnabled = signal<boolean>(this.loadSoundSetting());
  private baseAudio: HTMLAudioElement | null = null;

  private initialized = false;
  private lastSeenOrderIds = new Set<string>();
  private lastBranchId: string | null = null;
  private baselineStartTime: number | null = null;

  constructor(private injector: Injector) {}

  /** Initialize only once for internal users */
  initialize() {
    if (this.initialized) return;
    const me = this.authService.me();
    if (!me) return;
    const roles = this.authService.getRole() || [];
    const internal = roles.some((r) =>
      ['Super', 'Admin', 'CASHIER', 'KITCHEN'].includes(r.toUpperCase()),
    );
    if (!internal) return;
    this.initialized = true;

    // SSE desactivado: OrdersLiveStore gestiona polling sin start explícito

    // Create effects inside injection context to avoid NG0203
    runInInjectionContext(this.injector, () => {
      effect(() => {
        const ready = this.ordersStore.ready();
        if (ready) {
          this.lastSeenOrderIds.clear();
          this.baselineStartTime = Date.now();
          this.lastBranchId = this.branchSelectionService.selectedBranchId();
        }
      });
      effect(() => {
        const orders = this.ordersStore.ordersList();
        const baseline = this.baselineStartTime ?? Date.now();
        for (const o of orders) {
          if (!this.isDeliveryOrder(o)) continue;
          if (this.lastSeenOrderIds.has(o.id)) continue;
          const createdAtMs = o.createdAt
            ? Date.parse(o.createdAt)
            : Date.now();
          if (createdAtMs >= baseline) {
            this.handleNewDeliveryOrder(o);
            this.lastSeenOrderIds.add(o.id);
          }
        }
      });
    });
  }

  // No polling: todo se maneja con el store + SSE
  stop() {
    /* noop */
  }

  private isDeliveryOrder(order: Order): boolean {
    // Delivery (domicilio) definition: public-menu source & has address (not takeaway)
    return (
      order.source === 'public-menu' &&
      !!order.customer?.address &&
      order.isTakeaway === false
    );
  }

  private handleNewDeliveryOrder(order: Order) {
    this.lastSeenOrderIds.add(order.id);
    const toast: DeliveryOrderToast = {
      id: order.id,
      code: order.code,
      branchId: order.branchId,
      createdAt: order.createdAt,
      customerName: order.customer?.name,
      address: order.customer?.address,
      message: this.buildMessage(order),
    };
    this.pushToast(toast);
    this.playSound();
  }

  private buildMessage(order: Order): string {
    const num = order.code ? `#${order.code}` : '';
    const customer = order.customer?.name
      ? ` para ${order.customer?.name}`
      : '';
    return `Nueva orden domicilio ${num}${customer}`.trim();
  }

  private pushToast(toast: DeliveryOrderToast) {
    const current = this.toasts();
    this.toasts.set([...current, toast]);
    // Auto remove after 8s
    setTimeout(() => this.removeToast(toast.id), 8000);
  }

  removeToast(id: string) {
    this.toasts.set(this.toasts().filter((t) => t.id !== id));
  }

  // === Sound helpers ===
  enableSound() {
    try {
      if (!this.baseAudio) {
        this.baseAudio = new Audio('/audio/notification.mp3');
        this.baseAudio.preload = 'auto';
        this.baseAudio.volume = 0.0; // play silently to unlock
      }
      // This must be called from a user gesture (e.g., button click)
      this.baseAudio.currentTime = 0;
      this.baseAudio
        .play()
        .then(() => {
          this.baseAudio?.pause();
          if (this.baseAudio) this.baseAudio.volume = 0.6; // set default volume after unlock
          this.soundEnabled.set(true);
          localStorage.setItem(this.soundKey, '1');
        })
        .catch(() => {
          // keep disabled if cannot unlock
          this.soundEnabled.set(false);
          localStorage.setItem(this.soundKey, '0');
        });
    } catch {
      this.soundEnabled.set(false);
      localStorage.setItem(this.soundKey, '0');
    }
  }

  disableSound() {
    this.soundEnabled.set(false);
    localStorage.setItem(this.soundKey, '0');
    try {
      this.baseAudio?.pause();
    } catch {}
  }

  private loadSoundSetting(): boolean {
    const v = localStorage.getItem(this.soundKey);
    return v === '1';
  }

  private playSound() {
    if (!this.soundEnabled()) return;
    try {
      // Use a cloned node so quick successive plays don't cut off
      const src = '/audio/notification.mp3';
      const audio = this.baseAudio
        ? (this.baseAudio.cloneNode(true) as HTMLAudioElement)
        : new Audio(src);
      audio.volume = 0.6;
      audio.play().catch(() => {
        // If playback fails (policy), disable to avoid repeated attempts
        this.soundEnabled.set(false);
        localStorage.setItem(this.soundKey, '0');
      });
    } catch {
      // Ignore playback errors (e.g., autoplay policy)
    }
  }
}
