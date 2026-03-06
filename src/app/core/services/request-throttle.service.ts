import { Injectable } from '@angular/core';
import { Subject, debounceTime, throttleTime } from 'rxjs';

/**
 * Request Throttling Service - Limita frecuencia de operaciones
 *
 * Previene:
 * - Spam de clicks en botones
 * - Múltiples creaciones de órdenes simultáneas
 * - Sobrecarga del servidor con requests duplicadas
 *
 * Estrategias:
 * - Throttle: Ejecuta solo la primera request en un periodo de tiempo
 * - Debounce: Ejecuta solo la última request después de un periodo de inactividad
 */

interface ThrottleConfig {
  key: string;
  lastExecuted: number;
  delayMs: number;
}

@Injectable({
  providedIn: 'root',
})
export class RequestThrottleService {
  // Tracking de operaciones throttled
  private throttles = new Map<string, ThrottleConfig>();

  // Subjects para debouncing
  private debounceSubjects = new Map<string, Subject<any>>();

  /**
   * Throttle: Ejecuta inmediatamente la primera llamada, ignora subsecuentes dentro del periodo
   * Uso: Prevenir doble-click en botones de crear orden
   */
  throttle<T>(
    operationKey: string,
    operation: () => Promise<T> | T,
    delayMs = 2000
  ): Promise<T> | null {
    const now = Date.now();
    const config = this.throttles.get(operationKey);

    // Si no existe o ya pasó el periodo, ejecutar
    if (!config || now - config.lastExecuted >= config.delayMs) {
      this.throttles.set(operationKey, {
        key: operationKey,
        lastExecuted: now,
        delayMs,
      });

      console.log(
        `[Throttle] Executing "${operationKey}" (throttled for ${delayMs}ms)`
      );
      return Promise.resolve(operation());
    }

    // Dentro del periodo de throttle, ignorar
    const remainingMs = config.delayMs - (now - config.lastExecuted);
    console.warn(
      `[Throttle] Blocked "${operationKey}" - retry in ${Math.ceil(
        remainingMs
      )}ms`
    );
    return null;
  }

  /**
   * Debounce: Ejecuta solo la última llamada después de un periodo de inactividad
   * Uso: Búsquedas, autocompletado, validaciones mientras escribe
   */
  debounce<T>(
    operationKey: string,
    operation: (value: T) => void,
    delayMs = 300
  ): (value: T) => void {
    // Crear o reusar subject
    if (!this.debounceSubjects.has(operationKey)) {
      const subject = new Subject<T>();
      subject.pipe(debounceTime(delayMs)).subscribe((value) => {
        console.log(
          `[Debounce] Executing "${operationKey}" after ${delayMs}ms`
        );
        operation(value);
      });
      this.debounceSubjects.set(operationKey, subject);
    }

    const subject = this.debounceSubjects.get(operationKey)!;

    // Retornar función que emite al subject
    return (value: T) => {
      subject.next(value);
    };
  }

  /**
   * Verificar si una operación está en periodo de throttle
   */
  isThrottled(operationKey: string): boolean {
    const config = this.throttles.get(operationKey);
    if (!config) return false;

    const now = Date.now();
    return now - config.lastExecuted < config.delayMs;
  }

  /**
   * Obtener tiempo restante de throttle (ms)
   */
  getThrottleRemaining(operationKey: string): number {
    const config = this.throttles.get(operationKey);
    if (!config) return 0;

    const now = Date.now();
    const remaining = config.delayMs - (now - config.lastExecuted);
    return Math.max(0, remaining);
  }

  /**
   * Resetear manualmente un throttle
   */
  resetThrottle(operationKey: string): void {
    this.throttles.delete(operationKey);
  }

  /**
   * Limpiar todos los throttles (útil al logout)
   */
  clearAll(): void {
    this.throttles.clear();
    this.debounceSubjects.forEach((subject) => subject.complete());
    this.debounceSubjects.clear();
  }

  /**
   * Crear un throttle por usuario/sucursal
   * Útil para operaciones específicas de tenant/branch
   */
  createScopedKey(
    operation: string,
    tenantId?: string,
    branchId?: string
  ): string {
    const parts = [operation];
    if (tenantId) parts.push(tenantId);
    if (branchId) parts.push(branchId);
    return parts.join(':');
  }
}
