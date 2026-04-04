import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-signin-form',
  imports: [CommonModule, RouterModule, ReactiveFormsModule, FormsModule],
  templateUrl: './signin-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SigninFormComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly isSubmitting = signal(false);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }

  onSignIn() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();

    this.authService.login(email!, password!).subscribe({
      next: () => {
        console.log('Login successful - roles:', this.authService.me()?.roles);
        const user = this.authService.me();

        if (user?.isSuper) {
          this.router.navigate(['/super']);
        } else if (user?.roles?.includes('Admin')) {
          console.log('Navigating to /admin for Admin role');
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/']);
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.error.set(err.error?.error || 'Login failed. Please check your credentials.');
      },
    });
  }
}
