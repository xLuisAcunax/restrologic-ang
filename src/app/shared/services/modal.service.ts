// src/app/shared/services/modal.service.ts
import { Injectable, Type } from '@angular/core';
import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { CdkModalComponent } from '../modal/cdk-modal.component';
import { Subscription } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ModalService {
  constructor(private overlay: Overlay) {}

  async open<T = any, R = any>(
    cmp: Type<T>,
    props?: Partial<T>
  ): Promise<R | null> {
    // Overlay config: backdrop + styles (usa Tailwind/DaisyUI clases)
    const config = new OverlayConfig({
      hasBackdrop: true,
      backdropClass: 'bg-black/40', // fondo semitransparente
      panelClass: 'p-0 rounded-lg shadow-lg', // panel (puedes ajustar)
      scrollStrategy: this.overlay.scrollStrategies.block(),
      positionStrategy: this.overlay
        .position()
        .global()
        .centerHorizontally()
        .centerVertically(),
    });

    const overlayRef: OverlayRef = this.overlay.create(config);

    // Subscriptions de backdrop y teclado (Escape)
    const backdropSub: Subscription = overlayRef
      .backdropClick()
      .subscribe(() => overlayRef.dispose());
    const keySub: Subscription = overlayRef
      .keydownEvents()
      .subscribe((ev: KeyboardEvent) => {
        if (ev.key === 'Escape') overlayRef.dispose();
      });

    // Attach wrapper modal (CdkModalComponent) al overlay
    const wrapperPortal = new ComponentPortal(CdkModalComponent);
    const hostRef = overlayRef.attach(wrapperPortal);
    const hostInstance = hostRef.instance as CdkModalComponent;

    // Crear el componente hijo directamente en el ViewContainerRef del host
    const childRef = hostInstance.vc.createComponent<T>(cmp);

    // Asignar inputs si vienen
    if (props) {
      Object.assign(childRef.instance as any, props);
    }

    // Promise que resolverá con payload o null
    return new Promise<R | null>((resolve) => {
      // Si el child emite `submit`, lo manejamos
      const childAny: any = childRef.instance;
      let submitSub: Subscription | null = null;

      if (childAny?.submit && typeof childAny.submit.subscribe === 'function') {
        submitSub = childAny.submit.subscribe((payload: R) => {
          cleanup();
          resolve(payload);
        });
      }

      // Si el wrapper emite confirm (botón Aceptar host)
      const hostConfirmSub = hostInstance.confirm.subscribe(() => {
        // preferir getValue() si está disponible
        if (typeof childAny?.getValue === 'function') {
          const val = childAny.getValue();
          cleanup();
          resolve(val ?? null);
        } else {
          // si no hay getValue ni submit emitido, resolvemos null
          cleanup();
          resolve(null);
        }
      });

      // Si el wrapper emite cancel (botón Cancelar host)
      const hostCancelSub = hostInstance.cancel.subscribe(() => {
        cleanup();
        resolve(null);
      });

      // Si el overlay se destruye por detach/dispose (ej backdrop o escape), resolvemos null
      const detachSub = overlayRef.detachments().subscribe(() => {
        cleanup();
        resolve(null);
      });

      // cleanup function
      function cleanup() {
        try {
          backdropSub.unsubscribe();
        } catch {}
        try {
          keySub.unsubscribe();
        } catch {}
        try {
          submitSub?.unsubscribe();
        } catch {}
        try {
          hostConfirmSub.unsubscribe();
        } catch {}
        try {
          hostCancelSub.unsubscribe();
        } catch {}
        try {
          detachSub.unsubscribe();
        } catch {}
        try {
          overlayRef.dispose();
        } catch {}
      }
    });
  }
}
