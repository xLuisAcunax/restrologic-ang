import { Injectable, Injector, effect, inject } from '@angular/core';
import { OrdersLiveStore } from '../../core/services/orders-live-store.service';
import { AuthService } from '../../core/services/auth.service';
import { BranchSelectionService } from '../../core/services/branch-selection.service';

@Injectable({ providedIn: 'root' })
export class OrdersRealtimeBootstrapService {
  private store = inject(OrdersLiveStore);
  private auth = inject(AuthService);
  private branches = inject(BranchSelectionService);
  private injector = inject(Injector);

  constructor() {
    // Keep OrdersLiveStore active globally once auth + branch are known
    effect(
      () => {
        const tenantId = this.auth.me()?.id || null;
        // Touch reactive branch selection even for non-admins to re-run on change
        const _selected = this.branches.selectedBranchId();
        const branchId = this.branches.getEffectiveBranchId();
        if (tenantId && branchId) {
          // Ensure polling is running; realtime is wired inside the store effect
          this.store.start();
          // Touch orders list to keep signal graph active
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const _ = this.store.ordersList();
        }
      },
      { injector: this.injector }
    );
  }
}
