import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PublicContextService {
  tenantId = signal<string>('');
  branchId = signal<string>('');

  setTenantBranch(tenant: string, branch: string) {
    this.tenantId.set(tenant);
    this.branchId.set(branch);
  }
}
