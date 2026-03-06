export interface LoggedUser {
  id: string;
  fullName: string;
  email?: string;
  roles: string[];
  tenantId: string;
  branchId?: string;
  isSuper: boolean;
}

export type CreateUserDto = {
  firstName: string;
  lastName: string;
  email?: string;
  password: string;
  isActive: boolean;
  createdBy?: string;
  roleId: string;
  userName?: string;
};

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
  roleId?: string;
  userName: string;
};

export type UserDto = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
  roleId: string;
  userName: string;
};

export type AssignedUser = {
  id?: string;
  name?: string;
  fullName?: string;
  email?: string;
};

export type AssignUserDto = {
  tenantId: string;
  userId: string;
  roleId: string;
};
