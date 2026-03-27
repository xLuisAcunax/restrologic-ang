import { Injectable } from '@angular/core';
import { ModuleService } from './module.service';
import {
  DeliveriesModuleConfig,
  DeliveriesPricingBracket,
} from '../models/module.model';

@Injectable({ providedIn: 'root' })
export class DeliveryFeeService {
  constructor(private readonly modules: ModuleService) {}

  /** Get active deliveries module config (typed) */
  getConfig(): DeliveriesModuleConfig | null {
    return this.modules.getModuleConfig<DeliveriesModuleConfig>('deliveries');
  }

  /** Compute delivery fee based on distance and current config */
  computeFee(
    distanceKm: number,
    config?: DeliveriesModuleConfig | null
  ): number {
    const cfg = config || this.getConfig();
    if (!cfg) return 0;

    const normalizedDistance = this.normalizeNumber(distanceKm);
    if (normalizedDistance <= 0) return 0;

    const maxRadiusKm = this.normalizeNumber(cfg.deliveryRadiusKm);
    if (maxRadiusKm > 0 && normalizedDistance > maxRadiusKm) {
      return 0;
    }

    const freeThresholdKm = this.normalizeNullableNumber(
      cfg.freeDeliveryThresholdKm
    );
    if (freeThresholdKm != null && normalizedDistance <= freeThresholdKm) {
      return 0;
    }

    const brackets = (cfg.pricingBrackets || [])
      .map((bracket) => this.normalizeBracket(bracket))
      .filter((bracket) => bracket.upToKm > 0)
      .sort((a, b) => a.upToKm - b.upToKm);

    if (!brackets.length) return 0;

    const bracket =
      brackets.find((candidate) => normalizedDistance <= candidate.upToKm) ||
      brackets[brackets.length - 1];

    const bracketIndex = brackets.indexOf(bracket);
    const previousUpperBound =
      bracketIndex > 0 ? brackets[bracketIndex - 1].upToKm : 0;
    const lowerBound = Math.max(previousUpperBound, freeThresholdKm ?? 0);

    return this.calculateBracketFee(normalizedDistance, bracket, lowerBound);
  }

  private calculateBracketFee(
    distanceKm: number,
    bracket: DeliveriesPricingBracket,
    lowerBoundKm: number
  ): number {
    const baseFee = this.normalizeNumber(bracket.baseFee);
    const perKm = this.normalizeNullableNumber(bracket.perKm) ?? 0;

    if (perKm > 0) {
      const extraDistance = Math.max(0, distanceKm - lowerBoundKm);
      return Math.round(baseFee + extraDistance * perKm);
    }

    return Math.round(baseFee);
  }

  private normalizeBracket(
    bracket: DeliveriesPricingBracket
  ): DeliveriesPricingBracket {
    return {
      upToKm: this.normalizeNumber(bracket.upToKm),
      baseFee: this.normalizeNumber(bracket.baseFee),
      perKm: this.normalizeNullableNumber(bracket.perKm) ?? undefined,
    };
  }

  private normalizeNumber(value: unknown): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.trim().replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private normalizeNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const normalized = this.normalizeNumber(value);
    return Number.isFinite(normalized) ? normalized : null;
  }
}
