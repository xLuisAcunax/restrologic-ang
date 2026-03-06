import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private socket?: Socket;
  private connected$ = new BehaviorSubject<boolean>(false);
  private lastError$ = new BehaviorSubject<string | null>(null);
}
