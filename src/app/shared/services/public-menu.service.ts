import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProductModifierGroup } from '../../core/services/modifier.service';

export type PublicMenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  imageUrl?: string | null;
  isActive: boolean;
  category: {
    id: string;
    name: string;
  };
  subcategory?: {
    id: string;
    name: string;
  } | null;
  modifierGroups?: ProductModifierGroup[]; // Modifier groups for this product
};

export type PublicMenuResponse = {
  ok: boolean;
  data: {
    categories: Array<{
      id: string;
      name: string;
      description?: string | null;
    }>;
    products: PublicMenuItem[];
  };
};

@Injectable({ providedIn: 'root' })
export class PublicMenuService {
  private readonly base = environment.apiBaseUrl;
  private http = inject(HttpClient);

  getPublicMenu(
    tenantId: string,
    branchId: string,
    includeModifiers = true,
  ): Observable<PublicMenuResponse> {
    let url = `${this.base}/public/menu?tenantId=${tenantId}&branchId=${branchId}`;
    if (includeModifiers) {
      url += '&include=modifierGroups';
    }
    return this.http.get<PublicMenuResponse>(url);
  }
}
