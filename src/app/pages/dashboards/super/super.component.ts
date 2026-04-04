import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';

import {
  ModuleAnalyticsService,
  AnalyticsSummary,
} from '../../../core/services/module-analytics.service';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';

@Component({
  selector: 'super-dashboard',
  imports: [],
  templateUrl: './super.component.html',
})
export class SuperComponent implements OnInit, OnDestroy {
  private analytics = inject(ModuleAnalyticsService);
  private subscription?: Subscription;

  summary = signal<AnalyticsSummary | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    // Initial load
    this.loadAnalytics();

    // Auto-refresh every 30 seconds
    this.subscription = interval(30000)
      .pipe(
        startWith(0),
        switchMap(() => this.analytics.getAnalyticsSummary())
      )
      .subscribe({
        next: (data) => {
          this.summary.set(data);
          this.loading.set(false);
          this.error.set(null);
          console.log('🔄 Analytics refreshed:', data);
        },
        error: (err) => {
          this.error.set('Error al cargar analytics');
          this.loading.set(false);
          console.error('❌ Error loading analytics:', err);
        },
      });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  loadAnalytics() {
    this.loading.set(true);
    this.analytics.getAnalyticsSummary().subscribe({
      next: (data) => {
        this.summary.set(data);
        this.loading.set(false);
        this.error.set(null);
      },
      error: (err) => {
        this.error.set('Error al cargar analytics');
        this.loading.set(false);
        console.error('❌ Error loading analytics:', err);
      },
    });
  }

  refreshAnalytics() {
    this.loadAnalytics();
  }
}
