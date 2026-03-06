import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate, CanActivateChild {
  constructor(private auth: AuthService, private router: Router) {}

  private check(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    const allowed: string[] | undefined = route.data?.['roles'];

    // Si no hay roles definidos en la ruta, permitimos el acceso
    if (!allowed || allowed.length === 0) return true;

    const role = this.auth.getRole();
    if (!role) {
      return this.router.createUrlTree(['/signin'], {
        queryParams: { returnUrl: state.url },
      });
    }

    // SUPER tiene acceso a todo
    if (role.includes('Super')) return true;

    let isAllowed: boolean = false;
    role.forEach((r) => {
      if (allowed.includes(r)) {
        isAllowed = true;
      }
    });
    if (isAllowed) return true;

    // Denegado
    return this.router.createUrlTree(['/not-authorized']);
  }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    return this.check(route, state);
  }

  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ) {
    return this.check(childRoute, state);
  }
}
