import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * Analytics summary response from backend
 */
export interface AnalyticsSummary {
  totalEvents: number;
  accessDenied: number;
  upgradePromptShown: number;
  upgradeRequests: number;
  conversionRate: number;
  topModules: Array<{
    moduleKey: string;
    accessDeniedCount: number;
    upgradeRequestCount: number;
    affectedTenants: number;
    affectedUsers: number;
  }>;
  recentEvents: Array<{
    moduleKey: string;
    eventType: string;
    tenantName: string;
    userName: string;
    timestamp: string;
  }>;
}

/**
 * Service to track module usage and generate insights
 * Sends events to backend for centralized analytics
 */
@Injectable({ providedIn: 'root' })
export class ModuleAnalyticsService {
  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/analytics`;

  // Observable for reactive updates
  private analyticsUpdated$ = new BehaviorSubject<void>(undefined);
  public onAnalyticsUpdate = this.analyticsUpdated$.asObservable();

  /**
   * Track when a user is denied access to a module
   */
  trackAccessDenied(moduleKey: string, route?: string) {
    this.sendEvent({
      moduleKey,
      eventType: 'access_denied',
      metadata: { route },
    }).subscribe({
      next: () => console.log('📊 Access denied tracked:', moduleKey),
      error: (err) => console.error('❌ Failed to track access denied:', err),
    });
  }

  /**
   * Track when an upgrade prompt is shown to a user
   */
  trackUpgradePromptShown(moduleKey: string) {
    this.sendEvent({
      moduleKey,
      eventType: 'upgrade_prompt_shown',
      metadata: {},
    }).subscribe({
      next: () => console.log('📊 Upgrade prompt shown:', moduleKey),
      error: (err) => console.error('❌ Failed to track prompt shown:', err),
    });
  }

  /**
   * Track when a user requests to upgrade/enable a module
   */
  trackUpgradeRequested(moduleKey: string, source: string = 'unknown') {
    this.sendEvent({
      moduleKey,
      eventType: 'upgrade_requested',
      metadata: { source },
    }).subscribe({
      next: () => console.log('📊 Upgrade requested:', moduleKey, source),
      error: (err) => console.error('❌ Failed to track upgrade request:', err),
    });
  }

  /**
   * Generic module event tracker (Phase A: deliveries module events)
   * @param moduleKey Module identifier
   * @param eventType Event type (e.g., 'fee_bracket_used', 'delivery_assigned')
   * @param metadata Optional event-specific metadata
   */
  trackModuleEvent(moduleKey: string, eventType: string, metadata: any = {}) {
    this.sendEvent({
      moduleKey,
      eventType,
      metadata,
    }).subscribe({
      next: () => console.log('📊 Module event tracked:', moduleKey, eventType),
      error: (err) => console.error('❌ Failed to track module event:', err),
    });
  }

  /**
   * Get analytics summary from backend
   */
  getAnalyticsSummary(
    startDate?: string,
    endDate?: string,
    tenantId?: string
  ): Observable<AnalyticsSummary> {
    const params: any = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (tenantId) params.tenantId = tenantId;

    return this.http.get<AnalyticsSummary>(`${this.baseUrl}/module-summary`, {
      params,
    });
  }

  /**
   * Send event to backend
   */
  private sendEvent(event: {
    moduleKey: string;
    eventType: string;
    metadata: any;
  }): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/module-events`, event)
      .pipe(tap(() => this.analyticsUpdated$.next()));
  }
}
