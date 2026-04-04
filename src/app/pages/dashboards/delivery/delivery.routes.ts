import { Routes } from '@angular/router';

export const DeliveryRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./my-deliveries/my-deliveries.component').then(
        (m) => m.MyDeliveriesComponent,
      ),
  },
  {
    path: 'route-ol',
    loadComponent: () =>
      import('./route-map-ol/route-map-ol.component').then(
        (m) => m.RouteMapOlComponent,
      ),
  },
];
