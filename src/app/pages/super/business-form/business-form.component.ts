import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, Inject, Signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BusinessDetail,
  BusinessService,
  UpdateBusinessDto,
} from '../../../core/services/business.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-business-form',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './business-form.component.html',
})
export class BusinessFormComponent {
  me = inject(AuthService).me;
  businessService = inject(BusinessService);

  form = new FormBuilder().group({
    nit: ['', Validators.required],
    name: ['', Validators.required],
    description: [''],
    isActive: [true, Validators.required],
  });

  constructor(
    public dialogRef: DialogRef<string>, // Specify the return type when closing
    @Inject(DIALOG_DATA)
    public data: { tenantId: string; tenant: BusinessDetail } // Adjust the type as needed
  ) {
    if (data.tenant) {
      this.form.patchValue({
        nit: data.tenant.nit,
        name: data.tenant.name,
        description: data.tenant.description,
        isActive: data.tenant.isActive,
      });
    }
  }

  onSaving() {
    if (this.form.valid) {
      const updateBusinessDto: UpdateBusinessDto = {
        nit: this.form.value.nit!,
        name: this.form.value.name!,
        description: this.form.value.description!,
        isActive: this.form.value.isActive! as boolean,
        modules: [], // Modules are not updated here
        createdBy: this.me()?.id,
      };
      this.businessService
        .updateBusiness(this.data.tenantId, updateBusinessDto)
        .subscribe((resp) => {
          console.log('Onboarding successful:', JSON.stringify(resp));
          this.dialogRef.close('Confirmed'); // Return 'Confirmed' on success
        });
    }
  }
}
