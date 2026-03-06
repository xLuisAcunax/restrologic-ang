import { Component } from '@angular/core';

@Component({
  selector: 'app-billing-info',
  imports: [],
  templateUrl: './billing-info.component.html',
  host: {
    class:
      'rounded-2xl border border-gray-200 bg-white xl:w-2/6 dark:border-gray-800 dark:bg-white/[0.03]',
  },
})
export class BillingInfoComponent {
  isOpen = false;

  openModal() {
    this.isOpen = true;
  }

  closeModal() {
    this.isOpen = false;
  }

  handleSave() {
    this.closeModal();
  }
}
