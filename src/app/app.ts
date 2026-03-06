import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
// Websocket/polling not implemented yet on backend - disabled for now
// import { OrdersBadgeInitializerService } from './shared/services/orders-badge-initializer.service';
// import { OrdersRealtimeBootstrapService } from './shared/services/orders-realtime-bootstrap.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('restrologic');
  // Websocket/polling disabled - backend doesn't support these endpoints yet
  // constructor(
  //   _ordersRealtimeBootstrap: OrdersRealtimeBootstrapService,
  //   _ordersBadgeInit: OrdersBadgeInitializerService
  // ) {}
}
