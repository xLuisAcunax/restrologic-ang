import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product } from '../../../../core/services/product.service';
import {
  ProductModifierGroup,
  Modifier,
} from '../../../../core/services/modifier.service';
import { ModifierGroup } from '../../../../core/services/modifier.service';

@Component({
  selector: 'app-products-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products-panel.component.html',
})
export class ProductsPanelComponent {
  @Input() searchTerm: string = '';
  @Input() loading: boolean = false;
  @Input() products: any[] = [];
  // When true, hide the empty-state because configuration panel is visible in parent
  @Input() configuring: boolean = false;

  // Inline configuration inputs
  @Input() cfg: Product | null = null;
  @Input() activeStep: number = 0;
  @Input() constraintMsg: string | null = null;
  @Input() validationError: string = '';
  @Input() isConfigValid: boolean = false;

  // Function inputs (delegated to parent)
  @Input() getConfigUnitPriceFn?: (product: Product) => number;
  @Input() getSelectionHintFn?: (pmg: ProductModifierGroup) => string;
  @Input() getSelectionTypeFn?: (group: ModifierGroup) => 'SINGLE' | 'MULTIPLE';
  @Input() isModifierDisabledFn?: (
    pmg: ProductModifierGroup,
    modifier: Modifier
  ) => boolean;
  @Input() isModifierSelectedFn?: (
    groupId: string,
    modifierId: string
  ) => boolean;
  @Input() getModifierQuantityFn?: (
    groupId: string,
    modifierId: string
  ) => number;

  @Output() searchChange = new EventEmitter<string>();
  @Output() addProduct = new EventEmitter<any>();
  // Config events
  @Output() cancelConfig = new EventEmitter<void>();
  @Output() confirmConfig = new EventEmitter<void>();
  @Output() setModifierStep = new EventEmitter<number>();
  @Output() previousStep = new EventEmitter<void>();
  @Output() nextStep = new EventEmitter<void>();
  @Output() selectSingleModifier = new EventEmitter<{
    pmg: ProductModifierGroup;
    mod: Modifier;
  }>();
  @Output() toggleMultipleModifier = new EventEmitter<{
    pmg: ProductModifierGroup;
    mod: Modifier;
    event: Event;
  }>();
  @Output() incrementModifierQuantity = new EventEmitter<{
    groupId: string;
    modId: string;
  }>();
  @Output() decrementModifierQuantity = new EventEmitter<{
    groupId: string;
    modId: string;
  }>();

  onSearch(term: string) {
    this.searchChange.emit(term);
  }

  onQuickAdd(product: any) {
    this.addProduct.emit(product);
  }

  // Proxy helpers for template
  getUnitPrice(product: Product): number {
    return this.getConfigUnitPriceFn ? this.getConfigUnitPriceFn(product) : 0;
  }
  getSelectionHint(pmg: ProductModifierGroup): string {
    return this.getSelectionHintFn ? this.getSelectionHintFn(pmg) : '';
  }
  getSelectionType(group: ModifierGroup): 'SINGLE' | 'MULTIPLE' {
    return this.getSelectionTypeFn
      ? this.getSelectionTypeFn(group)
      : 'MULTIPLE';
  }
  isModifierDisabled(pmg: ProductModifierGroup, mod: Modifier): boolean {
    return this.isModifierDisabledFn
      ? this.isModifierDisabledFn(pmg, mod)
      : false;
  }
  isModifierSelected(groupId: string, modId: string): boolean {
    return this.isModifierSelectedFn
      ? this.isModifierSelectedFn(groupId, modId)
      : false;
  }
  getModifierQuantity(groupId: string, modId: string): number {
    return this.getModifierQuantityFn
      ? this.getModifierQuantityFn(groupId, modId)
      : 1;
  }
}
