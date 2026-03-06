import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderNotificationService } from '../../services/order-notification.service';

@Component({
  selector: 'delivery-order-toast-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delivery-order-toast.component.html',
})
export class DeliveryOrderToastComponent {
  readonly notif = inject(OrderNotificationService);
  toasts = computed(() => this.notif.toasts());

  dismiss(id: string) {
    this.notif.removeToast(id);
  }
}
