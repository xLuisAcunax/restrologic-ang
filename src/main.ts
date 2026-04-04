import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from '@angular/platform-browser';
import '@angular/common/locales/global/es-CO';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, {
  ...appConfig,
  providers: [provideZoneChangeDetection(),...(appConfig.providers ?? [])],
}).catch((err) => console.error(err));
