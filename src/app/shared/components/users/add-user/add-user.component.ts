import {
  Component,
  Inject,
  inject,
  OnInit,
  signal,
  DestroyRef,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { UserService } from '../../../../core/services/user.service';
import { BranchSummary } from '../../../../core/services/business.service';

import { CreateUserDto, User } from '../../../../core/models/user.model';
import { RoleService } from '../../../../core/services/role.service';
import { switchMap, of, finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'add-user',
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './add-user.component.html',
})
export class AddUserComponent implements OnInit {
  me = inject(AuthService).me;
  userService = inject(UserService);
  roleService = inject(RoleService);
  authService = inject(AuthService);
  destroyRef = inject(DestroyRef);
  roles = signal<any[]>([]);
  branch = signal<BranchSummary | null>(null);

  form = new FormBuilder().group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    password: [''], // Make password optional, will be required conditionally
    email: [''],
    branchId: ['', Validators.required],
    tenantId: [this.me()?.tenantId || '', Validators.required],
    role: ['', Validators.required],
    userName: ['', Validators.required],
  });

  constructor(
    public dialogRef: DialogRef<string>, // Specify the return type when closing
    @Inject(DIALOG_DATA)
    public data: { branch: BranchSummary; user?: User }
  ) {
    if (data?.branch) this.branch.set(data.branch);
    this.roleService.getRoles()?.subscribe((roles) => {
      this.roles.set(roles);
    });

    // If creating a new user, password is required
    if (!data?.user) {
      this.form.get('password')?.setValidators([Validators.required]);
    }

    // If editing, populate the form with user data
    if (data?.user) {
      this.form.patchValue({
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.email || '',
        password: '', // Don't prefill password for security
        role: data.user.roleId,
        userName: data.user.userName,
      });
    }
  }

  ngOnInit() {
    const branchControl = this.form.get('branchId');
    if (this.data.branch) {
      // Only set branchId if not already set by user data
      if (!this.data.user) {
        branchControl?.setValue(this.data.branch.id);
      }
      if (this.branch()) {
        branchControl?.disable();
      }
    }
  }

  onSaving() {
    if (!this.form.valid) {
      return;
    }

    this.form.value['branchId'] = this.data.branch.id;

    const operation$ = this.data.user
      ? this.handleUserUpdate()
      : this.handleUserCreation();

    operation$
      .pipe(
        finalize(() => this.dialogRef.close('Confirmed')),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () =>
          console.log(
            this.data.user
              ? 'User updated successfully'
              : 'User created successfully'
          ),
        error: (err) => this.handleError(err),
      });
  }

  private handleUserCreation() {
    return this.userService.createUser(this.mapUserToDto(this.form)).pipe(
      switchMap((user) =>
        this.userService.assignUserToBranch(this.data.branch!.id, {
          tenantId: this.me()?.tenantId!,
          userId: user.userId,
          roleId: this.form.value.role!,
        })
      )
    );
  }

  private handleUserUpdate() {
    const updateDto = this.buildUpdateDto();
    const branchId = this.branch()?.id;

    if (!branchId) {
      throw new Error('Branch ID is required');
    }

    return this.resetPasswordIfNeeded(updateDto).pipe(
      switchMap(() =>
        this.authService.updateUser(this.data.user!.id, updateDto)
      ),
      switchMap(() =>
        this.userService.updateUser(branchId, this.data.user!.id, updateDto)
      )
    );
  }

  private resetPasswordIfNeeded(updateDto: Partial<CreateUserDto>) {
    if (!this.form.value.password) {
      return of(null);
    }

    updateDto.password = this.form.value.password;
    return this.authService.resetPassword(
      this.data.user!.id,
      this.form.value.password
    );
  }

  private buildUpdateDto(): Partial<CreateUserDto> {
    return {
      firstName: this.form.value.firstName!,
      lastName: this.form.value.lastName!,
      email: this.form.value.email || '',
      roleId: this.form.value.role!,
      isActive: true,
    };
  }

  private handleError(error: any) {
    console.error('Operation failed:', error);
    const message = this.data.user
      ? 'Error al actualizar el usuario'
      : 'Error al crear el usuario';
    alert(message);
  }

  mapUserToDto(form: FormGroup): CreateUserDto {
    return {
      firstName: form.value.firstName,
      lastName: form.value.lastName,
      email: form.value.email,
      password: form.value.password,
      isActive: true,
      roleId: form.value.role,
      createdBy: this.me()?.id,
      branchId: form.value.branchId,
      tenantId: form.value.tenantId,
    } as CreateUserDto;
  }
}
