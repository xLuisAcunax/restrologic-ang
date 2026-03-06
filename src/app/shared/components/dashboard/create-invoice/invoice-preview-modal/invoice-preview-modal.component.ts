import { Component } from '@angular/core';

@Component({
  selector: 'app-invoice-preview-modal',
  imports: [],
  templateUrl: './invoice-preview-modal.component.html',
  styles: ``,
})
export class InvoicePreviewModalComponent {
  isOpen = false;

  openModal() {
    this.isOpen = true;
  }

  closeModal() {
    this.isOpen = false;
  }
}
