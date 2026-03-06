import { CommonModule } from '@angular/common';
import { Component, Inject, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  CreateTaxDto,
  Tax,
  TaxService,
  UpdateTaxDto,
} from '../../../../core/services/tax.service';

@Component({
  selector: 'app-tax-form',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './tax-form.component.html',
})
export class TaxFormComponent {
  taxService = inject(TaxService);

  form = new FormBuilder().group({
    name: ['', Validators.required],
    value: [0, [Validators.required, Validators.min(0)]],
    isPercentage: [true, Validators.required],
    isIncluded: [false],
    isActive: [true],
  });

  constructor(
    public dialogRef: DialogRef<string>,
    @Inject(DIALOG_DATA)
    public data: {
      tenantId: string;
      tax?: Tax;
    },
  ) {
    if (this.data.tax) {
      this.form.patchValue({
        name: this.data.tax.name,
        value:
          typeof this.data.tax.value === 'number'
            ? this.data.tax.value
            : this.data.tax.percentage,
        isPercentage: this.data.tax.isPercentage,
        isIncluded: this.data.tax.isIncluded,
        isActive: this.data.tax.isActive,
      });
    }
  }

  onSaving() {
    if (!this.form.valid) return;

    if (this.data.tax) {
      // Update existing tax
      const updateDto = this.mapTaxToUpdateDto();
      this.taxService
        .updateTax(updateDto, this.data.tax.id)
        .subscribe(() => this.dialogRef.close('Confirmed'));
    } else {
      // Create new tax
      const createDto = this.mapTaxToCreateDto();
      this.taxService
        .createTax(createDto)
        .subscribe(() => this.dialogRef.close('Confirmed'));
    }
  }

  private coerceBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    return fallback;
  }

  private coerceNumber(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private mapTaxToCreateDto(): CreateTaxDto {
    return {
      name: (this.form.value.name || '').trim(),
      value: this.coerceNumber(this.form.value.value),
      isPercentage: this.coerceBoolean(this.form.value.isPercentage, true),
      isIncluded: this.coerceBoolean(this.form.value.isIncluded),
      isActive: this.coerceBoolean(this.form.value.isActive, true),
    };
  }

  private mapTaxToUpdateDto(): UpdateTaxDto {
    return {
      name: (this.form.value.name || '').trim(),
      value: this.coerceNumber(this.form.value.value),
      isPercentage: this.coerceBoolean(this.form.value.isPercentage, true),
      isIncluded: this.coerceBoolean(this.form.value.isIncluded),
      isActive: this.coerceBoolean(this.form.value.isActive, true),
    };
  }
}
