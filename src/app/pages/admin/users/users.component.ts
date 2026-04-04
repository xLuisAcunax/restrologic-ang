import { Component, inject, OnInit, signal, effect } from '@angular/core';

import { UserService } from '../../../core/services/user.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  BranchSummary,
  BusinessService,
} from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { Dialog } from '@angular/cdk/dialog';
import { AddUserComponent } from '../../../shared/components/users/add-user/add-user.component';
import { RoleService } from '../../../core/services/role.service';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId?: string;
  userName: string;
  isActive: boolean;
}

@Component({
  selector: 'app-users',
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './users.component.html',
})
export class UsersComponent implements OnInit {
  branch = signal<BranchSummary | null>(null);
  users = signal<User[]>([]);
  roles = signal<any[]>([]);

  private dialog = inject(Dialog);
  private userService = inject(UserService);
  private roleService = inject(RoleService);
  private branchSelectionService = inject(BranchSelectionService);

  constructor() {
    // Effect para reaccionar a cambios en la selección de sucursal
    effect(() => {
      const branch = this.branchSelectionService.selectedBranch();
      if (branch) {
        this.loadUsers(branch.id);
      }
    });
  }

  ngOnInit(): void {
    this.loadBranch();
    this.loadRoles();
  }

  loadUsers(branchId: string) {
    this.userService.getBranchUsers(branchId).subscribe((users) => {
      this.users.set(users);
    });
  }

  showCreateUserModal(user?: User) {
    if (!this.branch()) return;

    const dialogRef = this.dialog.open(AddUserComponent, {
      width: '700px',
      maxWidth: '95vw',
      panelClass: 'full-screen-modal',
      autoFocus: false,
      data: {
        branch: this.branch(),
        user: user,
      },
    });
    dialogRef.closed.subscribe((result) => {
      if (result === 'Confirmed' && this.branch()?.id) {
        this.loadUsers(this.branch()!.id);
      }
    });
  }

  loadBranch() {
    const branch = this.branchSelectionService.selectedBranch();
    this.branch.set(branch);
  }

  deleteUser(user: User) {
    if (!confirm(`¿Está seguro de eliminar el usuario "${user.userName}"?`))
      return;

    this.userService.deleteUser(user.id).subscribe(() => {
      if (this.branch()?.id) {
        this.loadUsers(this.branch()!.id);
      }
    });
  }

  loadRoles() {
    this.roleService.getRoles().subscribe((roles) => {
      this.roles.set(roles);
    });
  }

  getRoleName(roleId?: string): string {
    if (!roleId) return 'Sin rol';
    const role = this.roles().find((r) => r.id === roleId);
    return role ? role.name : roleId;
  }
}
