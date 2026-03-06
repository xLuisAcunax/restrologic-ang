import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PublicTrackingService {
  private readonly KEY = 'publicOrderId';

  orderId = signal<string>('');

  constructor() {
    const saved = this.read();
    if (saved) this.orderId.set(saved);
  }

  set(orderId: string) {
    this.orderId.set(orderId);
    try {
      localStorage.setItem(this.KEY, orderId);
    } catch {}
  }

  clear() {
    this.orderId.set('');
    try {
      localStorage.removeItem(this.KEY);
    } catch {}
  }

  read(): string {
    try {
      return localStorage.getItem(this.KEY) || '';
    } catch {
      return '';
    }
  }
}
