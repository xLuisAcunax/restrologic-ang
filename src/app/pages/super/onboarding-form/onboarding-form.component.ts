import { Component, inject, Inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BusinessOwnerOnboardingPayload,
  OnboardingService,
} from '../../../core/services/onboarding.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-onboarding-form',
  imports: [ReactiveFormsModule],
  templateUrl: './onboarding-form.component.html',
})
export class OnboardingFormComponent {
  onboardingService = inject(OnboardingService);
  me = inject(AuthService).me;
  private fb = inject(FormBuilder);
  submitting = signal(false);
  errorMessage = signal('');

  form = this.fb.group({
    owner: this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      userName: [''],
      address: [''],
      documentId: [''],
      phoneNumber: [''],
    }),
    business: this.fb.group({
      name: ['', Validators.required],
      nit: ['', Validators.required],
      description: [''],
    }),
  });

  constructor(
    public dialogRef: DialogRef<string>,
    @Inject(DIALOG_DATA) public data: { algo: string }
  ) {}

  onSaving() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const currentUser = this.me();
    if (!currentUser?.id) {
      this.errorMessage.set('No se encontró la sesión actual.');
      return;
    }

    const { owner, business } = this.form.getRawValue();
    const ownerGroup = owner!;
    const businessGroup = business!;

    const payload: BusinessOwnerOnboardingPayload = {
      createdBy: currentUser.id,
      owner: {
        firstName: ownerGroup.firstName!,
        lastName: ownerGroup.lastName!,
        email: ownerGroup.email!,
        password: ownerGroup.password!,
        userName: ownerGroup.userName || undefined,
        role: 'Admin',
        isActive: true,
      },
      business: {
        name: businessGroup.name!,
        nit: businessGroup.nit!,
        description: businessGroup.description || undefined,
        modules: [],
        isActive: true,
      },
    };

    this.errorMessage.set('');
    this.submitting.set(true);
    this.onboardingService.registerOwnerWithBusiness(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.dialogRef.close('Confirmed');
      },
      error: (error) => {
        this.submitting.set(false);
        const message = error?.error?.message || error?.message || 'No fue posible crear el negocio.';
        this.errorMessage.set(message);
        console.error('Onboarding flow failed', error);
      },
    });
  }
}
