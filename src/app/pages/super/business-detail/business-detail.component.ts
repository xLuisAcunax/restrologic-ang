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
    const id = this.route.snapshot.paramMap.get('businessId')!; //TODO: update to tenantId
    if (id) this.load(id);
  }

  load(id: string) {
    this.loading.set(true);
    this.error.set(null);
    this.tenantService.getBusiness(id).subscribe({
      next: (b) => {
        this.tenant.set(b.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err?.status === 404) this.error.set('Tenant not found');
        else this.error.set('Failed to load tenant');
        console.error(err);
      },
    });

    this.tenantService.getBranches(id).subscribe({
      next: (res: any) => {
        const branches = res?.data || [];
        this.branches.set(branches);
        // Safely assign branches to tenant object if possible
        if (this.tenant()) {
          this.tenant.set({ ...this.tenant()!, branches });
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        console.error('Failed to load branches', err);
      },
    });
  }

  async showEditBusinessModal() {
    const dialogRef = this.dialog.open(BusinessFormComponent, {
      width: '400px',
      data: { tenantId: this.tenant()?.id, tenant: this.tenant() },
    });

    dialogRef.closed.subscribe((result) => {
      console.log('Dialog closed with:', result); // 'Confirmed' or 'Canceled'
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

    dialogRef.closed.subscribe((result) => {
      console.log('Dialog closed with:', result); // 'Confirmed' or 'Canceled'
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

