import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CartUiService {
  drawerOpen = signal(false);
  openDrawer() {
    this.drawerOpen.set(true);
  }
  closeDrawer() {
    this.drawerOpen.set(false);
  }
  toggleDrawer() {
    this.drawerOpen.update((v) => !v);
  }
}
