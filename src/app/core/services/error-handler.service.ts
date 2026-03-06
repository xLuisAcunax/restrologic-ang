import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CircuitBreakerService } from './circuit-breaker.service';
import { DataCacheService } from './data-cache.service';

/**
 * Error Handler Service - Manejo centralizado de errores con fallbacks
 *
 * Beneficios durante pruebas de estrés:
 * - UX consistente ante fallos
 * - Fallback a datos en caché cuando el servidor no responde
 * - Mensajes de error claros y accionables
 * - Integración con Circuit Breaker para degradación gradual
 */

export interface ErrorContext {
  operation: string;
  serviceName?: string;
  url?: string;
  method?: string;
  tenantId?: string;
  branchId?: string;
  fallbackData?: any;
}

export interface HandledError {
  userMessage: string;
  technicalMessage: string;
  canRetry: boolean;
  fallbackData?: any;
  errorCode?: string;
  isNetworkError: boolean;
  isTimeout: boolean;
  isServerError: boolean;
  suggestedAction?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ErrorHandlerService {
  private circuitBreaker = inject(CircuitBreakerService);
  private dataCache = inject(DataCacheService);

  /**
   * Manejar un error HTTP con fallbacks inteligentes
   */
  handleError(error: any, context: ErrorContext): HandledError {
    const httpError = error as HttpErrorResponse;

    // Registrar en circuit breaker si es un error de servicio
    if (context.serviceName && this.isServiceError(httpError)) {
      this.circuitBreaker.recordFailure(context.serviceName);
    }

    // Construir respuesta estructurada
    const handled: HandledError = {
      userMessage: this.getUserMessage(httpError, context),
      technicalMessage: this.getTechnicalMessage(httpError, context),
      canRetry: this.canRetry(httpError),
      isNetworkError: httpError.status === 0,
      isTimeout: this.isTimeoutError(httpError),
      isServerError: httpError.status >= 500,
      suggestedAction: this.getSuggestedAction(httpError, context),
    };

    // Intentar usar datos en caché como fallback
    if (context.fallbackData !== undefined) {
      handled.fallbackData = context.fallbackData;
    } else if (context.tenantId && context.branchId) {
      handled.fallbackData = this.tryGetCachedFallback(context);
    }

    // Log para debugging
    console.error('[ErrorHandler]', {
      operation: context.operation,
      status: httpError.status,
      message: httpError.message,
      handled,
    });

    return handled;
  }

  /**
   * Verificar si el servicio está disponible (usando circuit breaker)
   */
  isServiceAvailable(serviceName: string): boolean {
    return this.circuitBreaker.canExecute(serviceName);
  }

  /**
   * Registrar éxito de operación (para circuit breaker)
   */
  recordSuccess(serviceName: string): void {
    this.circuitBreaker.recordSuccess(serviceName);
  }

  /**
   * Obtener mensaje user-friendly
   */
  private getUserMessage(
    error: HttpErrorResponse,
    context: ErrorContext
  ): string {
    // Error de red / timeout
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
    }

    if (this.isTimeoutError(error)) {
      return 'La operación tardó demasiado. El servidor puede estar sobrecargado. Intenta nuevamente.';
    }

    // Rate limiting
    if (error.status === 429) {
      return 'Demasiadas solicitudes. Por favor espera unos segundos antes de intentar nuevamente.';
    }

    // Errores del servidor
    if (error.status >= 500) {
      return 'El servidor está experimentando problemas. Estamos trabajando para resolverlo.';
    }

    // Errores del cliente
    if (error.status === 400) {
      return error.error?.message || 'Los datos enviados son inválidos.';
    }

    if (error.status === 401) {
      return 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.';
    }

    if (error.status === 403) {
      return 'No tienes permisos para realizar esta operación.';
    }

    if (error.status === 404) {
      return 'El recurso solicitado no fue encontrado.';
    }

    if (error.status === 409) {
      return (
        error.error?.message ||
        'Conflicto: el recurso ya existe o está siendo modificado.'
      );
    }

    // Mensaje del backend si está disponible
    if (error.error?.message) {
      return error.error.message;
    }

    return `Error al realizar ${context.operation}. Código: ${error.status}`;
  }

  /**
   * Obtener mensaje técnico para logs
   */
  private getTechnicalMessage(
    error: HttpErrorResponse,
    context: ErrorContext
  ): string {
    return `[${context.operation}] ${error.status} ${error.statusText} - ${error.message}`;
  }

  /**
   * Determinar si se puede reintentar
   */
  private canRetry(error: HttpErrorResponse): boolean {
    // Reintentar timeouts y errores de servidor
    if (this.isTimeoutError(error) || error.status >= 500) {
      return true;
    }

    // Reintentar rate limiting después de esperar
    if (error.status === 429) {
      return true;
    }

    // Reintentar errores de red
    if (error.status === 0) {
      return true;
    }

    // No reintentar errores del cliente (4xx)
    return false;
  }

  /**
   * Sugerir acción al usuario
   */
  private getSuggestedAction(
    error: HttpErrorResponse,
    context: ErrorContext
  ): string | undefined {
    if (error.status === 0) {
      return 'Verifica tu conexión a internet e intenta nuevamente.';
    }

    if (this.isTimeoutError(error)) {
      return 'Intenta nuevamente. Si el problema persiste, contacta a soporte.';
    }

    if (error.status === 429) {
      const retryAfter = error.headers.get('Retry-After');
      return retryAfter
        ? `Espera ${retryAfter} segundos antes de reintentar.`
        : 'Espera unos segundos antes de reintentar.';
    }

    if (error.status === 401) {
      return 'Inicia sesión nuevamente para continuar.';
    }

    if (error.status >= 500) {
      return 'Estamos trabajando en resolver el problema. Intenta nuevamente en unos minutos.';
    }

    return undefined;
  }

  /**
   * Verificar si es un error de servicio (para circuit breaker)
   */
  private isServiceError(error: HttpErrorResponse): boolean {
    // Errores del servidor, timeouts y errores de red
    return (
      error.status >= 500 || error.status === 0 || this.isTimeoutError(error)
    );
  }

  /**
   * Intentar obtener datos del caché como fallback
   */
  private tryGetCachedFallback(context: ErrorContext): any {
    if (!context.tenantId || !context.branchId) return undefined;

    try {
      if (context.operation.includes('table')) {
        return this.dataCache.getTables(context.tenantId, context.branchId);
      }
    } catch (e) {
      console.warn('[ErrorHandler] Could not retrieve cached fallback:', e);
    }

    return undefined;
  }

  /**
   * Crear mensaje de toast user-friendly
   */
  createToastMessage(handled: HandledError): {
    type: 'error' | 'warning' | 'info';
    message: string;
  } {
    let type: 'error' | 'warning' | 'info' = 'error';

    // Si tenemos fallback data, es solo un warning
    if (handled.fallbackData !== undefined) {
      type = 'warning';
    }

    // Rate limiting es info, no error crítico
    if (handled.userMessage.includes('Demasiadas solicitudes')) {
      type = 'info';
    }

    return {
      type,
      message:
        handled.userMessage +
        (handled.suggestedAction ? ` ${handled.suggestedAction}` : ''),
    };
  }

  /**
   * Verificar si es un error de timeout
   */
  private isTimeoutError(error: HttpErrorResponse): boolean {
    return (
      (error as any).name === 'TimeoutError' ||
      error.message?.includes('timeout')
    );
  }
}
