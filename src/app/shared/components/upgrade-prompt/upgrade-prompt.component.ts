import { Component, Input, OnInit, inject } from '@angular/core';

import { ModuleAnalyticsService } from '../../../core/services/module-analytics.service';

/**
 * Component to display when a premium feature/module is not available
 * Shows a friendly message with call-to-action to upgrade or contact support
 */
@Component({
  selector: 'app-upgrade-prompt',
  standalone: true,
  imports: [],
  template: `
    <div
      class="rounded-2xl border-2 border-dashed border-warning/50 bg-warning/10 p-8 text-center"
    >
      <div class="mb-4 text-5xl">{{ icon }}</div>
      <h3 class="text-xl font-semibold text-base-content">
        {{ title }}
      </h3>
      <p class="mt-2 text-sm text-base-content/70">
        {{ message }}
      </p>
      <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button class="btn btn-primary btn-sm" (click)="onContactSupport()">
          {{ ctaText }}
        </button>
        <button class="btn btn-ghost btn-sm" (click)="onLearnMore()">
          Más información
        </button>
      </div>
    </div>
  `,
})
export class UpgradePromptComponent implements OnInit {
  @Input() module: string = '';
  @Input() icon: string = '🔒';
  @Input() title: string = 'Funcionalidad no disponible';
  @Input() message: string =
    'Esta característica requiere un módulo adicional. Contacta a soporte para habilitar esta funcionalidad en tu plan.';
  @Input() ctaText: string = 'Contactar soporte';

  private analytics = inject(ModuleAnalyticsService);

  ngOnInit() {
    // Track that upgrade prompt was shown
    if (this.module) {
      this.analytics.trackUpgradePromptShown(this.module);
    }
  }

  onContactSupport() {
    // Track upgrade request
    if (this.module) {
      this.analytics.trackUpgradeRequested(
        this.module,
        'upgrade-prompt-button'
      );
    }

    console.log(`Usuario solicita acceso al módulo: ${this.module}`);

    // Ejemplo: enviar a WhatsApp o email
    const message = encodeURIComponent(
      `Hola, me gustaría activar el módulo "${this.module}" en mi plan.`
    );
    // window.open(`https://wa.me/1234567890?text=${message}`, '_blank');

    alert(
      `Por favor contacta a soporte para activar el módulo: ${this.module}`
    );
  }

  onLearnMore() {
    console.log(`Usuario quiere aprender más sobre: ${this.module}`);
    // Aquí puedes redirigir a documentación o pricing
    // this.router.navigate(['/pricing']);
    alert('Más información sobre módulos próximamente...');
  }
}
