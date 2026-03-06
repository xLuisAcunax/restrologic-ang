import { Injectable } from '@angular/core';

/**
 * Circuit Breaker Pattern - Protege contra cascadas de fallos
 *
 * Estados:
 * - CLOSED: Funcionamiento normal, todas las requests pasan
 * - OPEN: Servicio detectado como caído, rechaza requests inmediatamente
 * - HALF_OPEN: Probando si el servicio se recuperó
 *
 * Beneficios durante pruebas de estrés:
 * - Evita saturar servicios ya sobrecargados
 * - Reduce latencia al fallar rápido
 * - Permite recuperación gradual
 */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  state: CircuitState;
}

interface CircuitConfig {
  failureThreshold: number; // Número de fallos para abrir el circuito
  successThreshold: number; // Éxitos necesarios en HALF_OPEN para cerrar
  timeout: number; // Tiempo en OPEN antes de intentar HALF_OPEN (ms)
}

@Injectable({
  providedIn: 'root',
})
export class CircuitBreakerService {
  private circuits = new Map<string, CircuitStats>();

  // Configuración por defecto
  private defaultConfig: CircuitConfig = {
    failureThreshold: 5, // 5 fallos consecutivos
    successThreshold: 2, // 2 éxitos para recuperar
    timeout: 30000, // 30 segundos en estado OPEN
  };

  // Configuraciones personalizadas por servicio
  private configs = new Map<string, CircuitConfig>();

  /**
   * Verificar si una operación puede ejecutarse
   */
  canExecute(serviceName: string): boolean {
    const circuit = this.getOrCreateCircuit(serviceName);
    const config = this.getConfig(serviceName);

    switch (circuit.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Verificar si es momento de intentar recuperación
        const now = Date.now();
        const timeSinceLastFailure = circuit.lastFailureTime
          ? now - circuit.lastFailureTime
          : Infinity;

        if (timeSinceLastFailure >= config.timeout) {
          // Transición a HALF_OPEN para probar
          this.transitionToHalfOpen(serviceName);
          return true;
        }
        return false;

      case 'HALF_OPEN':
        // Permitir algunas requests para probar
        return true;

      default:
        return true;
    }
  }

  /**
   * Registrar una ejecución exitosa
   */
  recordSuccess(serviceName: string): void {
    const circuit = this.getOrCreateCircuit(serviceName);
    const config = this.getConfig(serviceName);

    circuit.successes++;
    circuit.failures = 0; // Reset failures en éxito

    if (circuit.state === 'HALF_OPEN') {
      // Si logramos suficientes éxitos en HALF_OPEN, cerrar circuito
      if (circuit.successes >= config.successThreshold) {
        this.transitionToClosed(serviceName);
      }
    }

    this.circuits.set(serviceName, circuit);
  }

  /**
   * Registrar una ejecución fallida
   */
  recordFailure(serviceName: string): void {
    const circuit = this.getOrCreateCircuit(serviceName);
    const config = this.getConfig(serviceName);

    circuit.failures++;
    circuit.successes = 0; // Reset successes en fallo
    circuit.lastFailureTime = Date.now();

    // Si alcanzamos el umbral de fallos, abrir el circuito
    if (circuit.failures >= config.failureThreshold) {
      this.transitionToOpen(serviceName);
    }

    // Si estamos en HALF_OPEN y falla, volver a OPEN
    if (circuit.state === 'HALF_OPEN') {
      this.transitionToOpen(serviceName);
    }

    this.circuits.set(serviceName, circuit);
  }

  /**
   * Obtener estado actual de un circuito
   */
  getState(serviceName: string): CircuitState {
    return this.getOrCreateCircuit(serviceName).state;
  }

  /**
   * Obtener estadísticas de un circuito
   */
  getStats(serviceName: string): CircuitStats {
    return { ...this.getOrCreateCircuit(serviceName) };
  }

  /**
   * Configurar parámetros para un servicio específico
   */
  configure(serviceName: string, config: Partial<CircuitConfig>): void {
    const existingConfig = this.getConfig(serviceName);
    this.configs.set(serviceName, { ...existingConfig, ...config });
  }

  /**
   * Resetear manualmente un circuito
   */
  reset(serviceName: string): void {
    this.circuits.set(serviceName, {
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      state: 'CLOSED',
    });
  }

  /**
   * Obtener todos los circuitos abiertos (para diagnóstico)
   */
  getOpenCircuits(): string[] {
    const open: string[] = [];
    this.circuits.forEach((stats, name) => {
      if (stats.state === 'OPEN') {
        open.push(name);
      }
    });
    return open;
  }

  // ===== Métodos privados =====

  private getOrCreateCircuit(serviceName: string): CircuitStats {
    if (!this.circuits.has(serviceName)) {
      this.circuits.set(serviceName, {
        failures: 0,
        successes: 0,
        lastFailureTime: null,
        state: 'CLOSED',
      });
    }
    return this.circuits.get(serviceName)!;
  }

  private getConfig(serviceName: string): CircuitConfig {
    return this.configs.get(serviceName) || this.defaultConfig;
  }

  private transitionToOpen(serviceName: string): void {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) return;

    circuit.state = 'OPEN';
    console.warn(
      `[CircuitBreaker] Circuit OPENED for "${serviceName}" after ${circuit.failures} failures`
    );
  }

  private transitionToHalfOpen(serviceName: string): void {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) return;

    circuit.state = 'HALF_OPEN';
    circuit.successes = 0;
    circuit.failures = 0;
    console.info(
      `[CircuitBreaker] Circuit transitioned to HALF_OPEN for "${serviceName}"`
    );
  }

  private transitionToClosed(serviceName: string): void {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) return;

    circuit.state = 'CLOSED';
    circuit.failures = 0;
    circuit.successes = 0;
    circuit.lastFailureTime = null;
    console.info(
      `[CircuitBreaker] Circuit CLOSED for "${serviceName}" - service recovered`
    );
  }
}
