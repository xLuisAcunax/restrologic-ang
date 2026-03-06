import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppliedTax } from '../../../../shared/utils/tax.utils';
import { Tax } from '../../../../core/services/tax.service';

@Component({
  selector: 'app-taxes-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './taxes-section.component.html',
})
export class TaxesSectionComponent {
  @Input() taxes: Tax[] = [];
  @Input() appliedTaxes: AppliedTax[] = [];
  @Input() taxesTotal: number = 0;
  @Input() selectedTaxCount: number = 0;

  // Function inputs (pure delegation to parent logic)
  @Input() isTaxSelectedFn: (taxId: string) => boolean = () => false;
  @Input() onToggleTaxFn: (taxId: string, enabled: boolean) => void = () => {};
  @Input() selectAllTaxesFn: () => void = () => {};
  @Input() clearAllTaxesFn: () => void = () => {};

  selectAll() {
    this.selectAllTaxesFn();
  }
  clearAll() {
    this.clearAllTaxesFn();
  }
  toggleTax(taxId: string, enabled: boolean) {
    this.onToggleTaxFn(taxId, enabled);
  }
  isSelected(taxId: string) {
    return this.isTaxSelectedFn(taxId);
  }
}
