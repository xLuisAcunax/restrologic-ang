import { inject, Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HomeRedirectGuard implements CanActivate {
  private auth = inject(AuthService);
  private router = inject(Router);

  canActivate(): Observable<boolean> {
    // ensureLoadMe se encargará de cargar _me si hace falta
    return this.auth.ensureLoadMe().pipe(
      map((ok) => {
        if (!ok) {
          // no pudimos hidratar -> enviar a signin
          this.router.navigate(['/signin']);
          return false;
        }

        const role = this.auth.getRole();
        if (!role) {
          // fallback
          this.router.navigate(['/signin']);
          return false;
        }

        if (role.includes('Super')) this.router.navigate(['/super']);
        else if (role.includes('Admin')) this.router.navigate(['/admin']);
        else if (role.includes('Repartidor')) this.router.navigate(['/delivery']);
        else this.router.navigate(['/user']);

        return false;
      })
    );
  }
}

