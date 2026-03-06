import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { ModuleService } from '../../core/services/module.service';
import { Subject, takeUntil } from 'rxjs';

/**
 * Directive to conditionally show/hide elements based on module availability
 *
 * Usage:
 * <button *requireModule="'deliveries'">Create Delivery</button>
 * <div *requireModule="'inventory'">
 *   <app-inventory-widget />
 * </div>
 */
@Directive({
  selector: '[requireModule]',
  standalone: true,
})
export class RequireModuleDirective implements OnInit, OnDestroy {
  @Input() requireModule!: string;
  private destroy$ = new Subject<void>();
  private hasView = false;

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private moduleService: ModuleService
  ) {}

  ngOnInit() {
    this.moduleService
      .getEffectiveModules()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateView();
      });
  }

  private updateView() {
    const isEnabled = this.moduleService.isModuleEnabled(this.requireModule);

    if (isEnabled && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!isEnabled && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
