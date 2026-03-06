// src/app/core/guards/auth.guard.ts
import { inject, Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Observable, of } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private router = inject(Router);
  private auth = inject(AuthService);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> | boolean | UrlTree {
    const token = this.auth.token;
    // No token -> redirigir a signin (síncrono, no instancia componentes)
    if (!token) {
      console.log('AuthGuard: No token, redirecting to signin');
      this.router.navigate(['/signin'], {
        queryParams: { returnUrl: state.url },
      });
      return false;
    }

    return this.auth.ensureLoadMe().pipe(
      map((ok) => {
        if (ok) return true;
        // If ensureLoadMe() failed (401 or token expired), redirect to signin
        console.log('AuthGuard: ensureLoadMe failed, redirecting to signin');
        this.router.navigate(['/signin'], {
          queryParams: { returnUrl: state.url },
        });
        return false;
      }),
      catchError(() => {
        // Handle any unexpected errors in ensureLoadMe
        console.log('AuthGuard: Error in ensureLoadMe, redirecting to signin');
        this.router.navigate(['/signin'], {
          queryParams: { returnUrl: state.url },
        });
        return of(false);
      })
    );
  }
}
