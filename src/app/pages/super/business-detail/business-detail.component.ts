import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  BusinessDetail,
  BusinessService,
} from '../../../core/services/business.service';
import { ActivatedRoute } from '@angular/router';
import { PageBreadcrumbComponent } from '../../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { Dialog } from '@angular/cdk/dialog';
import { BusinessFormComponent } from '../business-form/business-form.component';
import { BranchFormComponent } from '../branch-form/branch-form.component';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'business-detail',
  imports: [CommonModule, RouterModule, DatePipe, PageBreadcrumbComponent],
  templateUrl: './business-detail.component.html',
})
export class BusinessDetailComponent implements OnInit {
  tenant = signal<BusinessDetail | null>(null);
  branches = signal<any[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  private dialog = inject(Dialog);

  tenantService = inject(BusinessService);
  route = inject(ActivatedRoute);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('businessId')!;
    if (id) this.load(id);
  }

  load(id: string) {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      business: this.tenantService.getBusiness(id),
      branches: this.tenantService.getBranches(id),
    }).subscribe({
      next: ({ business, branches }) => {
        const normalizedBranches = Array.isArray(branches) ? branches : [];
        this.branches.set(normalizedBranches);
        this.tenant.set({
          ...business.data,
          branches: normalizedBranches,
        });
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err?.status === 404) this.error.set('Tenant not found');
        else this.error.set('Failed to load tenant');
        console.error(err);
      },
    });
  }

  async showEditBusinessModal() {
    const dialogRef = this.dialog.open(BusinessFormComponent, {
      width: '400px',
      data: { tenantId: this.tenant()?.id, tenant: this.tenant() },
    });

    dialogRef.closed.subscribe(() => {
      this.load(this.tenant()?.id!);
    });
  }

  async showEditBranchModal(branchId?: string) {
    const dialogRef = this.dialog.open(BranchFormComponent, {
      width: '400px',
      data: {
        tenantId: this.tenant()?.id,
        branchId: branchId,
        branch: this.tenant()?.branches?.find((b) => b.id === branchId),
      },
    });

    dialogRef.closed.subscribe(() => {
      this.load(this.tenant()?.id!);
    });
  }

  getBadgeColor(
    status: boolean | undefined
  ): 'badge badge-success' | 'badge badge-warning' | 'badge badge-error' {
    if (status) return 'badge badge-success';
    return 'badge badge-error';
  }
}
