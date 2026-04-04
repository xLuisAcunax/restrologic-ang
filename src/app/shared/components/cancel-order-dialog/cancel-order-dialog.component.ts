import { Component, Input } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DialogRef } from '@angular/cdk/dialog';

@Component({
  selector: 'app-cancel-order-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal modal-open">
      <div class="modal-box max-w-md">
        <h3 class="font-bold text-lg">Cancelar orden</h3>
        <p class="py-2 text-sm text-base-content/70">
          Indica el motivo de cancelación (mínimo 3 caracteres).
        </p>
        <textarea
          class="textarea textarea-bordered w-full min-h-28"
          [(ngModel)]="reason"
          (ngModelChange)="onChange()"
          placeholder="Ej: Cliente se retiró, error en pedido, etc."
        ></textarea>
        <div class="mt-1 text-xs" [class.text-error]="!valid" [class.text-base-content/60]="valid">
          {{ valid ? remainingText : 'Debes ingresar al menos 3 caracteres.' }}
        </div>
        <div class="modal-action">
          <button class="btn" (click)="cancel()">Cerrar</button>
          <button class="btn btn-error" [disabled]="!valid" (click)="confirm()">
            Confirmar cancelación
          </button>
        </div>
      </div>
    </div>
  `,
})
export class CancelOrderDialogComponent {
  @Input() maxLength = 500;
  reason = '';
  valid = false;
  remainingText = '';

  constructor(private dialogRef: DialogRef<string>) {}

  ngOnInit() {
    this.updateCounter();
  }

  onChange() {
    this.updateCounter();
  }

  private updateCounter() {
    const len = (this.reason || '').trim().length;
    this.valid = len >= 3 && len <= this.maxLength;
    const remaining = Math.max(0, this.maxLength - len);
    this.remainingText = `${remaining} caracteres restantes`;
  }

  // Button handlers
  cancel() {
    this.dialogRef.close();
  }

  confirm() {
    if (!this.valid) return;
    this.dialogRef.close((this.reason || '').trim());
  }
}
