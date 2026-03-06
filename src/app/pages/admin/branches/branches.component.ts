import { Component, inject, OnInit, signal } from '@angular/core';
import {
  BranchSummary,
  BusinessService,
} from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { Dialog } from '@angular/cdk/dialog';
import { BranchFormComponent } from './branch-form/branch-form.component';

@Component({
  selector: 'app-branches',
  imports: [],
  templateUrl: './branches.component.html',
})
export class BranchesComponent implements OnInit {
  branches = signal<BranchSummary[]>([]);
  total = signal(0);
  viewMode = signal<'table' | 'cards'>('cards');
  search = signal('');
  tenantService = inject(BusinessService);
  authService = inject(AuthService);
  private dialog = inject(Dialog);
  me = this.authService.me();

  setViewModeFromEvent(event: Event) {
    const select = event.target as HTMLSelectElement | null;
    if (select) {
      this.viewMode.set(select.value as 'cards' | 'table');
    }
  }

  ngOnInit(): void {
    this.load();
  }

  get filteredBranches() {
    const q = this.search().toLowerCase().trim();
    if (!q) return this.branches();
    return this.branches().filter((b) => {
      return `${b.name} ${b.isActive || ''}`.toLowerCase().includes(q);
    });
  }

  async showModal(branch: any) {
    const dialogRef = this.dialog.open(BranchFormComponent, {
      width: '500px',
      maxWidth: '95vw',
      panelClass: 'full-screen-modal', // La clase que elimina paddings
      autoFocus: false,
      data: { branch: branch },
    });

    dialogRef.closed.subscribe((result) => {
      console.log('Dialog closed with:', result);
      this.load();
    });
  }

  load() {
    this.tenantService.getBranches().subscribe((res) => {
      this.branches.set(res);
    });
  }
}
