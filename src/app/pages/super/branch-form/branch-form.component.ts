import { CommonModule } from '@angular/common';
import { Component, Inject, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import {
  BranchSummary,
  BusinessService,
  CreateBranchDto,
  UpdateBranchDto,
} from '../../../core/services/business.service';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { GeocodingService } from '../../../shared/services/geocoding.service';

@Component({
  selector: 'app-branch-form',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './branch-form.component.html',
})
export class BranchFormComponent {
  me = inject(AuthService).me;
  businessService = inject(BusinessService);
  geocoder = inject(GeocodingService);

  form = new FormBuilder().group({
    name: ['', Validators.required],
    address: [''],
    city: [''],
    country: ['Colombia'],
    description: [''],
    isActive: [true],
  });

  constructor(
    public dialogRef: DialogRef<string>,
    @Inject(DIALOG_DATA)
    public data: {
      tenantId: string;
      branchId: string;
      branch?: BranchSummary;
    }
  ) {
    if (data.tenantId && data.branch) {
      this.form.patchValue({
        name: data.branch.name,
        description: data.branch.description,
        address: data.branch.address,
        city: data.branch.city,
        country: data.branch.country ?? 'Colombia',
        isActive: data.branch.isActive,
      });
    }
  }

  private async buildCoordinates() {
    const address = this.form.value.address?.trim();
    const city = this.form.value.city?.trim();
    if (!address) {
      return { latitude: null, longitude: null };
    }

    const coords = await this.geocoder.geocodeAddress(address, city || undefined);
    return {
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
    };
  }

  async onSaving() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const coordinates = await this.buildCoordinates();

    if (this.data.branchId) {
      const updateBranchDto: UpdateBranchDto = {
        name: this.form.value.name!,
        address: this.form.value.address,
        city: this.form.value.city,
        country: this.form.value.country,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        description: this.form.value.description,
        isActive: this.form.value.isActive ?? true,
      };

      this.businessService
        .updateBranch(this.data.branchId, updateBranchDto)
        .subscribe((resp) => {
          console.log('branch updated successful:', JSON.stringify(resp));
          this.dialogRef.close('Confirmed');
        });

      return;
    }

    if (this.data.tenantId) {
      const createBranchDto: CreateBranchDto = {
        name: this.form.value.name!,
        address: this.form.value.address,
        city: this.form.value.city,
        country: this.form.value.country,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        description: this.form.value.description,
        isActive: this.form.value.isActive ?? true,
      };

      this.businessService
        .createBranch(this.data.tenantId, createBranchDto)
        .subscribe((resp) => {
          console.log('branch created successful:', JSON.stringify(resp));
          this.dialogRef.close('Confirmed');
        });
    }
  }
}
