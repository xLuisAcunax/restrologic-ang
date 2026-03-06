import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AssignUserDto,
  CreateUserDto,
  User,
  UserDto,
} from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly base = environment.apiBaseUrl;

  http = inject(HttpClient);

  getUsers() {
    return this.http.get<User[]>(`${this.base}/users`);
  }

  getBranchUsers(branchId: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.base}/branches/${branchId}/users`);
  }

  getUserById(userId: string): Observable<{ ok: boolean; data: any } | any> {
    return this.http.get<{ ok: boolean; data: any } | any>(
      `${this.base}/users/${userId}`
    );
  }

  createUser(dto: CreateUserDto): Observable<any> {
    return this.http.post<{ message: string; UserId: string }>(
      `${this.base}/Auth/register`,
      dto
    );
  }

  assignUserToBranch(
    branchId: string,
    dto: Partial<AssignUserDto>
  ): Observable<any> {
    return this.http.post<any>(`${this.base}/branches/${branchId}/users`, dto);
  }

  updateUser(
    branchId: string,
    userId: string,
    dto: Partial<CreateUserDto>
  ): Observable<any> {
    return this.http.put<any>(
      `${this.base}/branches/${branchId}/users/${userId}`,
      dto
    );
  }

  deleteUser(userId: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/users/${userId}`);
  }

  // map User to UserDto and flatten roles by branchId
  mapToUserDto(user: User): UserDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      createdAt: user.createdAt,
      createdBy: user.createdBy,
      isActive: user.isActive,
      roleId: user.roleId!,
      userName: user.userName,
    };
  }

  mapToUserDtoArray(users: User[]): UserDto[] {
    return users.map((u) => this.mapToUserDto(u));
  }
}
