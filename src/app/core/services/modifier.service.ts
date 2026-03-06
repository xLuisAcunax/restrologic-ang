import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type Modifier = {
  id: string;
  modifierGroupId: string;
  name: string;
  description?: string | null;
  priceAdjustment: number; // Can be positive, negative, or zero
  isDefault: boolean;
  displayOrder: number;
  isActive: boolean;
};

export type ModifierGroup = {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  description?: string | null;
  minSelection: number; // Minimum items customer must select (0 for optional, 1+ for required)
  maxSelection: number; // Maximum items allowed (-1 for unlimited)
  allowPortionSplit: boolean; // TRUE for half-half pizzas, multi-flavor products
  isRequired: boolean;
  displayOrder: number;
  isActive: boolean;
  modifiers?: Modifier[]; // Child modifiers
};

export type ModifierGroupConstraint = {
  type: 'maxSelectionOverride';
  when: {
    modifierGroupId: string;
    modifierId?: string;
  };
  maxSelection?: number;
};

export type ProductModifierGroup = {
  id: string;
  productId: string;
  modifierGroupId: string;
  displayOrder: number;
  isActive: boolean;
  modifierGroup?: ModifierGroup; // Populated group details
  modifiers?: Modifier[]; // Modifiers for this group (populated by API)
  constraints?: ModifierGroupConstraint[];
};

// DTOs for creating/updating
export type CreateModifierGroupDto = {
  tenantId: string;
  branchId: string;
  name: string;
  description?: string | null;
  minSelection: number;
  maxSelection: number;
  allowPortionSplit: boolean;
  isRequired: boolean;
  displayOrder: number;
  isActive: boolean;
  createdBy?: string;
};

export type CreateModifierDto = {
  modifierGroupId: string;
  name: string;
  description?: string | null;
  priceAdjustment: number;
  isDefault: boolean;
  displayOrder: number;
  isActive: boolean;
  createdBy?: string;
};

export type UpdateModifierGroupDto = {
  tenantId: string;
  branchId?: string;
  name?: string;
  description?: string | null;
  minSelection?: number;
  maxSelection?: number;
  allowPortionSplit?: boolean;
  isRequired?: boolean;
  displayOrder?: number;
  isActive?: boolean;
};

export type UpdateModifierDto = {
  name?: string;
  description?: string | null;
  priceAdjustment?: number;
  isDefault?: boolean;
  displayOrder?: number;
  isActive?: boolean;
};

export type AssignModifierGroupToProductDto = {
  productId: string;
  modifierGroupId: string;
  displayOrder: number;
  isActive: boolean;
  constraints?: ModifierGroupConstraint[];
};

@Injectable({
  providedIn: 'root',
})
export class ModifierService {
  private readonly base = environment.apiBaseUrl;
  http = inject(HttpClient);

  // ========== Modifier Groups ==========

  getModifierGroups(tenantId: string, branchId: string) {
    return this.http.get<{ ok: boolean; data: ModifierGroup[] }>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/product/modifier-groups`
    );
  }

  getModifierGroupById(tenantId: string, branchId: string, groupId: string) {
    return this.http.get<{ ok: boolean; data: ModifierGroup }>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/product/modifier-group/${groupId}`
    );
  }

  createModifierGroup(dto: CreateModifierGroupDto) {
    return this.http.post<ModifierGroup>(
      `${this.base}/tenant/${dto.tenantId}/branch/${dto.branchId}/product/modifier-group`,
      dto
    );
  }

  updateModifierGroup(dto: UpdateModifierGroupDto, groupId: string) {
    return this.http.put<ModifierGroup>(
      `${this.base}/tenant/${dto.tenantId}/branch/${dto.branchId}/product/modifier-group/${groupId}`,
      dto
    );
  }

  deleteModifierGroup(tenantId: string, branchId: string, groupId: string) {
    return this.http.delete(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/product/modifier-group/${groupId}`
    );
  }

  // ========== Modifiers (Options within a group) ==========

  getModifiersByGroup(tenantId: string, branchId: string, groupId: string) {
    return this.http.get<{ ok: boolean; data: Modifier[] }>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/product/modifier-group/${groupId}/modifiers`
    );
  }

  createModifier(tenantId: string, branchId: string, dto: CreateModifierDto) {
    return this.http.post<Modifier>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/product/modifier`,
      dto
    );
  }

  updateModifier(
    tenantId: string,
    branchId: string,
    modifierId: string,
    dto: UpdateModifierDto
  ) {
    return this.http.put<Modifier>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/product/modifier/${modifierId}`,
      dto
    );
  }

  deleteModifier(tenantId: string, branchId: string, modifierId: string) {
    return this.http.delete(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/product/modifier/${modifierId}`
    );
  }

  // ========== Product-ModifierGroup Associations ==========

  getProductModifierGroups(
    tenantId: string,
    branchId: string,
    productId: string
  ) {
    return this.http.get<{ ok: boolean; data: ProductModifierGroup[] }>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/product/${productId}/modifier-groups`
    );
  }

  assignModifierGroupToProduct(
    tenantId: string,
    branchId: string,
    dto: AssignModifierGroupToProductDto
  ) {
    return this.http.post<ProductModifierGroup>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/product/${dto.productId}/modifier-group`,
      dto
    );
  }

  removeModifierGroupFromProduct(
    tenantId: string,
    branchId: string,
    productId: string,
    assignmentId: string
  ) {
    return this.http.delete(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/product/${productId}/modifier-group/${assignmentId}`
    );
  }
}
