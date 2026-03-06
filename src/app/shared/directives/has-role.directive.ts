import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  inject,
} from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

/**
 * Structural directive to conditionally render content based on user role
 * @example
 * <button *hasRole="'Admin'">Admin Only</button>
 * <div *hasRole="['Admin', 'DRIVER']">Admin or Driver</div>
 */
@Directive({
  selector: '[hasRole]',
  standalone: true,
})
export class HasRoleDirective {
  private auth = inject(AuthService);
  private templateRef = inject(TemplateRef<any>);
  private viewContainer = inject(ViewContainerRef);

  @Input() set hasRole(requiredRole: string | string[]) {
    const userRoles = this.auth.getRole() ?? [];
    const required = Array.isArray(requiredRole)
      ? requiredRole
      : [requiredRole];

    // SUPER always has access
    const hasAccess =
      userRoles.includes('Super') ||
      userRoles.some((role) => required.includes(role));

    if (hasAccess) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.clear();
    }
  }
}
