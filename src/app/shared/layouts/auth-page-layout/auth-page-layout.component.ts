import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-auth-page-layout',
  imports: [RouterModule],
  templateUrl: './auth-page-layout.component.html',
})
export class AuthPageLayoutComponent {
  currentYear = new Date().getFullYear();
}
