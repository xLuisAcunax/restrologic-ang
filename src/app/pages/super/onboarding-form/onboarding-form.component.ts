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

  form = this.fb.group({
    owner: this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', Validators.email],
      password: ['', Validators.required],
      userName: ['', Validators.required],
      address: [''],
    }),
    business: this.fb.group({
      name: ['', Validators.required],
      nit: ['', Validators.required],
      description: [''],
    }),
  });

  constructor(
    public dialogRef: DialogRef<string>, // Specify the return type when closing
    @Inject(DIALOG_DATA) public data: { algo: string }
  ) {}

  onSaving() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const currentUser = this.me();
    if (!currentUser?.id) {
      console.error('Onboarding failed: missing current session user');
      return;
    }

    const { owner, business } = this.form.getRawValue();
    const ownerGroup = owner!;
    const businessGroup = business!;

    const ownerName = `${ownerGroup.firstName} ${ownerGroup.lastName}`
      .replace(/\s+/g, ' ')
      .trim();

    const payload: BusinessOwnerOnboardingPayload = {
      createdBy: currentUser.id,
      owner: {
        firstName: ownerGroup.firstName!,
        lastName: ownerGroup.lastName!,
        email: ownerGroup.email || undefined,
        password: ownerGroup.password!,
        userName: ownerGroup.userName!,
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

    this.submitting.set(true);
    this.onboardingService.registerOwnerWithBusiness(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.dialogRef.close('Confirmed');
      },
      error: (error) => {
        this.submitting.set(false);
        console.error('Onboarding flow failed', error);
      },
    });
  }
}
