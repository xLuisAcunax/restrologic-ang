import { Injectable } from '@angular/core';

/**
 * Keywords disponibles para fórmulas de precios
 */
export enum FormulaKeyword {
  /** Suma de todos los precios: SUMA(precio) */
  SUMA_PRECIO = 'SUMA(precio)',
  /** Suma de ingredientes adicionales: SUMA(ingredientes) */
  SUMA_INGREDIENTES = 'SUMA(ingredientes)',
  /** Precio máximo: MAX(precio) */
  MAX_PRECIO = 'MAX(precio)',
  /** Precio mínimo: MIN(precio) */
  MIN_PRECIO = 'MIN(precio)',
  /** Precio promedio: PROMEDIO(precio) */
  PROMEDIO_PRECIO = 'PROMEDIO(precio)',
  /** Cantidad de items seleccionados */
  N = 'n',
  /** Precio base del producto principal */
  BASE = 'BASE',
  /** Precio del primer item */
  PRIMERO = 'PRIMERO(precio)',
  /** Precio del último item */
  ULTIMO = 'ULTIMO(precio)',
}

/**
 * Contexto con los valores para evaluar la fórmula
 */
export interface FormulaContext {
  /** Lista de precios de los items seleccionados */
  precios: number[];
  /** Lista de precios de ingredientes adicionales */
  ingredientes?: number[];
  /** Precio base del producto principal */
  base?: number;
}

/**
 * Resultado de la evaluación de una fórmula
 */
export interface FormulaResult {
  success: boolean;
  value: number;
  error?: string;
  /** Fórmula después de reemplazar keywords (para debug) */
  evaluatedFormula?: string;
}

/**
 * Información sobre una keyword
 */
export interface KeywordInfo {
  keyword: FormulaKeyword;
  description: string;
  example: string;
}

@Injectable({ providedIn: 'root' })
export class FormulaService {
  /**
   * Lista de keywords disponibles con descripción
   */
  readonly availableKeywords: KeywordInfo[] = [
    {
      keyword: FormulaKeyword.SUMA_PRECIO,
      description: 'Suma de todos los precios',
      example: 'SUMA(precio) → 50000',
    },
    {
      keyword: FormulaKeyword.SUMA_INGREDIENTES,
      description: 'Suma de ingredientes adicionales',
      example: 'SUMA(ingredientes) → 5000',
    },
    {
      keyword: FormulaKeyword.MAX_PRECIO,
      description: 'Precio más alto',
      example: 'MAX(precio) → 30000',
    },
    {
      keyword: FormulaKeyword.MIN_PRECIO,
      description: 'Precio más bajo',
      example: 'MIN(precio) → 20000',
    },
    {
      keyword: FormulaKeyword.PROMEDIO_PRECIO,
      description: 'Precio promedio',
      example: 'PROMEDIO(precio) → 25000',
    },
    {
      keyword: FormulaKeyword.N,
      description: 'Cantidad de items',
      example: 'n → 2',
    },
    {
      keyword: FormulaKeyword.BASE,
      description: 'Precio base del producto',
      example: 'BASE → 15000',
    },
    {
      keyword: FormulaKeyword.PRIMERO,
      description: 'Precio del primer item',
      example: 'PRIMERO(precio) → 30000',
    },
    {
      keyword: FormulaKeyword.ULTIMO,
      description: 'Precio del último item',
      example: 'ULTIMO(precio) → 20000',
    },
  ];

