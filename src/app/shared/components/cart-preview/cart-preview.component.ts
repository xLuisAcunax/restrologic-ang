import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService, CartItem } from '../../services/cart.service';
import { CartUiService } from '../../services/cart-ui.service';

@Component({
  selector: 'app-cart-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cart-preview.component.html',
  styleUrls: ['./cart-preview.component.css'],
})
export class CartPreviewComponent {
  private cart = inject(CartService);
  private ui = inject(CartUiService);
  open = signal(false);

  items = this.cart.items;
  count = this.cart.count;
  total = this.cart.total;

  toggle() {
    this.open.update((v) => !v);
  }
  clear() {
    this.cart.clear();
  }
  openDrawer() {
    this.ui.openDrawer();
  }

  trackById(_index: number, item: CartItem) {
    return item.id;
  }

  sizeLabelFromKey(key?: string): string | null {
    if (!key || key === 'unico') return null;
    switch (key) {
      case 'personal':
        return 'Personal';
      case 'mediana':
        return 'Mediana';
      case 'familiar':
        return 'Familiar';
      default:
        return key;
    }
  }
}
