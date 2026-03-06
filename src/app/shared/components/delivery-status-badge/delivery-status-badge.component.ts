import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeliveryStatus } from '../../../core/models/order.model';

@Component({
  selector: 'delivery-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [ngClass]="badgeClass()" class="inline-flex items-center gap-1">
      <span class="material-icons" style="font-size: 14px;">{{ icon() }}</span>
      <span>{{ label() }}</span>
    </span>
  `,
})
export class DeliveryStatusBadge {
  @Input() status!: DeliveryStatus;

  badgeClass(): string {
    const baseClass = 'badge';
    switch (this.status) {
      case 'pending':
        return `${baseClass} badge-warning`;
      case 'assigned':
        return `${baseClass} badge-info`;
      case 'accepted':
        return `${baseClass} badge-info`;
      case 'preparing':
        return `${baseClass} badge-secondary`;
      case 'ready':
        return `${baseClass} badge-primary`;
      case 'picked_up':
        return `${baseClass} badge-accent`;
      case 'in_transit':
        return `${baseClass} badge-accent`;
      case 'delivered':
        return `${baseClass} badge-success`;
      case 'cancelled':
        return `${baseClass} badge-error`;
      case 'failed':
        return `${baseClass} badge-error`;
      default:
        return `${baseClass} badge-ghost`;
    }
  }

  icon(): string {
    switch (this.status) {
      case 'pending':
        return 'schedule';
      case 'assigned':
        return 'assignment';
      case 'accepted':
        return 'thumb_up';
      case 'preparing':
        return 'restaurant';
      case 'ready':
        return 'done';
      case 'picked_up':
        return 'local_shipping';
      case 'in_transit':
        return 'local_shipping';
      case 'delivered':
        return 'check_circle';
      case 'cancelled':
        return 'cancel';
      case 'failed':
        return 'error';
      default:
        return 'help';
    }
  }

  label(): string {
    switch (this.status) {
      case 'pending':
        return 'Pendiente';
      case 'assigned':
        return 'Asignado';
      case 'accepted':
        return 'Aceptado';
      case 'preparing':
        return 'Preparando';
      case 'ready':
        return 'Listo';
      case 'picked_up':
        return 'Recogido';
      case 'in_transit':
        return 'En tránsito';
      case 'delivered':
        return 'Entregado';
      case 'cancelled':
        return 'Cancelado';
      case 'failed':
        return 'Fallido';
      default:
        return 'Desconocido';
    }
  }
}
