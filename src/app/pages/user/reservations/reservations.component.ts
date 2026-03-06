import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocalDateTimePipe } from '../../../shared/pipes/local-datetime.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import {
  BusinessService,
  BranchSummary,
} from '../../../core/services/business.service';
import {
  TableService,
  Table,
  Reservation,
  ReservationStatus,
} from '../../../core/services/table.service';

@Component({
  selector: 'app-user-reservations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reservations.component.html',
})
export class UserReservationsComponent implements OnInit {
  private auth = inject(AuthService);
  private branchSelection = inject(BranchSelectionService);
  private businessService = inject(BusinessService);
  private tableService = inject(TableService);

  tenantId = signal<string>('');
  branches = signal<BranchSummary[]>([]);
  tables = signal<Table[]>([]);
  reservations = signal<Reservation[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  // Filters
  filterDate = signal<string>(''); // yyyy-mm-dd
  filterStatus = signal<ReservationStatus | ''>('');
  filterTableId = signal<string>('');

  // Create form
  showCreate = signal<boolean>(false);
  createCustomerName = signal<string>('');
  createReservationTime = signal<string>(''); // datetime-local
  createPartySize = signal<number>(2);
  createCustomerPhone = signal<string>('');
  createCustomerEmail = signal<string>('');
  createNotes = signal<string>('');
  createSubmitting = signal<boolean>(false);
  createError = signal<string | null>(null);

  // Edit form (reuses create* fields)
  showEdit = signal<boolean>(false);
  editingId = signal<string | null>(null);
  editingTableId = signal<string | null>(null);
  editSubmitting = signal<boolean>(false);
  editError = signal<string | null>(null);

  ngOnInit(): void {
    const user = this.auth.me();
    this.tenantId.set(user?.tenantId || '');
    if (this.tenantId()) {
      this.loadBranches(this.tenantId());
    }
    // default date = today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    this.filterDate.set(`${yyyy}-${mm}-${dd}`);
  }

  private loadBranches(tenantId: string) {
    const user = this.auth.me();
    const isAdminLike = (this.auth.getRole() || []).some((r) =>
      ['Admin', 'Super'].includes(String(r).toUpperCase())
    );
    if (!isAdminLike && user?.branchId) {
      this.businessService.getBranch(user.branchId).subscribe((res) => {
        this.branches.set([res]);
        this.branchSelection.setSelectedBranchId(user.branchId!);
        this.loadTablesAndReservations(user.branchId!);
      });
      return;
    }
    this.businessService.getBranches().subscribe((res) => {
      const list = res || [];
      this.branches.set(list);
      if (list.length > 0) {
        const stored = this.branchSelection.selectedBranchId();
        const initial =
          stored && list.some((b) => b.id === stored) ? stored : list[0].id;
        if (!stored || stored !== initial)
          this.branchSelection.setSelectedBranchId(initial);
        this.loadTablesAndReservations(initial);
      }
    });
  }

  private loadTablesAndReservations(branchId: string) {
    if (!this.tenantId() || !branchId) return;
    this.tableService.getTables(branchId).subscribe((res) => {
      this.tables.set(res || []);
      this.fetchReservations();
    });
  }

  fetchReservations() {
    const branchId = this.branchSelection.getEffectiveBranchId();
    if (!this.tenantId() || !branchId) return;
    this.loading.set(true);
    this.error.set(null);
    // No enviamos 'date' para evitar pérdida de reservas que cruzan medianoche UTC.
    this.tableService
      .listReservations(this.tenantId(), branchId, {
        status: (this.filterStatus() || undefined) as
          | ReservationStatus
          | undefined,
        tableId: this.filterTableId() || undefined,
      })
      .subscribe({
        next: (res) => {
          let list = res.data || [];
          const filterDate = this.filterDate();
          if (filterDate) {
            const [y, m, d] = filterDate.split('-').map(Number);
            list = list.filter((r) => {
              const dt = new Date(r.reservationTime);
              return (
                dt.getFullYear() === y &&
                dt.getMonth() + 1 === m &&
                dt.getDate() === d
              );
            });
          }
          this.reservations.set(list);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Error fetching reservations', err);
          this.error.set('No se pudieron cargar las reservas');
          this.loading.set(false);
        },
      });
  }

  openCreate() {
    this.resetCreateForm();
    this.showCreate.set(true);
  }
  closeCreate() {
    this.showCreate.set(false);
  }

  resetCreateForm() {
    this.createCustomerName.set('');
    this.createReservationTime.set('');
    this.createPartySize.set(2);
    this.createCustomerPhone.set('');
    this.createCustomerEmail.set('');
    this.createNotes.set('');
    this.createError.set(null);
  }

  // ===== Edit Reservation =====
  openEdit(r: Reservation) {
    this.editingId.set(r.id);
    this.editingTableId.set(r.tableId);
    this.createCustomerName.set(r.customerName || '');
    this.createCustomerPhone.set(r.customerPhone || '');
    this.createCustomerEmail.set(r.customerEmail || '');
    this.createPartySize.set(r.partySize || 2);
    this.createNotes.set(r.notes || '');
    this.createReservationTime.set(this.isoToLocalInput(r.reservationTime));
    this.editError.set(null);
    this.showEdit.set(true);
  }
  closeEdit() {
    this.showEdit.set(false);
    this.editingId.set(null);
    this.editingTableId.set(null);
  }

  submitCreate() {
    const tenantId = this.tenantId();
    const branchId = this.branchSelection.getEffectiveBranchId();
    const tableId =
      this.filterTableId() || (this.tables().length ? this.tables()[0].id : '');
    if (!tenantId || !branchId || !tableId) {
      this.createError.set('Faltan datos de contexto');
      return;
    }
    const name = this.createCustomerName().trim();
    const time = this.createReservationTime().trim();
    const party = this.createPartySize();
    if (!name || !time) {
      this.createError.set('Nombre y hora son requeridos');
      return;
    }
    // Interpret datetime-local as local time and convert to ISO (UTC)
    const parsed = new Date(time);
    if (isNaN(parsed.getTime())) {
      this.createError.set('Fecha y hora inválidas');
      return;
    }
    const now = new Date();
    // Only block if the selected time is in the past
    if (parsed.getTime() < now.getTime()) {
      this.createError.set('La hora de reserva no puede ser en el pasado');
      return;
    }
    if (party < 1) {
      this.createError.set('Número de personas inválido');
      return;
    }
    this.createSubmitting.set(true);
    this.createError.set(null);
    const dto: any = {
      customerName: name,
      reservationTime: parsed.toISOString(),
      partySize: party,
    };
    if (this.createCustomerPhone().trim())
      dto.customerPhone = this.createCustomerPhone().trim();
    if (this.createCustomerEmail().trim())
      dto.customerEmail = this.createCustomerEmail().trim();
    if (this.createNotes().trim()) dto.notes = this.createNotes().trim();
    this.tableService
      .createReservation(tenantId, branchId, tableId, dto)
      .subscribe({
        next: (res) => {
          this.createSubmitting.set(false);
          this.showCreate.set(false);
          this.fetchReservations();
        },
        error: (err) => {
          console.error('Error creating reservation', err);
          this.createError.set('No se pudo crear la reserva');
          this.createSubmitting.set(false);
        },
      });
  }

  submitEdit() {
    const tenantId = this.tenantId();
    const branchId = this.branchSelection.getEffectiveBranchId();
    const id = this.editingId();
    if (!tenantId || !branchId || !id) {
      this.editError.set('Faltan datos de contexto');
      return;
    }
    const name = this.createCustomerName().trim();
    const time = this.createReservationTime().trim();
    const party = this.createPartySize();
    if (!name || !time) {
      this.editError.set('Nombre y hora son requeridos');
      return;
    }
    const parsed = new Date(time);
    if (isNaN(parsed.getTime())) {
      this.editError.set('Fecha y hora inválidas');
      return;
    }
    const now = new Date();
    if (parsed.getTime() < now.getTime()) {
      this.editError.set('La hora de reserva no puede ser en el pasado');
      return;
    }
    if (party < 1) {
      this.editError.set('Número de personas inválido');
      return;
    }
    this.editSubmitting.set(true);
    this.editError.set(null);
    const dto: any = {
      customerName: name,
      reservationTime: parsed.toISOString(),
      partySize: party,
      customerPhone: this.createCustomerPhone().trim() || null,
      customerEmail: this.createCustomerEmail().trim() || null,
      notes: this.createNotes().trim() || null,
    };
    this.tableService.updateReservation(tenantId, branchId, id, dto).subscribe({
      next: () => {
        this.editSubmitting.set(false);
        this.showEdit.set(false);
        this.editingId.set(null);
        this.fetchReservations();
      },
      error: (err) => {
        console.error('Error updating reservation', err);
        this.editError.set('No se pudo actualizar la reserva');
        this.editSubmitting.set(false);
      },
    });
  }

  cancelReservation(r: Reservation) {
    const tenantId = this.tenantId();
    const branchId = this.branchSelection.getEffectiveBranchId();
    if (!tenantId || !branchId) return;
    const ok = window.confirm('¿Cancelar esta reserva?');
    if (!ok) return;
    this.tableService.cancelReservation(tenantId, branchId, r.id).subscribe({
      next: () => this.fetchReservations(),
      error: (err) => {
        console.error('Error cancelling reservation', err);
        alert('No se pudo cancelar la reserva');
      },
    });
  }

  // Cancela la reserva actualmente abierta en el modal de edición
  cancelEditingReservation() {
    const tenantId = this.tenantId();
    const branchId = this.branchSelection.getEffectiveBranchId();
    const id = this.editingId();
    if (!tenantId || !branchId || !id) return;
    const ok = window.confirm('¿Cancelar esta reserva?');
    if (!ok) return;
    this.tableService.cancelReservation(tenantId, branchId, id).subscribe({
      next: () => {
        this.showEdit.set(false);
        this.editingId.set(null);
        this.fetchReservations();
      },
      error: (err) => {
        console.error('Error cancelling reservation', err);
        alert('No se pudo cancelar la reserva');
      },
    });
  }

  // LocalDateTimePipe now handles formatting in the template.

  getTableName(tableId: string): string {
    if (!tableId) return '';
    for (const t of this.tables()) {
      if (t.id === tableId) {
        return t.name!.trim() || 'Mesa sin nombre';
      }
    }
    return tableId;
  }

  private isoToLocalInput(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }
}
