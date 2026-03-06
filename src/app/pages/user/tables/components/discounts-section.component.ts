import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreateDiscountDto } from '../../../../core/models/order.model';

@Component({
  selector: 'app-discounts-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './discounts-section.component.html',
})
export class DiscountsSectionComponent {
  @Input() discountValue: number = 0;
  @Input() discountReason: string = '';
  @Input() discountFormError: string | null = null;
  @Input() orderDiscounts: CreateDiscountDto[] = [];
  @Input() orderDiscountsTotal: number = 0;
  @Input() loading: boolean = false;

  // Function inputs delegating to parent logic
  @Input() onDiscountValueChangeFn: (value: number | string) => void = () => {};
  @Input() onDiscountReasonChangeFn: (reason: string) => void = () => {};
  @Input() applyDiscountFn: () => void = () => {};
  @Input() removeDiscountFn: (index?: number) => void = () => {};

  onValueChange(val: number | string) {
    this.onDiscountValueChangeFn(val);
  }
  onReasonChange(val: string) {
    this.onDiscountReasonChangeFn(val);
  }
  apply() {
    this.applyDiscountFn();
  }
  clearAll() {
    this.removeDiscountFn();
  }
  removeOne(index: number) {
    this.removeDiscountFn(index);
  }
}
