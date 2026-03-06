import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, interval } from 'rxjs';
import { catchError, tap, switchMap, takeWhile } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface TableLock {
  tableId: string;
  tenantId: string;
  branchId: string;
  lockedBy: {
    userId: string;
    userName: string;
  } | null;
  lockedAt: string | null;
  expiresAt: string | null;
  currentOrderId: string | null;
}

export interface TableLockResponse {
  ok: boolean;
  data?: TableLock;
  error?: string;
  message?: string;
}

export interface LockRequest {
  userId: string;
  userName: string;
}

@Injectable({
  providedIn: 'root',
})
export class TableLockService {
  private http = inject(HttpClient);

  // Track active locks
  private activeLocks = new Map<string, TableLock>();

  // Track renewal intervals
  private renewalIntervals = new Map<string, any>();

  // Signals for reactive state
  isLocked = signal<boolean>(false);
  currentLock = signal<TableLock | null>(null);
  lockError = signal<string | null>(null);

  /**
   * Acquire lock on a table
   */
  acquireLock(
    tenantId: string,
    branchId: string,
    tableId: string,
    userId: string,
    userName: string
  ): Observable<TableLockResponse> {
    // Correct path includes /tenant/{tenantId}/branch/{branchId}
    const url = `${environment.apiBaseUrl}/tenant/${tenantId}/branch/${branchId}/table/${tableId}/lock`;
    const body: LockRequest = { userId, userName };

    return this.http.post<TableLockResponse>(url, body).pipe(
      tap((response) => {
        if (response.ok && response.data) {
          const key = this.getLockKey(tenantId, branchId, tableId);
          this.activeLocks.set(key, response.data);
          this.isLocked.set(true);
          this.currentLock.set(response.data);
          this.lockError.set(null);

          // Start auto-renewal (every 2 minutes)
          this.startAutoRenewal(tenantId, branchId, tableId);
        }
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 409) {
          // Lock conflict
          const errorMsg =
            error.error?.error || 'Mesa ocupada por otro usuario';
          this.lockError.set(errorMsg);
          this.isLocked.set(false);
        } else {
          this.lockError.set('Error al bloquear la mesa. Intenta nuevamente.');
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Renew an existing lock
   */
  renewLock(
    tenantId: string,
    branchId: string,
    tableId: string
  ): Observable<TableLockResponse> {
    // Correct path includes /tenant/{tenantId}/branch/{branchId}
    const url = `${environment.apiBaseUrl}/tenant/${tenantId}/branch/${branchId}/table/${tableId}/lock/renew`;

    return this.http.put<TableLockResponse>(url, {}).pipe(
      tap((response) => {
        console.log('Lock renewed successfully');
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 410) {
          // Lock expired
          const key = this.getLockKey(tenantId, branchId, tableId);
          this.stopAutoRenewal(key);
          this.isLocked.set(false);
          this.lockError.set(
            'Lock expirado. Por favor, vuelve a bloquear la mesa.'
          );
        }
        console.error('Lock renewal error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Release lock on a table
   */
  releaseLock(
    tenantId: string,
    branchId: string,
    tableId: string,
    userId: string
  ): Observable<TableLockResponse> {
    // Correct path includes /tenant/{tenantId}/branch/{branchId}
    const url = `${environment.apiBaseUrl}/tenant/${tenantId}/branch/${branchId}/table/${tableId}/lock`;
    const key = this.getLockKey(tenantId, branchId, tableId);

    // Stop auto-renewal first
    this.stopAutoRenewal(key);

    return this.http.delete<TableLockResponse>(url, { body: { userId } }).pipe(
      tap((response) => {
        this.activeLocks.delete(key);
        this.isLocked.set(false);
        this.currentLock.set(null);
        this.lockError.set(null);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Lock release error:', error);
        // Still clean up local state even if request fails
        this.activeLocks.delete(key);
        this.isLocked.set(false);
        this.currentLock.set(null);
        return throwError(() => error);
      })
    );
  }

  /**
   * Check lock status for a table
   */
  getLockStatus(
    tenantId: string,
    branchId: string,
    tableId: string
  ): Observable<TableLockResponse> {
    // Correct path includes /tenant/{tenantId}/branch/{branchId}
    const url = `${environment.apiBaseUrl}/tenant/${tenantId}/branch/${branchId}/table/${tableId}/lock`;

    return this.http.get<TableLockResponse>(url).pipe(
      tap((response) => {
        if (response.ok && response.data) {
          const key = this.getLockKey(tenantId, branchId, tableId);
          this.activeLocks.set(key, response.data);
          this.currentLock.set(response.data);
        }
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Error checking lock status:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Start auto-renewal for a lock (every 2 minutes)
   */
  private startAutoRenewal(
    tenantId: string,
    branchId: string,
    tableId: string
  ): void {
    const key = this.getLockKey(tenantId, branchId, tableId);

    // Clear existing interval if any
    this.stopAutoRenewal(key);

    // Renew every 120 seconds (2 minutes)
    const renewal$ = interval(120000)
      .pipe(
        switchMap(() => this.renewLock(tenantId, branchId, tableId)),
        takeWhile(() => this.activeLocks.has(key), true)
      )
      .subscribe({
        error: (err) => {
          console.error('Auto-renewal failed:', err);
          this.stopAutoRenewal(key);
        },
      });

    this.renewalIntervals.set(key, renewal$);
  }

  /**
   * Stop auto-renewal for a lock
   */
  private stopAutoRenewal(key: string): void {
    const interval = this.renewalIntervals.get(key);
    if (interval) {
      interval.unsubscribe();
      this.renewalIntervals.delete(key);
    }
  }

  /**
   * Release lock using sendBeacon (for page unload)
   * This is a best-effort attempt to release the lock when the user leaves
   */
  releaseLockOnUnload(
    tenantId: string,
    branchId: string,
    tableId: string,
    userId: string
  ): void {
    // Ensure correct tenant/branch path
    const url = `${environment.apiBaseUrl}/tenant/${tenantId}/branch/${branchId}/table/${tableId}/lock`;
    const key = this.getLockKey(tenantId, branchId, tableId);

    try {
      const payload = JSON.stringify({ userId });
      const blob = new Blob([payload], { type: 'application/json' });
      // sendBeacon is best-effort; falls back silently if unsupported
      const ok = navigator.sendBeacon(url, blob);
      if (!ok) {
        // Fallback to fetch with keepalive
        fetch(url, {
          method: 'DELETE',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        }).catch((err) =>
          console.error('Fallback unload release failed:', err)
        );
      }
    } catch (err) {
      console.error('sendBeacon lock release error:', err);
    }

    // Clean up local state
    this.stopAutoRenewal(key);
    this.activeLocks.delete(key);
  }

  /**
   * Check if a specific table is locked by current user
   */
  isTableLockedByMe(
    tenantId: string,
    branchId: string,
    tableId: string,
    userId: string
  ): boolean {
    const key = this.getLockKey(tenantId, branchId, tableId);
    const lock = this.activeLocks.get(key);
    return lock?.lockedBy?.userId === userId;
  }

  /**
   * Get lock info for a table
   */
  getLockInfo(
    tenantId: string,
    branchId: string,
    tableId: string
  ): TableLock | null {
    const key = this.getLockKey(tenantId, branchId, tableId);
    return this.activeLocks.get(key) || null;
  }

  /**
   * Clear all locks and intervals
   */
  clearAll(): void {
    // Stop all renewal intervals
    this.renewalIntervals.forEach((interval, key) => {
      interval.unsubscribe();
    });

    this.renewalIntervals.clear();
    this.activeLocks.clear();
    this.isLocked.set(false);
    this.currentLock.set(null);
    this.lockError.set(null);
  }

  /**
   * Generate unique key for lock tracking
   */
  private getLockKey(
    tenantId: string,
    branchId: string,
    tableId: string
  ): string {
    return `${tenantId}:${branchId}:${tableId}`;
  }
}
