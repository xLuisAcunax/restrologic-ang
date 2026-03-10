import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BranchDeliverySettings } from '../../core/services/branch-delivery-settings.service';

export type PublicCheckoutBranch = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type PublicCheckoutConfig = {
  branch: PublicCheckoutBranch;
  deliverySettings: BranchDeliverySettings;
};

export type PublicGeocodeCacheLookup = {
  found: boolean;
  provider?: string | null;
  location?: {
    lat: number;
    lng: number;
  } | null;
};

@Injectable({ providedIn: 'root' })
export class PublicCheckoutService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  getCheckoutConfig(
    tenantId: string,
    branchId: string
  ): Observable<PublicCheckoutConfig> {
    const params = new HttpParams()
      .set('tenantId', tenantId)
      .set('branchId', branchId);

    return this.http.get<PublicCheckoutConfig>(
      `${this.base}/orders/public/checkout-config`,
      { params }
    );
  }

  lookupCachedAddress(
    tenantId: string,
    branchId: string,
    address: string
  ): Observable<PublicGeocodeCacheLookup> {
    const params = new HttpParams()
      .set('tenantId', tenantId)
      .set('branchId', branchId)
      .set('address', address);

    return this.http.get<PublicGeocodeCacheLookup>(
      `${this.base}/orders/public/geocode-cache`,
      { params }
    );
  }

  storeCachedAddress(
    tenantId: string,
    branchId: string,
    address: string,
    location: { lat: number; lng: number },
    city?: string | null,
    country?: string | null,
    provider = 'google'
  ): Observable<PublicGeocodeCacheLookup> {
    return this.http.post<PublicGeocodeCacheLookup>(
      `${this.base}/orders/public/geocode-cache`,
      {
        tenantId,
        branchId,
        address,
        city,
        country,
        provider,
        location,
      }
    );
  }
}
