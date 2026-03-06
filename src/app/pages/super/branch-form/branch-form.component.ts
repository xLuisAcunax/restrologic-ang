import { CommonModule } from '@angular/common';
import { Component, Inject, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import {
  BranchSummary,
  BusinessService,
  UpdateBranchDto,
} from '../../../core/services/business.service';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

@Component({
  selector: 'app-branch-form',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './branch-form.component.html',
})
export class BranchFormComponent {
  me = inject(AuthService).me;
  businessService = inject(BusinessService);

  form = new FormBuilder().group({
    name: ['', Validators.required],
    address: [''],
    description: [''],
    isActive: [true], // Active by default
  });

  constructor(
    public dialogRef: DialogRef<string>, // Specify the return type when closing
    @Inject(DIALOG_DATA)
    public data: {
      tenantId: string;
      branchId: string;
      branch?: BranchSummary;
    } // Adjust the type as needed
  ) {
    if (data.tenantId && data.branch) {
      this.form.patchValue({
        name: data.branch.name,
        description: data.branch.description,
        address: data.branch.address,
        isActive: data.branch.isActive,
      });
    }
  }

  onSaving() {
    if (this.form.valid && this.data.branchId) {
      const updateBranchDto: UpdateBranchDto = {
        name: this.form.value.name!,
        address: this.form.value.address,
        description: this.form.value.description,
      };

      this.businessService
        .updateBranch(this.data.branchId, updateBranchDto)
        .subscribe((resp) => {
          console.log('branch updated successful:', JSON.stringify(resp));
          this.dialogRef.close('Confirmed'); // Return 'Confirmed' on success
        });
    }
    if (this.form.valid && this.data.tenantId && !this.data.branchId) {
      const updateBranchDto: UpdateBranchDto = {
        name: this.form.value.name!,
        address: this.form.value.address,
        description: this.form.value.description,
      };

      this.businessService
        .createBranch(this.data.tenantId, updateBranchDto)
        .subscribe((resp) => {
          console.log('branch created successful:', JSON.stringify(resp));
          this.dialogRef.close('Confirmed'); // Return 'Confirmed' on success
        });
    }
  }
}
