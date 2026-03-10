import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, Inject, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
import {
  BranchSummary,
  BusinessService,
  UpdateBranchDto,
} from '../../../../core/services/business.service';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { GeocodingService } from '../../../../shared/services/geocoding.service';

@Component({
  selector: 'branch-form',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './branch-form.component.html',
})
export class BranchFormComponent implements OnInit {
  branch = signal<BranchSummary | null>(null);
  me = inject(AuthService).me;
  tenantService = inject(BusinessService);
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
    @Inject(DIALOG_DATA) public data: { branch: BranchSummary }
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.form.patchValue({
      name: this.data.branch.name,
      address: this.data.branch.address,
      city: this.data.branch.city,
      country: this.data.branch.country ?? 'Colombia',
      description: this.data.branch.description,
      isActive: this.data.branch.isActive,
    });
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
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    const coordinates = await this.buildCoordinates();
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

    this.tenantService
      .updateBranch(this.data.branch.id, updateBranchDto)
      .subscribe((resp) => {
        console.log('branch updated successful:', JSON.stringify(resp));
        this.dialogRef.close('Confirmed');
      });
  }
}
