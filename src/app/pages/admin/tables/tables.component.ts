import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { BranchSummary } from '../../../core/services/business.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { Table, TableService } from '../../../core/services/table.service';
import { Dialog } from '@angular/cdk/dialog';
import { TableFormComponent } from './table-form/table-form.component';

@Component({
  selector: 'app-tables',
  imports: [CommonModule, FormsModule],
  templateUrl: './tables.component.html',
})
export class TablesComponent implements OnInit {
  branches = signal<BranchSummary[]>([]);
  tables = signal<Table[]>([]);
  filtered = signal<Table[]>([]);
  search = signal<string>('');

  private authService = inject(AuthService);
  private tableService = inject(TableService);
  private dialog = inject(Dialog);
  private branchSelectionService = inject(BranchSelectionService);

  constructor() {
    // Effect para reaccionar a cambios en la selección de sucursal
    effect(() => {
      const branchId = this.branchSelectionService.selectedBranchId();
      if (branchId) {
        this.loadTables(branchId);
      }
    });
  }

  ngOnInit(): void {}

  loadTables(branchId: string) {
    this.tableService.getTables(branchId).subscribe((res: any) => {
      this.tables.set(res || []);
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
      this.filtered.set(this.tables());
      return;
    }
    this.filtered.set(
      this.tables().filter((t) =>
        [t.name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      ),
    );
  }

  openTableModal(table?: Table) {
    const tenantId = this.authService.me()?.tenantId!;
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (!branchId) return;

    const dialogRef = this.dialog.open(TableFormComponent, {
      width: '550px',
      maxWidth: '95vw',
      panelClass: 'full-screen-modal',
      autoFocus: false,
      data: {
        tenantId: tenantId,
        branchId: branchId,
        table,
      },
    });

    dialogRef.closed.subscribe((result) => {
      if (result === 'Confirmed') {
        this.loadTables(branchId);
      }
    });
  }

  deleteTable(table: Table) {
    const tenantId = this.authService.me()?.tenantId!;
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (!tenantId || !branchId) return;

    const label = table.name || '';
    const confirmed = confirm(
      `¿Estás seguro de eliminar la mesa "${label.trim()}"?`,
    );

    if (!confirmed) {
      return;
    }

    this.tableService
      .deleteTable(tenantId, branchId, table.id)
      .subscribe(() => this.loadTables(branchId));
  }

  badgeClass(status: string) {
    switch (status) {
      case 'Ocupada':
        return 'badge-error';
      case 'Reservada':
        return 'badge-warning';
      case 'Inhabilitada':
        return 'badge-neutral';
      default:
        return 'badge-success';
    }
  }
}
