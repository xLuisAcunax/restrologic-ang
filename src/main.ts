import { bootstrapApplication } from '@angular/platform-browser';
import '@angular/common/locales/global/es-CO';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, {
  ...appConfig,
  providers: [...(appConfig.providers ?? [])],
}).catch((err) => console.error(err));