  /**
   * Evalúa una fórmula con el contexto dado
   * @param formula Fórmula escrita por el usuario (ej: "SUMA(precio) / n")
   * @param context Contexto con los valores
   * @returns Resultado de la evaluación
   */
  evaluate(formula: string, context: FormulaContext): FormulaResult {
    if (!formula || formula.trim() === '') {
      return { success: false, value: 0, error: 'Fórmula vacía' };
    }

    try {
      let evaluatedFormula = formula;

      // Calcular valores del contexto
      const precios = context.precios || [];
      const ingredientes = context.ingredientes || [];
      const n = precios.length;
      const base = context.base ?? 0;

      // Reemplazar keywords (orden importa - más específicos primero)
      const replacements: [string, number][] = [
        [FormulaKeyword.SUMA_PRECIO, this.sum(precios)],
        [FormulaKeyword.SUMA_INGREDIENTES, this.sum(ingredientes)],
        [FormulaKeyword.MAX_PRECIO, this.max(precios)],
        [FormulaKeyword.MIN_PRECIO, this.min(precios)],
        [FormulaKeyword.PROMEDIO_PRECIO, this.average(precios)],
        [FormulaKeyword.PRIMERO, precios[0] ?? 0],
        [FormulaKeyword.ULTIMO, precios[n - 1] ?? 0],
        [FormulaKeyword.BASE, base],
        // 'n' al final porque es corto y podría coincidir con otras palabras
        [FormulaKeyword.N, n],
      ];

      for (const [keyword, value] of replacements) {
        evaluatedFormula = evaluatedFormula.split(keyword).join(String(value));
      }

      // Validar que solo quedan números y operadores permitidos
      if (!this.isValidExpression(evaluatedFormula)) {
        return {
          success: false,
          value: 0,
          error: `Expresión inválida: "${evaluatedFormula}"`,
          evaluatedFormula,
        };
      }

      // Evaluar la expresión matemática de forma segura
      const result = this.safeEval(evaluatedFormula);

      if (isNaN(result) || !isFinite(result)) {
        return {
          success: false,
          value: 0,
          error: 'Resultado no válido (división por cero o valor infinito)',
          evaluatedFormula,
        };
      }

      return {
        success: true,
        value: Math.round(result * 100) / 100, // Redondear a 2 decimales
        evaluatedFormula,
      };
    } catch (error) {
      return {
        success: false,
        value: 0,
        error: `Error al evaluar: ${error instanceof Error ? error.message : 'desconocido'}`,
      };
    }
  }

  /**
   * Valida si una fórmula tiene sintaxis correcta (sin evaluar)
   */
  validateFormula(formula: string): { valid: boolean; error?: string } {
    if (!formula || formula.trim() === '') {
      return { valid: false, error: 'Fórmula vacía' };
    }

    // Verificar paréntesis balanceados
    let depth = 0;
    for (const char of formula) {
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (depth < 0) {
        return { valid: false, error: 'Paréntesis desbalanceados' };
      }
    }
    if (depth !== 0) {
      return { valid: false, error: 'Paréntesis desbalanceados' };
    }

    // Verificar que contiene al menos una keyword o número
    const hasKeyword = this.availableKeywords.some((k) =>
      formula.includes(k.keyword),
    );
    const hasNumber = /\d/.test(formula);

    if (!hasKeyword && !hasNumber) {
      return {
        valid: false,
        error: 'La fórmula debe contener al menos una keyword o número',
      };
    }

    return { valid: true };
  }

  /**
   * Obtiene las keywords usadas en una fórmula
   */
  getUsedKeywords(formula: string): FormulaKeyword[] {
    return this.availableKeywords
      .filter((k) => formula.includes(k.keyword))
      .map((k) => k.keyword);
  }

  // ─── Helpers privados ─────────────────────────────────────────────

  private sum(values: number[]): number {
    return values.reduce((acc, val) => acc + (val || 0), 0);
  }

  private max(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.max(...values);
  }

  private min(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.min(...values);
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return this.sum(values) / values.length;
  }

  /**
   * Verifica que la expresión solo contenga caracteres seguros
   */
  private isValidExpression(expr: string): boolean {
    // Solo permitir: números, operadores matemáticos, paréntesis, espacios, punto decimal
    const safePattern = /^[\d\s+\-*/().]+$/;
    return safePattern.test(expr);
  }

  /**
   * Evalúa una expresión matemática de forma segura
   * Solo permite operaciones aritméticas básicas
   */
  private safeEval(expression: string): number {
    // Usar Function en lugar de eval para evitar acceso al scope
    // La expresión ya fue validada para contener solo números y operadores
    const fn = new Function(`return (${expression})`);
    return fn();
  }
}
