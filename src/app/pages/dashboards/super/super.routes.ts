import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SuperComponent } from './super.component';
import { SuperBusinessesComponent } from '../../super/super-businesses/super-businesses.component';
import { BusinessDetailComponent } from '../../super/business-detail/business-detail.component';
import { AuditListComponent } from '../../super/audits/audits.component';
import { AuditDetailComponent } from '../../super/audit-detail/audit-detail.component';
import { ModuleManagementComponent } from '../../super/module-management/module-management.component';

export const routes: Routes = [
  {
    path: '',
    children: [
      {
        path: '',
        component: SuperComponent,
      },
      {
        path: 'businesses',
        component: SuperBusinessesComponent,
        data: { roles: ['Super'], title: 'Businesses' },
      },
      { path: 'businesses/:businessId', component: BusinessDetailComponent },
      { path: 'error-logs', component: AuditListComponent },
      { path: 'error-logs/:id', component: AuditDetailComponent },
      { path: 'modules', component: ModuleManagementComponent },
      { path: '**', redirectTo: '' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SuperRoutes {}
