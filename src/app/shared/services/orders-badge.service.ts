import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class OrdersBadgeService {
  private inProgressCountSignal = signal<number>(0);

  // Expose as readonly
  readonly inProgressCount = this.inProgressCountSignal.asReadonly();

  setInProgressCount(count: number) {
    this.inProgressCountSignal.set(count);
  }
}
