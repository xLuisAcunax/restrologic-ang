import { CommonModule } from '@angular/common';
import { Component, Inject, computed, inject, signal } from '@angular/core';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LocalDateTimePipe } from '../../../../shared/pipes/local-datetime.pipe';
import {
  PaymentDialogData,
  PaymentDialogResult,
} from '../../../../core/models/payment.model';
import { PaymentMethodType } from '../../../../core/models/order.model';

@Component({
  selector: 'app-payment-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LocalDateTimePipe],
  templateUrl: './payment-dialog.component.html',
})
export class PaymentDialogComponent {
  private fb = inject(FormBuilder);

  readonly data: PaymentDialogData = inject(DIALOG_DATA);
  private dialogRef = inject(DialogRef<PaymentDialogResult>);

  // ✅ NUEVO: Indicador de si está procesando
  readonly isProcessing = signal(false);

  readonly methodOptions: Array<{
    value: PaymentMethodType;
    label: string;
    hint?: string;
  }> = [
    { value: 'cash', label: 'Efectivo' },
    { value: 'card', label: 'Tarjeta (crédito / débito)' },
    { value: 'bank_transfer', label: 'Transferencia bancaria' },
    { value: 'nequi', label: 'Nequi' },
    { value: 'daviplata', label: 'Daviplata' },
    { value: 'mobile', label: 'Pago móvil' },
    { value: 'other', label: 'Otro' },
  ];

  readonly form = this.fb.nonNullable.group({
    method: this.fb.nonNullable.control<PaymentMethodType>('cash', {
      validators: [Validators.required],
    }),
    amount: this.fb.nonNullable.control<number>(this.getSuggestedAmount(), {
      validators: [Validators.required, Validators.min(0.01)],
    }),
    reference: this.fb.control<string>('', {
      validators: [Validators.maxLength(120)],
    }),
    notes: this.fb.control<string>('', {
      validators: [Validators.maxLength(250)],
    }),
  });

  readonly outstanding = signal(this.roundCurrency(this.data.outstanding));
  readonly isFullyPaid = computed(() => this.outstanding() <= 0);

  constructor() {
    const maxAmount = Math.max(this.outstanding(), 0);
    this.form.controls.amount.addValidators(Validators.max(maxAmount));
  }

  confirm() {
    if (this.isFullyPaid()) {
      this.dialogRef.close();
      return;
    }

    // ✅ NUEVO: Protección contra doble click
    if (this.isProcessing()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { method, amount, reference, notes } = this.form.getRawValue();
    const normalizedAmount = this.roundCurrency(Number(amount));
    if (normalizedAmount <= 0) {
      this.form.controls.amount.setErrors({ min: true });
      return;
    }

    // ✅ NUEVO: Marcar como procesando
    this.isProcessing.set(true);

    this.dialogRef.close({
      method,
      amount: normalizedAmount,
      reference: reference?.trim() || undefined,
      notes: notes?.trim() || undefined,
    });
  }

  cancel() {
    this.dialogRef.close();
  }

  formatCurrency(value: number): string {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: this.data.currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${this.data.currency} ${value.toFixed(2)}`;
    }
  }

  formatPaymentMethod(method: PaymentMethodType): string {
    const option = this.methodOptions.find((item) => item.value === method);
    if (option) {
      return option.label;
    }
    return method
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char: string) => char.toUpperCase());
  }

  private getSuggestedAmount(): number {
    return this.roundCurrency(Math.max(0, this.data.outstanding));
  }

  private roundCurrency(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }
}
