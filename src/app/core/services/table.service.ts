import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { TableStatusEnum } from '../enums/table-status.enum';

export type Waiter = {
  id: string;
  name: string;
};

export type Table = {
  id: string;
  capacity?: number | null; // optional numeric identifier
  name?: string | null; // optional display name
  description: string | null; // optional description
  isActive: boolean;
  status: TableStatusEnum | string; // Can be number or string from backend
  // occupiedBy?: Waiter | null; // waiter attending the table when occupied
  locked?: boolean; // Temporal: true if someone is currently viewing/editing
  // lockedBy?: { userId: string; userName: string } | null; // Who has the lock
  // // Reservation metadata (enriched client-side)
  // reservationCustomerName?: string;
  // reservationTime?: string; // ISO string
};

export type CreateTableDto = {
  branchId: string;
  name?: string;
  description?: string;
  capacity?: number;
  createdBy?: string;
};

export type UpdateTableDto = {
  capacity: number;
  id: string;
  name: string;
  description: string;
  status: TableStatusEnum;
  isActive: boolean;
};

// ===== Reservations Types =====
export type ReservationStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type Reservation = {
  id: string;
  tableId: string;
  tenantId: string;
  branchId: string;
  customerName: string;
  reservationTime: string; // ISO string
  partySize: number;
  customerPhone?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  status: ReservationStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateReservationDto = {
  customerName: string;
  reservationTime: string; // ISO datetime
  partySize: number; // >=1
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
};

export type UpdateReservationDto = Partial<{
  customerName: string;
  reservationTime: string;
  partySize: number;
  customerPhone: string | null;
  customerEmail: string | null;
  notes: string | null;
  status: ReservationStatus;
}>;

export type ReservationListResponse = { ok: boolean; data: Reservation[] };
export type ReservationResponse = { ok: boolean; data: Reservation };

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly base = environment.apiBaseUrl;
  http = inject(HttpClient);

  getTables(branchId: string) {
    return this.http.get<Table[]>(`${this.base}/Tables`, {
      params: new HttpParams().set('branchId', branchId),
    });
  }

  createTable(dto: CreateTableDto) {
    return this.http.post<{ ok: boolean; data: Table }>(
      `${this.base}/Tables?branchId=${dto.branchId}`,
      dto,
    );
  }

  updateTable(dto: UpdateTableDto, tableId: string) {
    return this.http.put<{ ok: boolean; data: Table }>(
      `${this.base}/Tables/${tableId}`,
      dto,
    );
  }

  /**
   * Update table status using the new API endpoint
   */
  updateTableStatus(
    tenantId: string,
    branchId: string,
    tableId: string,
    status: TableStatusEnum,
  ) {
    return this.http.patch<{ ok: boolean; data: Table }>(
      `${this.base}/Tables/${tableId}`,
      { status },
    );
  }

  deleteTable(tenantId: string, branchId: string, tableId: string) {
    return this.http.delete(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/table/${tableId}`,
    );
  }

  // ===== Reservations API =====
  createReservation(
    tenantId: string,
    branchId: string,
    tableId: string,
    dto: CreateReservationDto,
  ) {
    return this.http.post<ReservationResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/table/${tableId}/reservation`,
      dto,
    );
  }

  listReservations(
    tenantId: string,
    branchId: string,
    filters?: { date?: string; status?: ReservationStatus; tableId?: string },
  ) {
    let params = new HttpParams();
    if (filters?.date) params = params.set('date', filters.date);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.tableId) params = params.set('tableId', filters.tableId);
    return this.http.get<ReservationListResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/reservation`,
      { params },
    );
  }

  getReservationById(
    tenantId: string,
    branchId: string,
    reservationId: string,
  ) {
    return this.http.get<ReservationResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/reservation/${reservationId}`,
    );
  }

  updateReservation(
    tenantId: string,
    branchId: string,
    reservationId: string,
    dto: UpdateReservationDto,
  ) {
    return this.http.put<ReservationResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/reservation/${reservationId}`,
      dto,
    );
  }

  cancelReservation(tenantId: string, branchId: string, reservationId: string) {
    return this.http.delete<ReservationResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/reservation/${reservationId}`,
      {},
    );
  }
}
