import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/**
 * Interceptor to handle module-related 403 errors
 * Redirects to appropriate upgrade prompt when a module is not enabled
 */
export const ModuleErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Handle 403 errors related to modules
      if (error.status === 403) {
        const message = error.error?.message || '';

        // Check if error is module-related
        if (
          message.toLowerCase().includes('module') ||
          message.toLowerCase().includes('módulo') ||
          error.error?.moduleKey
        ) {
          const moduleKey = extractModuleKey(message, error.error?.moduleKey);

          console.warn('🔒 Module access denied:', {
            module: moduleKey,
            message: message,
            url: req.url,
          });

          // Redirect to not-authorized with module info
          if (moduleKey) {
            router.navigate(['/not-authorized'], {
              queryParams: { module: moduleKey },
            });
          }
        }
      }

      return throwError(() => error);
    })
  );
};

/**
 * Extract module key from error message or response
 */
function extractModuleKey(message: string, moduleKey?: string): string {
  if (moduleKey) return moduleKey;

  // Try to extract from message: "Module 'deliveries' is not enabled"
  const match =
    message.match(/module\s+'([^']+)'/i) ||
    message.match(/módulo\s+'([^']+)'/i);

  return match ? match[1] : '';
}
