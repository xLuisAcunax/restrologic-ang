import { Tax } from '../../core/services/tax.service';

export type AppliedTax = {
  id?: string;
  label: string;
  amount: number;
  included: boolean;
  percentage: number;
};

export type AppliedTaxSummary = {
  applied: AppliedTax[];
  total: number;
  additiveTotal: number;
  includedTotal: number;
  baseGross: number;
  netSubtotal: number;
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildTaxLabel(tax: Tax): string {
  const displayValue = tax.isPercentage
    ? tax.percentage + '%'
    : '$' + tax.percentage;
  return `${tax.name} (${displayValue})`;
}

export function computeAppliedTaxes(
  subtotal: number,
  taxes: Tax[],
): AppliedTaxSummary {
  const baseAmount = roundCurrency(Math.max(0, subtotal || 0));

  if (baseAmount <= 0 || !taxes || taxes.length === 0) {
    return {
      applied: [],
      total: 0,
      additiveTotal: 0,
      includedTotal: 0,
      baseGross: baseAmount,
      netSubtotal: baseAmount,
    };
  }

  // Para taxes.filter: si isPercentage es true, filtra por percentage > 0; si es false, siempre activo si isActive
  const active = taxes.filter(
    (tax) => tax.isActive && (tax.isPercentage ? tax.percentage > 0 : true),
  );
  if (active.length === 0) {
    return {
      applied: [],
      total: 0,
      additiveTotal: 0,
      includedTotal: 0,
      baseGross: baseAmount,
      netSubtotal: baseAmount,
    };
  }

  const applied: AppliedTax[] = [];

  let includedTotal = 0;
  let additiveTotal = 0;
  let includedRateSum = 0;

  active.forEach((tax) => {
    let amount: number;
    if (tax.isPercentage) {
      const rate = tax.percentage / 100;
      if (rate <= 0) {
        return;
      }
      amount = roundCurrency(baseAmount * rate);
    } else {
      // Fixed value, no percentage-based calculation
      amount = roundCurrency(tax.percentage);
    }

    if (amount <= 0) {
      return;
    }

    if (tax.isIncluded) {
      includedTotal += amount;
      if (tax.isPercentage) {
        includedRateSum += tax.percentage / 100;
      }
    } else {
      additiveTotal += amount;
    }

    applied.push({
      id: tax.id,
      label: buildTaxLabel(tax),
      amount,
      included: tax.isIncluded,
      percentage: tax.percentage,
    });
  });

  includedTotal = roundCurrency(includedTotal);
  additiveTotal = roundCurrency(additiveTotal);
  const total = roundCurrency(includedTotal + additiveTotal);

  const netBase = includedRateSum > 0 ? baseAmount - includedTotal : baseAmount;
  const netSubtotal = roundCurrency(netBase);

  return {
    applied,
    total,
    additiveTotal,
    includedTotal,
    baseGross: baseAmount,
    netSubtotal,
  };
}
