import { inject, Injectable } from '@angular/core';
import { BusinessDetail, BusinessService } from './business.service';
import { UserService } from './user.service';
import { map, switchMap } from 'rxjs';

export interface OwnerRegistrationPayload {
  firstName: string;
  lastName: string;
  email?: string;
  password: string;
  userName: string;
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
  private AuthService = inject(UserService);

  registerOwnerWithBusiness(payload: BusinessOwnerOnboardingPayload) {
    const { business, owner, createdBy } = payload;

    return this.businessService
      .createTenant({
        nit: business.nit,
        name: business.name,
        description: business.description,
        modules: business.modules ?? [],
        createdBy,
        isActive: business.isActive ?? true,
        createdAt: business.createdAt,
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
              createdBy,
              userName: owner.userName,
            })
            .pipe(
              map((user) => ({
                tenant,
                user,
              }))
            );
        })
      );
  }
}
