import { Routes } from '@angular/router';
import { AppLayoutComponent } from './shared/layouts/app-layout/app-layout.component';
import { PublicLayoutComponent } from './shared/layouts/public-layout/public-layout.component';
import { SignUpComponent } from './pages/auth/sign-up/sign-up.component';
import { SignInComponent } from './pages/auth/sign-in/sign-in.component';
import { NotFoundComponent } from './pages/others/not-found/not-found.component';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleGuard } from './core/guards/role.guard';
import { HomeRedirectGuard } from './core/guards/home-redirect.guard';
import { NotAuthorizedComponent } from './core/components/not-authorized.component';
import { PublicMenuComponent } from './pages/public/menu/menu.component';
import { OrderSuccessComponent } from './pages/public/order-success/order-success.component';

export const routes: Routes = [
  { path: 'signin', component: SignInComponent },
  { path: 'signup', component: SignUpComponent },

  // Public routes with shared layout (specific paths only)
  {
    path: 'menu',
    component: PublicLayoutComponent,
    children: [{ path: '', component: PublicMenuComponent }],
  },
  {
    path: 'seguimiento',
    component: PublicLayoutComponent,
    children: [{ path: '', component: OrderSuccessComponent }],
  },
  {
    path: 'pedido-exitoso/:orderId',
    redirectTo: 'seguimiento',
    pathMatch: 'full',
  },

  // Authenticated routes
  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [AuthGuard],
    canActivateChild: [RoleGuard],
    children: [
      // Home redirect según rol
      {
        path: '',
        pathMatch: 'full',
        canActivate: [HomeRedirectGuard],
        component: AppLayoutComponent,
      },

      // Super dashboard (exclusivo SUPER)
      {
        path: 'super',
        loadChildren: () =>
          import('./pages/dashboards/super/super.routes').then(
            (m) => m.SuperRoutes
          ),
        data: { roles: ['Super'] },
      },

      // Admin dashboard (ADMIN y SUPER)
      {
        path: 'admin',
        loadChildren: () =>
          import('./pages/dashboards/admin/admin.routes').then(
            (m) => m.AdminRoutes
          ),
        data: { roles: ['Admin', 'Super'] },
      },

      // User dashboard (Mesero, Cajero, Cocina, Repartidor + ADMIN + SUPER)
      {
        path: 'user',
        loadChildren: () =>
          import('./pages/dashboards/user/user.routes').then(
            (m) => m.UserRoutes
          ),
        data: {
          roles: ['Mesero', 'Cajero', 'Cocina', 'Admin', 'Super'],
        },
      },

      // Delivery dashboard (exclusivo Repartidor)
      {
        path: 'delivery',
        loadChildren: () =>
          import('./pages/dashboards/delivery/delivery.routes').then(
            (m) => m.DeliveryRoutes
          ),
        data: { roles: ['Repartidor'] },
      },
    ],
  },

  { path: 'not-authorized', component: NotAuthorizedComponent },
  { path: 'notfound', component: NotFoundComponent },
  { path: '**', redirectTo: 'notfound' },
];


