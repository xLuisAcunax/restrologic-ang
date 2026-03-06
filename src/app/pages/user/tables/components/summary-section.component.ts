import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrderItem } from '../../../../core/models/order.model';

@Component({
  selector: 'app-summary-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './summary-section.component.html',
})
export class SummarySectionComponent {
  // State inputs
  @Input() orderDiscounts: any[] = [];
  @Input() orderDiscountsTotal: number = 0;
  @Input() orderItems: OrderItem[] = [];
  @Input() orderItemsSubtotal: number = 0;
  @Input() taxesTotal: number = 0;
  @Input() orderTotal: number = 0;
  @Input() paymentsTotal: number = 0;
  @Input() outstandingBalance: number = 0;
  @Input() loading: boolean = false;
  @Input() orderError: string | null = null;

  // Permission inputs
  @Input() canAddProducts: boolean = false;
  @Input() canGenerateInvoice: boolean = false;
  @Input() canProcessPayment: boolean = false;
  @Input() canManageDiscounts: boolean = false;
  @Input() canManageTaxes: boolean = false;
  @Input() hasTaxes: boolean = false;

  // Helper functions from parent
  @Input() formatCurrencyFn?: (value: number | null | undefined) => string;
  @Input() displayProductNameFn?: (item: OrderItem) => string;

  // Events
  @Output() addProducts = new EventEmitter<void>();
  @Output() generateInvoice = new EventEmitter<void>();
  @Output() processPayment = new EventEmitter<void>();
  @Output() openDiscounts = new EventEmitter<void>();
  @Output() openTaxes = new EventEmitter<void>();
  @Output() updateItemQuantity = new EventEmitter<{
    item: OrderItem;
    qty: number;
  }>();
  @Output() removeItem = new EventEmitter<OrderItem>();

  // Proxy helpers
  fc(value: number | null | undefined): string {
    return this.formatCurrencyFn
      ? this.formatCurrencyFn(value)
      : (value ?? 0).toString();
  }
  name(item: OrderItem): string {
    return this.displayProductNameFn
      ? this.displayProductNameFn(item)
      : item.productName || item.productId;
  }
}
