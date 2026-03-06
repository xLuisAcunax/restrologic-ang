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
    if (distanceKm <= 0) return 0;

    // Free threshold
    if (
      cfg.freeDeliveryThresholdKm != null &&
      distanceKm <= cfg.freeDeliveryThresholdKm
    ) {
      return 0;
    }

    const brackets = [...(cfg.pricingBrackets || [])].sort(
      (a, b) => a.upToKm - b.upToKm
    );
    if (!brackets.length) return 0;

    // Find first bracket matching distance
    const bracket =
      brackets.find((b) => distanceKm <= b.upToKm) ||
      brackets[brackets.length - 1];
    return this.calculateBracketFee(distanceKm, bracket);
  }

  private calculateBracketFee(
    distanceKm: number,
    bracket: DeliveriesPricingBracket
  ): number {
    if (bracket.perKm && bracket.perKm > 0) {
      // Charge base + variable portion inside bracket
      return Math.round(bracket.baseFee + distanceKm * bracket.perKm);
    }
    return bracket.baseFee;
  }
}
