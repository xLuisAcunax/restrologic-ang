import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly base = environment.apiBaseUrl;

  http = inject(HttpClient);

  getRoles() {
    return this.http.get<any[]>(`${this.base}/Roles`);
  }
}
