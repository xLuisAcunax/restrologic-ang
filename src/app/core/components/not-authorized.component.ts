import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { UpgradePromptComponent } from '../../shared/components/upgrade-prompt/upgrade-prompt.component';

@Component({
  selector: 'app-not-authorized',
  standalone: true,
  imports: [RouterLink, UpgradePromptComponent],
  template: `
    <div class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md">
        @if (moduleKey) {
        <!-- Module-specific message -->
        <app-upgrade-prompt
          [module]="moduleKey"
          [icon]="'🔒'"
          [title]="title"
          [message]="message"
          [ctaText]="'Solicitar acceso'"
        />

        <div class="mt-4 text-center">
          <a routerLink="/" class="link link-primary text-sm">
            ← Volver al inicio
          </a>
        </div>
        } @else {
        <!-- Generic permission denied -->
        <div
          class="rounded-2xl border-2 border-dashed border-error/50 bg-error/10 p-8 text-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="80"
            height="80"
            viewBox="0 0 48 48"
            class="mx-auto mb-4 text-error"
          >
            <g
              fill="none"
              stroke="currentColor"
              stroke-linejoin="round"
              stroke-width="3"
            >
              <path
                d="M45 24c0 11.598-9.402 21-21 21S3 35.598 3 24S12.402 3 24 3s21 9.402 21 21Z"
              />
              <path
                stroke-linecap="round"
                d="M15 17v2m18-2v2m-1 16a8 8 0 1 0-16 0"
              />
            </g>
          </svg>
          <h1 class="text-2xl font-bold text-base-content">
            403 - No autorizado
          </h1>
          <p class="mt-2 text-sm text-base-content/70">
            No tienes permisos para acceder a esta página.
          </p>
          <a routerLink="/" class="btn btn-primary btn-sm mt-4">
            Volver al inicio
          </a>
        </div>
        }
      </div>
    </div>
  `,
})
export class NotAuthorizedComponent implements OnInit {
  moduleKey: string = '';
  title: string = 'Acceso denegado';
  message: string = 'No tienes permisos para acceder a esta página.';

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.moduleKey = params['module'] || '';
      if (this.moduleKey) {
        this.title = `Módulo "${this.moduleKey}" no disponible`;
        this.message = `Tu plan actual no incluye acceso al módulo "${this.moduleKey}". Contacta a soporte para más información sobre cómo activarlo.`;
      }
    });
  }
}
