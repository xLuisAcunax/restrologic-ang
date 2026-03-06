import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  ErrorLogItem,
  ErrorLogService,
} from '../../../core/services/error-log.service';
import { CommonModule, DatePipe } from '@angular/common';
import { PageBreadcrumbComponent } from '../../../shared/components/common/page-breadcrumb/page-breadcrumb.component';

@Component({
  selector: 'app-audit-detail',
  templateUrl: './audit-detail.component.html',
  imports: [CommonModule, DatePipe, PageBreadcrumbComponent],
})
export class AuditDetailComponent implements OnInit {
  item = signal<ErrorLogItem | null>(null);
  loading = false;

  constructor(
    private readonly errorLogService: ErrorLogService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit() {
    const errorId = this.route.snapshot.paramMap.get('id');
    if (errorId) {
      this.load(errorId);
    }
  }

  load(id: string) {
    this.loading = true;
    this.errorLogService.get(id).subscribe({
      next: (doc) => {
        this.item.set(doc ?? null);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.item.set(null);
      },
    });
  }

  copy(value?: string | null) {
    if (!value) return;
    const text = String(value);
    if (
      navigator &&
      (navigator as any).clipboard &&
      (navigator as any).clipboard.writeText
    ) {
      (navigator as any).clipboard.writeText(text).catch(() => {
        this.fallbackCopy(text);
      });
    } else {
      this.fallbackCopy(text);
    }
  }

  private fallbackCopy(text: string) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (e) {
      console.warn('Copy failed', e);
    }
  }

  close() {
    window.history.back();
  }
}
