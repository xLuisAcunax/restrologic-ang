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

@Component({
  selector: 'branch-form',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './branch-form.component.html',
})
export class BranchFormComponent implements OnInit {
  branch = signal<BranchSummary | null>(null);
  me = inject(AuthService).me;
  tenantService = inject(BusinessService);

  form = new FormBuilder().group({
    name: ['', Validators.required],
    address: [''],
    description: [''],
    isActive: [true], // Active by default
  });

  constructor(
    public dialogRef: DialogRef<string>,
    @Inject(DIALOG_DATA) public data: { branch: any }
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.form.patchValue({
      name: this.data.branch.name,
      address: this.data.branch.address,
      description: this.data.branch.description,
      isActive: this.data.branch.isActive,
    });
  }

  onSaving() {
    if (this.form.valid) {
      const updateBranchDto: UpdateBranchDto = {
        name: this.form.value.name!,
        address: this.form.value.address,
        description: this.form.value.description,
      };
      this.tenantService
        .updateBranch(this.data.branch.id, updateBranchDto)
        .subscribe((resp) => {
          console.log('branch updated successful:', JSON.stringify(resp));
          this.dialogRef.close('Confirmed'); // Return 'Confirmed' on success
        });
    }
  }
}
