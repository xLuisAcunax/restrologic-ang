import { Component, OnInit, inject } from '@angular/core';
import { SidebarService } from '../../services/sidebar.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BackdropComponent } from '../backdrop/backdrop.component';
import { AppHeaderComponent } from '../app-header/app-header.component';
import { AppSidebarComponent } from '../app-sidebar/app-sidebar.component';
import { DeliveryOrderToastComponent } from '../../components/delivery-order-toast/delivery-order-toast.component';
import { OrderNotificationService } from '../../services/order-notification.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-layout',
  imports: [
    CommonModule,
    RouterModule,
    BackdropComponent,
    AppHeaderComponent,
    AppSidebarComponent,
    DeliveryOrderToastComponent,
  ],
  templateUrl: './app-layout.component.html',
})
export class AppLayoutComponent implements OnInit {
  readonly isExpanded$;
  readonly isHovered$;
  readonly isMobileOpen$;

  private orderNotificationService = inject(OrderNotificationService);
  private authService = inject(AuthService);

  constructor(public sidebarService: SidebarService) {
    this.isExpanded$ = this.sidebarService.isExpanded$;
    this.isHovered$ = this.sidebarService.isHovered$;
    this.isMobileOpen$ = this.sidebarService.isMobileOpen$;
  }

  ngOnInit(): void {
    // Only initialize if user is authenticated
    const user = this.authService.me();
    if (user) {
      // Initialize delivery order notifications for internal authenticated users
      this.orderNotificationService.initialize();
    }
  }
}
