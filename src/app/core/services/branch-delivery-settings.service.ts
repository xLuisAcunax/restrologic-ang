import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type BranchDeliveryPricingBracket = {
  upToKm: number;
  baseFee: number;
  perKm?: number | null;
};

export type BranchDeliverySettings = {
  branchId: string;
  deliveryEnabled: boolean;
  enablePublicMenu: boolean;
  deliveryRadiusKm: number;
  freeDeliveryThresholdKm?: number | null;
  pricingBrackets: BranchDeliveryPricingBracket[];
  autoAssignmentStrategy: 'MANUAL' | 'ROUND_ROBIN' | 'NEAREST';
  routeProvider: 'NONE' | 'MAPBOX' | 'GOOGLE';
};

@Injectable({ providedIn: 'root' })
export class BranchDeliverySettingsService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  getSettings(branchId: string): Observable<BranchDeliverySettings> {
    return this.http.get<BranchDeliverySettings>(
      `${this.base}/Branches/${branchId}/delivery-settings`
    );
  }

  updateSettings(
    branchId: string,
    dto: Omit<BranchDeliverySettings, 'branchId'>
  ): Observable<BranchDeliverySettings> {
    return this.http.put<BranchDeliverySettings>(
      `${this.base}/Branches/${branchId}/delivery-settings`,
      dto
    );
  }
}
