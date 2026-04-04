// src/app/shared/modal/cdk-modal.component.ts
import {
  Component,
  EventEmitter,
  Output,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';


@Component({
  selector: 'app-cdk-modal',
  standalone: true,
  imports: [],
  template: `
    <!-- panel principal (panelClass ya lo aplica el overlay pane) -->
    <div class="modal modal-open">
      <div class="modal-box p-0 max-w-2xl">
        <!-- slot dinámico donde montamos el componente -->
        <div class="p-4">
          <ng-template #vc></ng-template>
        </div>

        <div class="modal-action p-4 border-t">
          <button class="btn" (click)="onCancel()">Cancelar</button>
          <button class="btn btn-primary" (click)="onConfirm()">Aceptar</button>
        </div>
      </div>
    </div>
  `,
})
export class CdkModalComponent {
  @ViewChild('vc', { read: ViewContainerRef, static: true })
  vc!: ViewContainerRef;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm() {
    this.confirm.emit();
  }
  onCancel() {
    this.cancel.emit();
  }
}
