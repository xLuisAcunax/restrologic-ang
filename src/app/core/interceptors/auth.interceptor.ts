// src/app/core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const AuthInterceptor: HttpInterceptorFn = (req, next) => {
  // Get token from storage
  const token = localStorage.getItem('token');

  // Prefer already provided request id
  const existingRequestId = req.headers.get('X-Request-Id');
  const generatedRequestId =
    existingRequestId ??
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as any).randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  // attach or preserve X-Request-Id
  let headers = req.headers.set('X-Request-Id', generatedRequestId);

  const apiBaseSource = environment.apiBaseUrl ?? '';
  const apiBase = apiBaseSource.endsWith('/')
    ? apiBaseSource.slice(0, -1)
    : apiBaseSource;
  const requestUrl = req.url.endsWith('/') ? req.url.slice(0, -1) : req.url;

  const matchesConfiguredBase =
    apiBase.length > 0 && requestUrl.startsWith(apiBase);
  const isApiRequest = requestUrl.startsWith('/api') || matchesConfiguredBase;

  // Authorization only for API calls
  if (token && isApiRequest) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  const cloned = req.clone({ headers });
  return next(cloned);
};
