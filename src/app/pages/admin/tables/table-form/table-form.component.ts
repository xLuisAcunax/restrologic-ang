import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { AuthService } from '../../../../core/services/auth.service';
import {
  CreateTableDto,
  Table,
  TableService,
  UpdateTableDto,
} from '../../../../core/services/table.service';

@Component({
  selector: 'app-table-form',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './table-form.component.html',
})
export class TableFormComponent implements OnInit {
  me = inject(AuthService).me;
  tableService = inject(TableService);

  form = new FormBuilder().group({
    name: [''],
    description: [''],
    capacity: [0],
    status: [0, Validators.required],
  });

  constructor(
    public dialogRef: DialogRef<string>,
    @Inject(DIALOG_DATA)
    public data: {
      tenantId: string;
      branchId?: string;
      table?: Table;
    },
  ) {}

  ngOnInit(): void {
    if (this.data.table) {
      // Convert status to number if it's a string
      let statusValue = this.data.table.status || 0;
      if (typeof statusValue === 'string') {
        const statusMap: Record<string, number> = {
          Free: 0,
          Occupied: 1,
          Reserved: 2,
          Cleaning: 3,
          Disabled: 4,
        };
        statusValue = statusMap[statusValue] ?? 0;
      }
      this.form.patchValue({
        name: this.data.table.name || '',
        description: this.data.table.description || '',
        status: statusValue,
        capacity: this.data.table.capacity || 0,
      });
    }
  }

  onSaving() {
    if (!this.data.branchId) return;

    // At least one field must be provided
    if (!this.form.value.name && !this.form.value.capacity) {
      return;
    }

    const request$ = this.data.table
      ? this.tableService.updateTable(
          this.mapTableToUpdateDto(),
          this.data.table.id,
        )
      : this.tableService.createTable(this.mapTableToCreateDto());

    request$.subscribe(() => this.dialogRef.close('Confirmed'));
  }

  private mapTableToCreateDto(): CreateTableDto {
    return {
      branchId: this.data.branchId || '',
      name: this.form.value.name || undefined,
      description: this.form.value.description || undefined,
      capacity: this.form.value.capacity || 0,
      createdBy: this.me()?.id || '',
    };
  }

  private mapTableToUpdateDto(): UpdateTableDto {
    return {
      id: this.data.table?.id || '',
      name: this.form.value.name || '',
      description: this.form.value.description || '',
      status: this.form.value.status ?? 0,
      capacity: this.form.value.capacity || 0,
      isActive: this.data.table?.isActive || true,
    };
  }
}
