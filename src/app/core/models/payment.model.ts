import { PaymentDto, PaymentMethodType } from './order.model';

export type PaymentDialogData = {
  total: number;
  paid: number;
  outstanding: number;
  currency: string;
  payments: PaymentDto[];
};

export type PaymentDialogResult = {
  method: PaymentMethodType;
  amount: number;
  reference?: string;
  notes?: string;
};
