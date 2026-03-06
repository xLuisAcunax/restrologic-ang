import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UserComponent } from './user.component';
import { UserTablesComponent } from '../../user/tables/tables.component';
import { UserOrdersComponent } from '../../user/orders/orders.component';
import { UserCashComponent } from '../../user/cash/cash.component';
import { UserKitchenComponent } from '../../user/kitchen/kitchen.component';
import { UserReservationsComponent } from '../../user/reservations/reservations.component';

export const routes: Routes = [
  {
    path: '',
    children: [
      { path: '', component: UserComponent },
      {
        path: 'tables',
        component: UserTablesComponent,
        data: {
          roles: ['WAITER', 'CASHIER', 'KITCHEN', 'DELIVERY', 'Admin', 'Super'],
          title: 'Mesas',
        },
      },
      {
        path: 'orders',
        component: UserOrdersComponent,
        data: {
          roles: ['WAITER', 'CASHIER', 'KITCHEN', 'DELIVERY', 'Admin', 'Super'],
          title: 'Órdenes',
        },
      },
      {
        path: 'cash',
        component: UserCashComponent,
        data: { roles: ['CASHIER', 'Admin', 'Super'], title: 'Caja' },
      },
      {
        path: 'kitchen',
        component: UserKitchenComponent,
        data: { roles: ['KITCHEN', 'Admin', 'Super'], title: 'Cocina' },
      },
      {
        path: 'reservations',
        component: UserReservationsComponent,
        data: { roles: ['Admin', 'CASHIER'], title: 'Reservas' },
      },
      { path: '**', redirectTo: '' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UserRoutes {}
