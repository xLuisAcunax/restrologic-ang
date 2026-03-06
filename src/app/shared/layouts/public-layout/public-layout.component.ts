import {
  Component,
  inject,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { CartUiService } from '../../services/cart-ui.service';
import { CartDrawerComponent } from '../../components/cart-drawer/cart-drawer.component';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, CartDrawerComponent],
  templateUrl: './public-layout.component.html',
  styles: `
    @keyframes cartBounce {
      0%, 100% { transform: scale(1); }
      25% { transform: scale(1.2); }
      50% { transform: scale(0.95); }
      75% { transform: scale(1.1); }
    }
    .animate-cart-bounce {
      animation: cartBounce 0.6s ease-in-out;
    }
  `,
})
export class PublicLayoutComponent implements AfterViewInit, OnDestroy {
  private route = inject(ActivatedRoute);
  cart = inject(CartService);
  private ui = inject(CartUiService);

  isScrolled = false;
  private scrollListener?: () => void;

  @ViewChild('hdr') hdr?: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    // Scroll Listener
    this.scrollListener = () => {
      this.isScrolled = window.scrollY > 10;
    };
    window.addEventListener('scroll', this.scrollListener);
  }

  ngOnDestroy(): void {
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener);
    }
  }

  // Preserve tenantId, branchId, and orderId from query params
  queryParams() {
    const params: any = {};
    const snapshot = this.route.snapshot;

    // Try to get from current route or first child
    const queryParams = snapshot.queryParamMap;
    const tenantId = queryParams.get('tenantId');
    const branchId = queryParams.get('branchId');
    const orderId = queryParams.get('orderId');

    if (tenantId) params.tenantId = tenantId;
    if (branchId) params.branchId = branchId;
    if (orderId) params.orderId = orderId;

    return params;
  }

  openCart() {
    this.ui.openDrawer();
  }
}
