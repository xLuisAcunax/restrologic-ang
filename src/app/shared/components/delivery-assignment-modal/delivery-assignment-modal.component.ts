import { Component, Inject, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { OrderService } from '../../../core/services/order.service';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { Driver } from '../../../core/services/driver.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'delivery-assignment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 bg-white rounded-lg">
      <h2 class="text-2xl font-bold mb-4">Asignar Conductor</h2>

      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text">Conductor</span>
        </label>
        <select
          class="select select-bordered w-full"
          [(ngModel)]="selectedDriverId"
          [disabled]="loading()"
        >
          <option [value]="null">Seleccionar conductor...</option>
          @for (driver of availableDrivers(); track driver.id) {
            <option [value]="driver.id">
              {{ driver.name }}
              @if (driver.activeDeliveries > 0) {
                ({{ driver.activeDeliveries }} activas)
              }
            </option>
          }
        </select>
      </div>

      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text">Notas (opcional)</span>
        </label>
        <textarea
          class="textarea textarea-bordered"
          [(ngModel)]="notes"
          placeholder="Ej: Entregar antes de las 8pm"
          rows="3"
        ></textarea>
      </div>

      @if (error()) {
        <div class="alert alert-error alert-soft mb-4">
          <div class="flex flex-col gap-2">
            <span>{{ error() }}</span>
            @if (is404()) {
              <div class="text-sm text-red-700">
                El endpoint de asignación no está disponible (404). Puedes
                continuar con una asignación optimista para avanzar en el flujo.
              </div>
              <button
                class="btn btn-outline btn-sm"
                (click)="assignOptimistic()"
              >
                Asignar manualmente (optimista)
              </button>
            }
          </div>
        </div>
      }

      <div class="flex gap-2 justify-end">
        <button class="btn btn-ghost" (click)="cancel()" [disabled]="loading()">
          Cancelar
        </button>
        <button
          class="btn btn-primary"
          (click)="assign()"
          [disabled]="!selectedDriverId || loading()"
        >
          @if (loading()) {
            <span class="loading loading-spinner loading-sm"></span>
          }
          Asignar
        </button>
      </div>
    </div>
  `,
})
export class DeliveryAssignmentModal {
  private auth = inject(AuthService);
  private orderService = inject(OrderService);
  private branchSelection = inject(BranchSelectionService);
  private dialogRef = inject(DialogRef);

  selectedDriverId: string | null = null;
  notes = '';
  loading = signal(false);
  error = signal<string | null>(null);
  lastStatusCode = signal<number | null>(null);
  is404 = computed(() => this.lastStatusCode() === 404);

  availableDrivers = computed(() =>
    this.data.drivers.filter(
      (d: Driver) => d.isAvailable || d.id === this.data.currentDriverId,
    ),
  );

  tenantId = computed(() => this.auth.me()?.tenantId || '');
  branchId = computed(() => this.branchSelection.getEffectiveBranchId() || '');

  constructor(
    @Inject(DIALOG_DATA)
    public data: {
      orderId: string;
      currentDriverId: string | null;
      drivers: Driver[];
      branchId?: string; // pasar branchId real de la orden para admins
    },
  ) {
    this.selectedDriverId = data.currentDriverId;
  }

  assign() {
    if (!this.selectedDriverId) return;
    if (!this.branchId()) {
      this.error.set('Selecciona una sucursal antes de asignar un conductor');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.lastStatusCode.set(null);

    const effectiveBranchId = this.data.branchId || this.branchId();
    console.log('[DeliveryAssignmentModal] Assignment params:', {
      tenantId: this.tenantId(),
      branchId: effectiveBranchId,
      orderId: this.data.orderId,
      driverId: this.selectedDriverId,
      dataProvidedBranchId: this.data.branchId,
      computedBranchId: this.branchId(),
    });
    this.orderService
      .assignDriver(
        this.tenantId(),
        effectiveBranchId,
        this.data.orderId,
        this.selectedDriverId,
      )
      .subscribe({
        next: (resp: any) => {
          console.log(
            '[DeliveryAssignmentModal] Driver assigned response:',
            resp,
          );
          this.loading.set(false);
          // Si se usó fallback singular, igual cerramos; podríamos mostrar badge futuro
          this.dialogRef.close('assigned');
        },
        error: (err: any) => {
          this.loading.set(false);
          this.lastStatusCode.set(err.status);
          this.error.set(
            err.error?.error ||
              (err.status === 404
                ? 'No se encontró el endpoint de asignación (404)'
                : 'Error al asignar conductor'),
          );
        },
      });
  }

  assignOptimistic() {
    if (!this.selectedDriverId) return;
    const effectiveBranchId = this.data.branchId || this.branchId();
    if (!effectiveBranchId) {
      this.error.set('Selecciona una sucursal antes de asignar un conductor');
      return;
    }
    // Cierra el diálogo con información suficiente para que el componente padre haga update local
    this.dialogRef.close({
      status: 'optimistic',
      driverId: this.selectedDriverId,
      notes: this.notes || null,
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}
