import {
  ApplicationConfig,
  ApplicationRef,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';
import { ModuleErrorInterceptor } from './core/interceptors/module-error.interceptor';
import { ResilienceInterceptor } from './core/interceptors/resilience.interceptor';
import { AuthService } from './core/services/auth.service';
import { firstValueFrom } from 'rxjs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([
        AuthInterceptor,
        ResilienceInterceptor, // Retry automático, timeouts, rate limiting
        ModuleErrorInterceptor,
      ])
    ),
    // Kick an initial render in zoneless mode after auth is hydrated
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      const appRef = inject(ApplicationRef);
      return firstValueFrom(auth.ensureLoadMe()).finally(() => {
        // Ensure the very first render happens even without user interaction
        // and before any DOM event occurs (common gotcha in zoneless mode).
        // rAF schedules outside microtask queue, guaranteeing a paint.
        requestAnimationFrame(() => appRef.tick());
      });
    }),
  ],
};
