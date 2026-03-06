import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';
import { Observable, throwError, timer, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, tap, retry } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  EventPollingOptions,
  EventPollResponse,
} from '../models/order-events.model';

@Injectable({
  providedIn: 'root',
})
export class OrderEventsPollingService {
  private http = inject(HttpClient);

  // Track last sync timestamp per tenant/branch
  private lastSyncMap = new Map<string, string>();

  // Retry counter for backoff strategy
  private retryCountMap = new Map<string, number>();

  // Track processed event versions to avoid duplicate application
  private processedVersionsMap = new Map<string, Set<number>>();

  // Observable for polling state
  private pollingState$ = new BehaviorSubject<{
    active: boolean;
    key: string | null;
  }>({
    active: false,
    key: null,
  });

  /**
   * Start event polling for a specific tenant/branch
   */
  startPolling(
    tenantId: string,
    branchId: string,
    options: EventPollingOptions = {}
  ): Observable<EventPollResponse> {
    const key = `${tenantId}:${branchId}`;
    const lastSync = this.lastSyncMap.get(key);

    // Compute dynamic interval with jitter each cycle
    const retryCount = this.retryCountMap.get(key) || 0;
    const base = retryCount > 15 ? 4000 : 2000;
    const jitter = Math.random() * 500; // 0-500ms
    const interval = base + jitter;

    return timer(0, interval).pipe(
      switchMap(() => this.poll(tenantId, branchId, lastSync, options)),
      tap((response) => {
        // Update last sync timestamp
        this.lastSyncMap.set(key, response.serverTime);

        // Reset or increment retry count based on events
        if (response.events.length > 0) {
          this.retryCountMap.set(key, 0);

          // Invoke event handler if provided
          if (options.onEvent) {
            if (!this.processedVersionsMap.has(key)) {
              this.processedVersionsMap.set(key, new Set<number>());
            }
            const processed = this.processedVersionsMap.get(key)!;
            response.events.forEach((event) => {
              if (processed.has(event.version)) return; // dedupe
              processed.add(event.version);
              options.onEvent!(event);
            });
          }
        } else {
          this.retryCountMap.set(key, retryCount + 1);
        }
      }),
      catchError((error) => {
        // Increment retry count on error
        this.retryCountMap.set(key, retryCount + 1);

        // Stop polling on auth failures
        if (error.status === 401 || error.status === 403) {
          this.stopPolling(tenantId, branchId);
        }

        if (options.onError) {
          options.onError(error);
        }

        return throwError(() => error);
      })
    );
  }

  /**
   * Single poll request
   */
  private poll(
    tenantId: string,
    branchId: string,
    since?: string,
    options: EventPollingOptions = {}
  ): Observable<EventPollResponse> {
    let params = new HttpParams();

    if (since) {
      params = params.set('since', since);
    }

    if (options.tableId) {
      params = params.set('tableId', options.tableId);
    }

    if (options.orderId) {
      params = params.set('orderId', options.orderId);
    }

    if (options.eventType) {
      params = params.set('eventType', options.eventType);
    }

    // Correct path includes /tenant/{tenantId}/branch/{branchId}
    const url = `${environment.apiBaseUrl}/tenant/${tenantId}/branch/${branchId}/order/events-poll`;

    return this.http.get<EventPollResponse>(url, { params }).pipe(
      catchError((error: HttpErrorResponse) => {
        // Respect rate limit (429)
        if (error.status === 429) {
          const retryAfter = error.headers.get('Retry-After');
          const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
          console.warn(`429 rate limit. Waiting ${delayMs}ms before retry.`);
          return timer(delayMs).pipe(
            switchMap(() => this.http.get<EventPollResponse>(url, { params }))
          );
        }
        // Bubble up auth failures for external handling
        if (error.status === 401 || error.status === 403) {
          return throwError(() => error);
        }
        // Simple exponential backoff for transient errors
        const backoff = 1000 + Math.random() * 1000; // lightweight fallback
        console.warn(`Polling error. Backoff ${Math.round(backoff)}ms`);
        return timer(backoff).pipe(
          switchMap(() => this.http.get<EventPollResponse>(url, { params }))
        );
      })
    );
  }

  /**
   * Stop polling for a specific tenant/branch
   */
  stopPolling(tenantId: string, branchId: string): void {
    const key = `${tenantId}:${branchId}`;
    this.lastSyncMap.delete(key);
    this.retryCountMap.delete(key);
  }

  /**
   * Clear all polling state
   */
  clearAll(): void {
    this.lastSyncMap.clear();
    this.retryCountMap.clear();
  }

  /**
   * Get current retry count for a tenant/branch
   */
  getRetryCount(tenantId: string, branchId: string): number {
    const key = `${tenantId}:${branchId}`;
    return this.retryCountMap.get(key) || 0;
  }
}
