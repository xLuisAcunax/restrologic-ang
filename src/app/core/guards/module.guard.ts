import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { ModuleService } from '../services/module.service';
import { ModuleAnalyticsService } from '../services/module-analytics.service';

/**
 * Guard to protect routes based on enabled modules
 *
 * Usage in routes:
 * {
 *   path: 'deliveries',
 *   component: DeliveriesComponent,
 *   canActivate: [AuthGuard, ModuleGuard],
 *   data: { requiredModule: 'deliveries' }
 * }
 */
@Injectable({ providedIn: 'root' })
export class ModuleGuard implements CanActivate, CanActivateChild {
  constructor(
    private moduleService: ModuleService,
    private router: Router,
    private analytics: ModuleAnalyticsService
  ) {}

  private check(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    const requiredModule = route.data?.['requiredModule'] as string;

    // If no module is required, allow access
    if (!requiredModule) {
      return true;
    }

    // Check if the module is enabled
    const isEnabled = this.moduleService.isModuleEnabled(requiredModule);

    if (!isEnabled) {
      // Track analytics
      this.analytics.trackAccessDenied(requiredModule, state.url);

      // Redirect to not-authorized page with module info
      return this.router.createUrlTree(['/not-authorized'], {
        queryParams: { module: requiredModule },
      });
    }

    return true;
  }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    return this.check(route, state);
  }

  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    return this.check(childRoute, state);
  }
}
