import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError, timer, retry, timeout, catchError } from 'rxjs';

/**
 * Resilience Interceptor - Prepara la app para condiciones de estrés
 *
 * Features:
 * - Timeouts configurables por endpoint
 * - Retry automático con backoff exponencial
 * - Manejo de rate limiting (429)
 * - Manejo de circuit breaker
 */

// Configuración de timeouts por tipo de operación
const TIMEOUT_CONFIG = {
  default: 30000, // 30 segundos por defecto
  read: 15000, // 15 segundos para lecturas (GET)
  write: 45000, // 45 segundos para escrituras (POST, PUT, PATCH)
  delete: 20000, // 20 segundos para deletes
};

// Endpoints que NO deben reintentar (operaciones no idempotentes sin garantía)
const NO_RETRY_PATTERNS = [
  '/payment', // No reintentar pagos automáticamente
  '/invoice/generate', // No regenerar facturas
];

// Configuración de reintentos
const RETRY_CONFIG = {
  maxRetries: 3,
  retryableStatuses: [408, 429, 500, 502, 503, 504], // Request Timeout, Too Many Requests, Server Errors
  excludeStatuses: [400, 401, 403, 404, 409], // Bad Request, Unauthorized, Forbidden, Not Found, Conflict
};

export const ResilienceInterceptor: HttpInterceptorFn = (req, next) => {
  // Determinar timeout según método HTTP
  let requestTimeout = TIMEOUT_CONFIG.default;
  switch (req.method.toUpperCase()) {
    case 'GET':
      requestTimeout = TIMEOUT_CONFIG.read;
      break;
    case 'POST':
    case 'PUT':
    case 'PATCH':
      requestTimeout = TIMEOUT_CONFIG.write;
      break;
    case 'DELETE':
      requestTimeout = TIMEOUT_CONFIG.delete;
      break;
  }

  // Verificar si el endpoint no debe reintentar
  const shouldNotRetry = NO_RETRY_PATTERNS.some((pattern) =>
    req.url.includes(pattern)
  );

  // Si tiene header custom de timeout, usarlo
  const customTimeout = req.headers.get('X-Timeout');
  if (customTimeout) {
    requestTimeout = parseInt(customTimeout, 10);
    req = req.clone({ headers: req.headers.delete('X-Timeout') });
  }

  return next(req).pipe(
    // Aplicar timeout
    timeout(requestTimeout),

    // Retry con backoff exponencial (solo para operaciones seguras)
    retry({
      count: shouldNotRetry ? 0 : RETRY_CONFIG.maxRetries,
      delay: (error: HttpErrorResponse, retryCount) => {
        // No reintentar errores del cliente (4xx excepto 408, 429)
        if (
          error.status >= 400 &&
          error.status < 500 &&
          !RETRY_CONFIG.retryableStatuses.includes(error.status)
        ) {
          throw error;
        }

        // Manejo especial de rate limiting (429)
        if (error.status === 429) {
          const retryAfter = error.headers.get('Retry-After');
          const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
          console.warn(
            `[Resilience] Rate limited (429). Retrying after ${delayMs}ms`
          );
          return timer(delayMs);
        }

        // Backoff exponencial: 1s, 2s, 4s, 8s...
        const exponentialDelay = Math.pow(2, retryCount - 1) * 1000;
        // Agregar jitter aleatorio (±20%) para evitar thundering herd
        const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
        const finalDelay = Math.min(exponentialDelay + jitter, 10000); // Max 10 segundos

        console.warn(
          `[Resilience] Retry ${retryCount}/${RETRY_CONFIG.maxRetries} for ${
            req.method
          } ${req.url} after ${Math.round(finalDelay)}ms. Error: ${
            error.status
          }`
        );

        return timer(finalDelay);
      },
    }),

    // Manejo final de errores
    catchError((error: HttpErrorResponse) => {
      // Log estructurado para debugging
      console.error('[Resilience] Request failed:', {
        url: req.url,
        method: req.method,
        status: error.status,
        message: error.message,
        requestId: req.headers.get('X-Request-Id'),
      });

      // Enriquecer el error con información útil
      const enrichedError = {
        ...error,
        isTimeout:
          (error as any).name === 'TimeoutError' ||
          error.message?.includes('timeout'),
        isNetworkError: error.status === 0,
        isServerError: error.status >= 500,
        isClientError: error.status >= 400 && error.status < 500,
        requestUrl: req.url,
        requestMethod: req.method,
      };

      return throwError(() => enrichedError);
    })
  );
};
