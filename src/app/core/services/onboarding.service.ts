import { inject, Injectable } from '@angular/core';
import { map, switchMap } from 'rxjs';
import { BusinessDetail, BusinessService } from './business.service';
import { UserService } from './user.service';

export interface OwnerRegistrationPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  userName?: string;
  role?: string;
  isActive?: boolean;
}

export interface BusinessRegistrationPayload {
  nit: string;
  name: string;
  description?: string;
  modules?: string[];
  isActive?: boolean;
  createdAt?: string;
}

export interface BusinessOwnerOnboardingPayload {
  owner: OwnerRegistrationPayload;
  business: BusinessRegistrationPayload;
  createdBy: string;
}

export interface BusinessOwnerOnboardingResult {
  tenant: BusinessDetail;
  user: any;
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private businessService = inject(BusinessService);
  private userService = inject(UserService);

  registerOwnerWithBusiness(payload: BusinessOwnerOnboardingPayload) {
    const { business, owner } = payload;
    const schemaName = this.buildSchemaName(business.name, business.nit);

    return this.businessService
      .createTenant({
        name: business.name,
        description: business.description,
        schemaName,
      })
      .pipe(
        switchMap(({ data: tenant }) => {
          if (!tenant?.id) {
            throw new Error('Failed to create tenant');
          }

          return this.userService
            .createUser({
              firstName: owner.firstName,
              lastName: owner.lastName,
              email: owner.email,
              password: owner.password,
              isActive: owner.isActive ?? true,
              roleId: owner.role ?? 'Admin',
              userName: owner.userName,
            })
            .pipe(
              switchMap((user) =>
                this.userService.assignUserToTenant({
                  email: owner.email,
                  tenantId: tenant.id,
                }).pipe(
                  map(() => ({
                    tenant,
                    user,
                  }))
                )
              )
            );
        })
      );
  }

  private buildSchemaName(name: string, nit: string) {
    const base = `${name}-${nit}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);

    return base || `tenant_${Date.now()}`;
  }
}
