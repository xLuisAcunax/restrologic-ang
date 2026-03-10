import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { PageBreadcrumbComponent } from '../../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { Dialog } from '@angular/cdk/dialog';
import { OnboardingFormComponent } from '../onboarding-form/onboarding-form.component';
import {
  BusinessItem,
  BusinessService,
} from '../../../core/services/business.service';
import { AdminRoutes } from '../../dashboards/admin/admin.routes';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'super-business',
  imports: [
    CommonModule,
    DatePipe,
    PageBreadcrumbComponent,
    AdminRoutes,
    RouterLink,
  ],
  templateUrl: './super-businesses.component.html',
})
export class SuperBusinessesComponent implements OnInit {
  tenants = signal<BusinessItem[]>([]);
  total = signal(0);
  viewMode = signal<'table' | 'cards'>('cards');
  search = signal('');
  tenantService = inject(BusinessService);
  private dialog = inject(Dialog);

  lastSaved: any = null;

  ngOnInit(): void {
    this.load();
  }

  get filteredBusinesses() {
    const q = this.search().toLowerCase().trim();
    if (!q) return this.tenants();
    return this.tenants().filter((b) => {
      const ownerName = (b as any).ownerName || '';
      return `${b.name} ${ownerName} ${b.isActive || ''}`
        .toLowerCase()
        .includes(q);
    });
  }

  async showModal() {
    const dialogRef = this.dialog.open(OnboardingFormComponent, {
      width: '400px',
      data: { algo: 'Confirmation' },
    });

    dialogRef.closed.subscribe((result) => {
      if (result === 'Confirmed') {
        this.load();
      }
    });
  }

  load() {
    this.tenantService.list().subscribe((res) => {
      this.tenants.set(res.data);
      this.total.set(res.data.length);
    });
  }

  getBadgeColor(
    status: boolean | undefined
  ): 'badge badge-success' | 'badge badge-warning' | 'badge badge-error' {
    if (status) return 'badge badge-success';
    return 'badge badge-error';
  }
}
