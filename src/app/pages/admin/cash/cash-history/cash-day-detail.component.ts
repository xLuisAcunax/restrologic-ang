import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { BranchSelectionService } from '../../../../core/services/branch-selection.service';
import {
  CashDrawerDto,
  CashDrawerService,
  CashMovementDto,
} from '../../../../core/services/cash-drawer.service';
import { OrderService } from '../../../../core/services/order.service';
import { LocalDateTimePipe } from '../../../../shared/pipes/local-datetime.pipe';
import * as XLSX from 'xlsx';
import { Order, PaymentDto } from '../../../../core/models/order.model';

@Component({
  selector: 'app-cash-day-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cash-day-detail.component.html',
})
export class CashDayDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly branchSelection = inject(BranchSelectionService);
  private readonly cashDrawerService = inject(CashDrawerService);
  private readonly orderService = inject(OrderService);

  tenantId = signal<string>('');
  drawerId = signal<string>('');
  drawer = signal<CashDrawerDto | null>(null);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  // Derived data - categorized movements
  paymentMovements = computed(() => {
    const movements = this.drawer()?.movements ?? [];
    return movements.filter((m) => m.reason?.startsWith('Payment:'));
  });

  changeMovements = computed(() => {
    const movements = this.drawer()?.movements ?? [];
    return movements.filter((m) => m.reason === 'Change');
  });

  manualMovements = computed(() => {
    const movements = this.drawer()?.movements ?? [];
    return movements.filter(
      (m) =>
        !m.reason?.startsWith('Payment:') &&
        m.reason !== 'Change' &&
        m.reason !== 'Opening',
    );
  });

  totalPayments = computed(() => {
    return this.paymentMovements().reduce((sum, m) => sum + m.amount, 0);
  });

  totalChange = computed(() => {
    return this.changeMovements().reduce((sum, m) => sum + m.amount, 0);
  });

  totalManualIncome = computed(() => {
    return this.manualMovements()
      .filter((m) => m.type === 'Income' || m.type === 'income')
      .reduce((sum, m) => sum + m.amount, 0);
  });

  totalManualOutcome = computed(() => {
    return this.manualMovements()
      .filter((m) => m.type === 'Outcome' || m.type === 'outcome')
      .reduce((sum, m) => sum + m.amount, 0);
  });

  // Legacy signal for export compatibility
  otherMovements = signal<CashMovementDto[]>([]);

  ngOnInit(): void {
    const me = this.auth.me();
    this.tenantId.set(me?.tenantId || '');
    this.drawerId.set(this.route.snapshot.paramMap.get('drawerId') || '');
    this.loadDrawer();
  }

  private loadDrawer() {
    const id = this.drawerId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);

    // Use new getCashSession endpoint to get session with movements
    this.cashDrawerService.getCashSession(id).subscribe({
      next: (found) => {
        this.drawer.set(found);
        if (found) {
          // For export compatibility, populate otherMovements with manual movements
          const manualMvmts = (found.movements || []).filter(
            (m) =>
              !m.reason?.startsWith('Payment:') &&
              m.reason !== 'Change' &&
              m.reason !== 'Opening',
          );
          this.otherMovements.set(manualMvmts);
        } else {
          this.error.set('No se encontró la caja solicitada.');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err?.error?.message || 'Error cargando detalle de la caja.',
        );
      },
    });
  }

  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 2,
    }).format(value ?? 0);
  }

  formatMovementReason(reason: string | undefined): string {
    if (!reason) return '-';
    if (reason === 'Opening') return 'Apertura';
    if (reason === 'Change') return 'Cambio/Vuelto';
    if (reason.startsWith('Payment:')) {
      const method = reason.replace('Payment:', '');
      const methodNames: Record<string, string> = {
        Cash: 'Pago efectivo',
        Card: 'Pago tarjeta',
        Nequi: 'Pago Nequi',
        Transfer: 'Pago transferencia',
        Daviplata: 'Pago Daviplata',
      };
      return methodNames[method] || `Pago ${method}`;
    }
    return reason;
  }

  getMovementBadgeClass(movement: CashMovementDto): string {
    if (movement.reason?.startsWith('Payment:')) return 'badge-info';
    if (movement.reason === 'Change') return 'badge-warning';
    if (movement.reason === 'Opening') return 'badge-neutral';
    return movement.type === 'Income' || movement.type === 'income'
      ? 'badge-success'
      : 'badge-error';
  }

  getMovementTypeLabel(movement: CashMovementDto): string {
    if (movement.reason?.startsWith('Payment:')) return 'Pago';
    if (movement.reason === 'Change') return 'Cambio';
    if (movement.reason === 'Opening') return 'Apertura';
    return movement.type === 'Income' || movement.type === 'income'
      ? 'Ingreso'
      : 'Egreso';
  }

  // ===== Export helpers =====
  private escapeCsv(value: any): string {
    if (value === null || value === undefined) return '""';
    const str = String(value);
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private downloadCsv(filename: string, headers: string[], rows: string[][]) {
    const headerLine = headers.map((h) => this.escapeCsv(h)).join(',');
    const bodyLines = rows
      .map((r) => r.map((v) => this.escapeCsv(v)).join(','))
      .join('\n');
    const csv = `${headerLine}\n${bodyLines}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  exportSalesCsv() {
    const rows = (this.paymentMovements() || []).map((m) => [
      this.formatDateLocal(m.createdAt),
      this.formatMovementReason(m.reason),
      (m.amount ?? 0).toString(),
      m.reference || '',
    ]);
    this.downloadCsv(
      'pagos.csv',
      ['Fecha', 'Método', 'Monto', 'Referencia'],
      rows,
    );
  }

  exportOtherMovementsCsv() {
    const rows = (this.otherMovements() || []).map((m) => [
      this.formatDateLocal(m.createdAt),
      m.type === 'Income' || m.type === 'income' ? 'Ingreso' : 'Egreso',
      m.reason || m.concept || '',
      (m.amount ?? 0).toString(),
      m.reference || m.orderId || '',
    ]);
    this.downloadCsv(
      'otros-movimientos.csv',
      ['Fecha', 'Tipo', 'Motivo', 'Monto', 'Referencia'],
      rows,
    );
  }

  // ===== Excel (XLSX) export =====
  exportSalesExcel() {
    const headers = ['Fecha', 'Método', 'Monto', 'Referencia'];
    const rows = (this.paymentMovements() || []).map((m) => [
      m.createdAt ? new Date(m.createdAt) : '',
      this.formatMovementReason(m.reason),
      m.amount ?? 0,
      m.reference || '',
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Apply native date and currency formats (date col 0, currency col 2)
    this.applyExcelFormats(worksheet, { dateColIndex: 0, currencyColIndex: 2 });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pagos');
    XLSX.writeFile(workbook, 'pagos.xlsx');
  }

  exportOtherMovementsExcel() {
    const headers = ['Fecha', 'Tipo', 'Motivo', 'Monto', 'Referencia'];
    const rows = (this.otherMovements() || []).map((m) => [
      m.createdAt ? new Date(m.createdAt) : '',
      m.type === 'Income' || m.type === 'income' ? 'Ingreso' : 'Egreso',
      m.reason || m.concept || '',
      m.amount ?? 0,
      m.reference || m.orderId || '',
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Apply native date and currency formats (date col 0, currency col 3)
    this.applyExcelFormats(worksheet, { dateColIndex: 0, currencyColIndex: 3 });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Otros');
    XLSX.writeFile(workbook, 'otros-movimientos.xlsx');
  }

  private excelDateSerial(d: Date): number {
    // Excel serial date number (days since 1899-12-30)
    const epoch = Date.UTC(1899, 11, 30);
    return (d.getTime() - epoch) / (24 * 60 * 60 * 1000);
  }

  private applyExcelFormats(
    ws: XLSX.WorkSheet,
    opts: { dateColIndex: number; currencyColIndex: number },
  ) {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    // Start from row after header
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      // Date column
      const dAddr = XLSX.utils.encode_cell({ c: opts.dateColIndex, r });
      const dCell = ws[dAddr];
      if (dCell && dCell.v) {
        const d = new Date(dCell.v);
        if (!isNaN(d.getTime())) {
          ws[dAddr] = {
            t: 'n',
            v: this.excelDateSerial(d),
            z: 'dd/mm/yyyy hh:mm',
          } as any;
        }
      }
      // Currency column
      const cAddr = XLSX.utils.encode_cell({ c: opts.currencyColIndex, r });
      const cCell = ws[cAddr];
      if (cCell) {
        const num =
          typeof cCell.v === 'number' ? cCell.v : parseFloat(cCell.v || '0');
        ws[cAddr] = {
          t: 'n',
          v: isNaN(num) ? 0 : num,
          z: '"$"#,##0.00',
        } as any;
      }
    }
  }

  private formatDateLocal(value: string | Date | undefined | null): string {
    if (!value) return '';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(d.getTime())) return '';
    // Format as DD/MM/YYYY HH:mm (24h) in local time
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    return `${pad(d.getDate())}/${pad(
      d.getMonth() + 1,
    )}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
