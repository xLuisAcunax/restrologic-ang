import { Component } from '@angular/core';
import { SigninFormComponent } from '../../../shared/components/auth/signin-form/signin-form.component';
import { AuthPageLayoutComponent } from '../../../shared/layouts/auth-page-layout/auth-page-layout.component';

@Component({
  selector: 'sign-in',
  imports: [SigninFormComponent, AuthPageLayoutComponent],
  templateUrl: './sign-in.component.html',
})
export class SignInComponent {}
