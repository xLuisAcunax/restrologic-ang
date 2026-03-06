import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { AuthService } from '../../../core/services/auth.service';
import { Tax, TaxService } from '../../../core/services/tax.service';
import { TaxFormComponent } from './tax-form/tax-form.component';

@Component({
  selector: 'app-taxes.component',
  imports: [CommonModule, FormsModule],
  templateUrl: './taxes.component.html',
})
export class TaxesComponent implements OnInit {
  taxes = signal<Tax[]>([]);
  filtered = signal<Tax[]>([]);
  search = signal<string>('');

  private authService = inject(AuthService);
  private taxService = inject(TaxService);
  private dialog = inject(Dialog);

  ngOnInit(): void {
    const tenantId = this.authService.me()?.tenantId!;
    if (tenantId) this.loadTaxes();
  }

  loadTaxes() {
    this.taxService.getTaxes().subscribe((res) => {
      this.taxes.set(res || []);
      this.applyFilter();
    });
  }

  onSearch(term: string) {
    this.search.set(term?.toLowerCase() ?? '');
    this.applyFilter();
  }

  private applyFilter() {
    const term = this.search();
    if (!term) {
      this.filtered.set(this.taxes());
      return;
    }
    this.filtered.set(
      this.taxes().filter((t) => t.name.toLowerCase().includes(term)),
    );
  }

  openTaxModal(tax?: Tax) {
    const tenantId = this.authService.me()?.tenantId!;
    const dialogRef = this.dialog.open(TaxFormComponent, {
      width: '600px',
      data: { tenantId: tenantId, tax: tax },
    });

    dialogRef.closed.subscribe((result) => {
      if (result === 'Confirmed') {
        this.loadTaxes();
      }
    });
  }

  deleteTax(tax: Tax) {
    if (!confirm(`¿Está seguro de eliminar el impuesto "${tax.name}"?`)) return;

    const tenantId = this.authService.me()?.tenantId!;
    this.taxService.deleteTax(tax.id).subscribe(() => {
      this.loadTaxes();
    });
  }
}
