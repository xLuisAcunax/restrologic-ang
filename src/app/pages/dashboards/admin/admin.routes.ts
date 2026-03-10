import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminComponent } from './admin.component';
import { UsersComponent } from '../../admin/users/users.component';
import { ProductsComponent } from '../../admin/products/products.component';
import { BranchesComponent } from '../../admin/branches/branches.component';
import { TablesComponent } from '../../admin/tables/tables.component';
import { TaxesComponent } from '../../admin/taxes/taxes.component';
import { OrderHistoryComponent } from '../../admin/orders/order-history.component';
import { PublicMenuComponent } from '../../admin/public-menu/public-menu.component';
import { CashHistoryComponent } from '../../admin/cash/cash-history/cash-history.component';
import { CashDayDetailComponent } from '../../admin/cash/cash-history/cash-day-detail.component';
import { ModuleGuard } from '../../../core/guards/module.guard';

export const routes: Routes = [
  {
    path: '',
    children: [
      {
        path: '',
        component: AdminComponent,
      },
      {
        path: 'branches',
        component: BranchesComponent,
        data: { roles: ['Admin'], title: 'Sucursales' },
      },
      {
        path: 'users',
        component: UsersComponent,
        data: { roles: ['Admin'], title: 'Usuarios' },
      },
      {
        path: 'products',
        component: ProductsComponent,
        data: { roles: ['Admin'], title: 'Productos' },
      },
      {
        path: 'tables',
        component: TablesComponent,
        data: { roles: ['Admin'], title: 'Mesas' },
      },
      {
        path: 'taxes',
        component: TaxesComponent,
        data: { roles: ['Admin'], title: 'Impuestos' },
      },
      {
        path: 'public-menu',
        component: PublicMenuComponent,
        data: { roles: ['Admin'], title: 'Menú público' },
      },
      {
        path: 'deliveries',
        loadComponent: () =>
          import('../../admin/deliveries/deliveries.component').then(
            (m) => m.DeliveriesComponent,
          ),
        canActivate: [ModuleGuard],
        data: {
          roles: ['Admin', 'Super'],
          requiredModule: 'deliveries',
          title: 'Gestión de Entregas',
        },
      },
      {
        path: 'orders',
        component: OrderHistoryComponent,
        data: { roles: ['Admin'], title: 'Historial de órdenes' },
      },
      {
        path: 'cash-history',
        component: CashHistoryComponent,
        data: { roles: ['Admin'], title: 'Historial de caja' },
      },
      {
        path: 'cash-history/:drawerId',
        component: CashDayDetailComponent,
        data: { roles: ['Admin'], title: 'Detalle de caja' },
      },
      {
        path: 'options',
        loadComponent: () =>
          import('../../admin/dashboard-stats/dashboard-stats.component').then(
            (m) => m.DashboardStatsComponent,
          ),
        data: { roles: ['Admin'], title: 'Opciones' },
      },
      // { path: 'businesses/:businessId', component: BusinessDetailComponent },
      // { path: 'audits', component: AuditListComponent },
      // { path: 'audits/:id', component: AuditDetailComponent },
      { path: 'stats', redirectTo: 'options', pathMatch: 'full' },
      { path: '**', redirectTo: '' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminRoutes {}

