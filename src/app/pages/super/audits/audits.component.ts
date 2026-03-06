import { Component, OnInit, computed, signal } from '@angular/core';
import {
  ErrorLogItem,
  ErrorLogService,
} from '../../../core/services/error-log.service';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageBreadcrumbComponent } from '../../../shared/components/common/page-breadcrumb/page-breadcrumb.component';

@Component({
  selector: 'app-audits',
  templateUrl: './audits.component.html',
  imports: [CommonModule, FormsModule, PageBreadcrumbComponent, DatePipe],
})
export class AuditListComponent implements OnInit {
  items = signal<ErrorLogItem[]>([]);
  loading = false;
  limit = 50;
  sinceDate = '';
  selectedStatus = '';
  searchTerm = '';
  components = ['cloudinary', 'orders', 'auth'];
  selectedComponent = '';

  readonly filteredItems = computed(() => {
    const status = this.selectedStatus.trim();
    const term = this.searchTerm.trim().toLowerCase();
    const component = this.selectedComponent.trim();
    return this.items().filter((item) => {
      const matchesStatus = status ? String(item.status) === status : true;
      const matchesTerm = term
        ? [
            item.errorId,
            item.message,
            item.path,
            item.method,
            item.userEmail ?? '',
            item.requestId ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(term)
        : true;
      const matchesComponent = component ? item.component === component : true;
      return matchesStatus && matchesTerm && matchesComponent;
    });
  });

  constructor(
    private errorLogService: ErrorLogService,
    private router: Router
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    const limit = Math.max(1, Math.min(500, Number(this.limit) || 50));
    this.limit = limit;
    let sinceIso: string | undefined;
    if (this.sinceDate) {
      const parsed = new Date(this.sinceDate);
      if (!Number.isNaN(parsed.getTime())) {
        sinceIso = parsed.toISOString();
      }
    }
    this.errorLogService
      .list({
        limit,
        since: sinceIso,
        component: this.selectedComponent || undefined,
      })
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loading = false;
        },
        error: () => (this.loading = false),
      });
  }

  onFilterChange() {
    this.load();
  }

  view(errorId: string) {
    this.router.navigate(['/super/error-logs', errorId]);
  }
}
