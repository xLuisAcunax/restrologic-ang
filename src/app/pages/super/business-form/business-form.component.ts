import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, Inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BusinessDetail,
  BusinessService,
  UpdateBusinessDto,
} from '../../../core/services/business.service';


@Component({
  selector: 'app-business-form',
  imports: [ReactiveFormsModule],
  templateUrl: './business-form.component.html',
})
export class BusinessFormComponent {
  me = inject(AuthService).me;
  businessService = inject(BusinessService);
  saving = signal(false);
  errorMessage = signal('');

  form = new FormBuilder().group({
    nit: ['', Validators.required],
    name: ['', Validators.required],
    description: [''],
    isActive: [true, Validators.required],
  });

  constructor(
    public dialogRef: DialogRef<string>,
    @Inject(DIALOG_DATA)
    public data: { tenantId: string; tenant: BusinessDetail }
  ) {
    if (data.tenant) {
      this.form.patchValue({
        nit: data.tenant.nit ?? '',
        name: data.tenant.name,
        description: data.tenant.description,
        isActive: data.tenant.isActive ?? true,
      });
    }
  }

  onSaving() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const updateBusinessDto: UpdateBusinessDto = {
      nit: this.form.value.nit!,
      name: this.form.value.name!,
      description: this.form.value.description || undefined,
      isActive: this.form.value.isActive! as boolean,
      modules: [],
      createdBy: this.me()?.id,
    };

    this.errorMessage.set('');
    this.saving.set(true);

    this.businessService.updateBusiness(this.data.tenantId, updateBusinessDto).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogRef.close('Confirmed');
      },
      error: (error) => {
        this.saving.set(false);
        const message =
          error?.error?.message ||
          error?.error?.title ||
          error?.message ||
          'No fue posible guardar el negocio.';
        this.errorMessage.set(message);
        console.error('Business update failed', error);
      },
    });
  }
}
