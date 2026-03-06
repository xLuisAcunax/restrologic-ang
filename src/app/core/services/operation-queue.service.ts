import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Operation Queue Service - Cola de operaciones críticas
 *
 * Garantiza que operaciones importantes no se pierdan durante:
 * - Pérdida temporal de conexión
 * - Sobrecarga del servidor
 * - Rate limiting
 *
 * Operaciones soportadas:
 * - Crear orden
 * - Registrar pago
 * - Actualizar estado de orden
 * - Registrar movimiento de caja
 */

export interface QueuedOperation {
  id: string;
  type: 'create_order' | 'register_payment' | 'update_order' | 'cash_movement';
  payload: any;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  lastAttemptAt: number | null;
  error?: string;
  status: 'pending' | 'processing' | 'failed' | 'completed';
}

@Injectable({
  providedIn: 'root',
})
export class OperationQueueService {
  private readonly STORAGE_KEY = 'rl_operation_queue';
  private readonly MAX_QUEUE_SIZE = 100;

  private queue$ = new BehaviorSubject<QueuedOperation[]>([]);
  private processing = false;

  constructor() {
    this.loadQueue();
  }

  /**
   * Observable del estado de la cola
   */
  getQueue(): Observable<QueuedOperation[]> {
    return this.queue$.asObservable();
  }

  /**
   * Encolar una operación crítica
   */
  enqueue(
    type: QueuedOperation['type'],
    payload: any,
    maxAttempts = 5
  ): string {
    const operation: QueuedOperation = {
      id: this.generateId(),
      type,
      payload,
      attempts: 0,
      maxAttempts,
      createdAt: Date.now(),
      lastAttemptAt: null,
      status: 'pending',
    };

    const queue = this.queue$.value;

    // Verificar límite de cola
    if (queue.length >= this.MAX_QUEUE_SIZE) {
      console.warn(
        '[OperationQueue] Queue is full, removing oldest completed/failed'
      );
      this.pruneQueue();
    }

    queue.push(operation);
    this.queue$.next(queue);
    this.saveQueue();

    console.log(`[OperationQueue] Enqueued ${type}:${operation.id}`);

    // Procesar inmediatamente si no está procesando
    if (!this.processing) {
      this.processQueue();
    }

    return operation.id;
  }

  /**
   * Procesar la cola de operaciones
   */
  async processQueue(): Promise<void> {
    if (this.processing) return;

    this.processing = true;
    const queue = this.queue$.value;

    for (const operation of queue) {
      // Solo procesar pendientes
      if (operation.status !== 'pending') continue;

      // Verificar si ya alcanzó máximo de intentos
      if (operation.attempts >= operation.maxAttempts) {
        operation.status = 'failed';
        operation.error = 'Máximo de intentos alcanzado';
        this.saveQueue();
        continue;
      }

      try {
        operation.status = 'processing';
        operation.attempts++;
        operation.lastAttemptAt = Date.now();
        this.queue$.next([...queue]);

        console.log(
          `[OperationQueue] Processing ${operation.type}:${operation.id} (attempt ${operation.attempts}/${operation.maxAttempts})`
        );

        // Aquí se ejecutaría la operación real
        // Por ahora, solo simulamos el procesamiento
        await this.executeOperation(operation);

        operation.status = 'completed';
        console.log(
          `[OperationQueue] Completed ${operation.type}:${operation.id}`
        );
      } catch (error: any) {
        console.error(
          `[OperationQueue] Failed ${operation.type}:${operation.id}`,
          error
        );
        operation.error = error.message || 'Error desconocido';

        // Si no es el último intento, volver a pending para retry
        if (operation.attempts < operation.maxAttempts) {
          operation.status = 'pending';
        } else {
          operation.status = 'failed';
        }
      }

      this.queue$.next([...queue]);
      this.saveQueue();
    }

    this.processing = false;
  }

  /**
   * Reintentar operaciones fallidas manualmente
   */
  retryFailed(): void {
    const queue = this.queue$.value;
    queue.forEach((op) => {
      if (op.status === 'failed') {
        op.status = 'pending';
        op.attempts = 0;
        op.error = undefined;
      }
    });
    this.queue$.next([...queue]);
    this.saveQueue();
    this.processQueue();
  }

  /**
   * Reintentar operación específica
   */
  retryOperation(operationId: string): void {
    const queue = this.queue$.value;
    const operation = queue.find((op) => op.id === operationId);

    if (operation && operation.status === 'failed') {
      operation.status = 'pending';
      operation.attempts = 0;
      operation.error = undefined;
      this.queue$.next([...queue]);
      this.saveQueue();
      this.processQueue();
    }
  }

  /**
   * Eliminar operación de la cola
   */
  removeOperation(operationId: string): void {
    const queue = this.queue$.value.filter((op) => op.id !== operationId);
    this.queue$.next(queue);
    this.saveQueue();
  }

  /**
   * Limpiar operaciones completadas
   */
  clearCompleted(): void {
    const queue = this.queue$.value.filter((op) => op.status !== 'completed');
    this.queue$.next(queue);
    this.saveQueue();
  }

  /**
   * Obtener estadísticas de la cola
   */
  getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const queue = this.queue$.value;
    return {
      total: queue.length,
      pending: queue.filter((op) => op.status === 'pending').length,
      processing: queue.filter((op) => op.status === 'processing').length,
      completed: queue.filter((op) => op.status === 'completed').length,
      failed: queue.filter((op) => op.status === 'failed').length,
    };
  }

  // ===== Métodos privados =====

  /**
   * Ejecutar la operación (placeholder - implementar según tipo)
   */
  private async executeOperation(operation: QueuedOperation): Promise<void> {
    // TODO: Implementar ejecución real según tipo de operación
    // Por ahora solo simulamos un delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simular fallo aleatorio para testing (remover en producción)
    if (Math.random() < 0.2) {
      throw new Error('Simulated random failure');
    }
  }

  /**
   * Generar ID único
   */
  private generateId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cargar cola desde localStorage
   */
  private loadQueue(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const queue = JSON.parse(stored) as QueuedOperation[];
        // Resetear operaciones que estaban en "processing"
        queue.forEach((op) => {
          if (op.status === 'processing') {
            op.status = 'pending';
          }
        });
        this.queue$.next(queue);
        console.log(
          `[OperationQueue] Loaded ${queue.length} operations from storage`
        );

        // Procesar si hay pendientes
        if (queue.some((op) => op.status === 'pending')) {
          this.processQueue();
        }
      }
    } catch (error) {
      console.error('[OperationQueue] Error loading queue:', error);
    }
  }

  /**
   * Guardar cola en localStorage
   */
  private saveQueue(): void {
    try {
      const queue = this.queue$.value;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('[OperationQueue] Error saving queue:', error);
    }
  }

  /**
   * Limpiar operaciones antiguas para no saturar la cola
   */
  private pruneQueue(): void {
    const queue = this.queue$.value;
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // Remover completadas/fallidas más antiguas de 1 día
    const pruned = queue.filter((op) => {
      if (op.status === 'pending' || op.status === 'processing') {
        return true; // Mantener pendientes y en proceso
      }
      return now - op.createdAt < ONE_DAY; // Mantener recientes
    });

    this.queue$.next(pruned);
    this.saveQueue();
  }
}
