import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export type OrderRealtimeEventName =
  | 'OrderCreated'
  | 'OrderUpdated'
  | 'OrderDeleted'
  | 'OrderItemAdded'
  | 'PaymentRegistered'
  | 'TableLocked'
  | 'TableReleased';

export type OrderRealtimeEvent = {
  name: OrderRealtimeEventName;
  orderId?: string;
  branchId?: string;
  tableId?: string;
  payload: any;
};

export type TablePresenceInfo = {
  tableId: string;
  branchId: string;
  tenantId?: string | null;
  locked: boolean;
  lockedAt?: string | null;
  lockedBy: {
    userId: string;
    userName: string;
  } | null;
};

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private connection: HubConnection | null = null;
  private currentBranchId: string | null = null;
  private handlersRegistered = false;
  private startPromise: Promise<void> | null = null;
  private readonly eventsSubject = new Subject<OrderRealtimeEvent>();
  private readonly activeTablePresence = new Map<
    string,
    { branchId: string; tableId: string; userId: string; userName: string }
  >();

  readonly orderEvents$ = this.eventsSubject.asObservable();
  readonly connected = signal(false);
  readonly lastError = signal<string | null>(null);

  async connectToOrdersBranch(branchId: string): Promise<void> {
    if (!branchId) {
      return;
    }

    await this.ensureConnection();

    if (!this.connection) {
      return;
    }

    if (this.currentBranchId && this.currentBranchId !== branchId) {
      await this.leaveBranch(this.currentBranchId);
    }

    if (this.currentBranchId !== branchId) {
      await this.connection.invoke('JoinBranch', branchId);
      this.currentBranchId = branchId;
    }
  }

  async enterTablePresence(
    branchId: string,
    tableId: string,
    userId: string,
    userName: string,
  ): Promise<TablePresenceInfo | null> {
    if (!branchId || !tableId || !userId || !userName) {
      return null;
    }

    await this.connectToOrdersBranch(branchId);

    if (!this.connection) {
      return null;
    }

    const payload = await this.connection.invoke<TablePresenceInfo>(
      'EnterTable',
      branchId,
      tableId,
      userId,
      userName,
    );

    this.activeTablePresence.set(`${branchId}:${tableId}`, {
      branchId,
      tableId,
      userId,
      userName,
    });

    return payload ?? null;
  }

  async leaveTablePresence(
    branchId: string,
    tableId: string,
    userId: string,
  ): Promise<void> {
    if (!branchId || !tableId || !userId) {
      return;
    }

    this.activeTablePresence.delete(`${branchId}:${tableId}`);

    if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
      return;
    }

    try {
      await this.connection.invoke('LeaveTable', branchId, tableId, userId);
    } catch {}
  }

  async getActiveTableLocks(branchId: string): Promise<TablePresenceInfo[]> {
    if (!branchId) {
      return [];
    }

    await this.connectToOrdersBranch(branchId);

    if (!this.connection) {
      return [];
    }

    try {
      const locks = await this.connection.invoke<TablePresenceInfo[]>(
        'GetActiveTableLocks',
        branchId,
      );
      return Array.isArray(locks) ? locks : [];
    } catch {
      return [];
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection) {
      this.connected.set(false);
      this.currentBranchId = null;
      return;
    }

    try {
      if (this.currentBranchId) {
        await this.leaveBranch(this.currentBranchId);
      }
    } catch {}

    try {
      await this.connection.stop();
    } finally {
      this.connection = null;
      this.currentBranchId = null;
      this.connected.set(false);
    }
  }

  ngOnDestroy(): void {
    void this.disconnect();
  }

  private async ensureConnection(): Promise<void> {
    if (!this.connection) {
      this.connection = new HubConnectionBuilder()
        .withUrl(this.buildOrdersHubUrl(), {
          accessTokenFactory: () => this.auth.token || '',
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000])
        .configureLogging(LogLevel.Warning)
        .build();
    }

    if (!this.handlersRegistered) {
      this.registerHandlers(this.connection);
      this.handlersRegistered = true;
    }

    if (this.connection.state === HubConnectionState.Connected) {
      this.connected.set(true);
      return;
    }

    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = (async () => {
      try {
        await this.connection!.start();
        this.connected.set(true);
        this.lastError.set(null);

        if (this.currentBranchId) {
          await this.connection!.invoke('JoinBranch', this.currentBranchId);
        }

        await this.restoreActiveTablePresence(this.connection!);
      } catch (error: any) {
        this.connected.set(false);
        this.lastError.set(
          error?.message || 'No se pudo iniciar la conexion realtime.',
        );
        throw error;
      } finally {
        this.startPromise = null;
      }
    })();

    await this.startPromise;
  }

  private registerHandlers(connection: HubConnection): void {
    const relay = (name: OrderRealtimeEventName, payload: any) => {
      this.eventsSubject.next({
        name,
        payload,
        orderId: payload?.orderId ?? payload?.OrderId,
        branchId: payload?.branchId ?? payload?.BranchId,
        tableId: payload?.tableId ?? payload?.TableId,
      });
    };

    connection.on('OrderCreated', (payload) => relay('OrderCreated', payload));
    connection.on('OrderUpdated', (payload) => relay('OrderUpdated', payload));
    connection.on('OrderDeleted', (payload) => relay('OrderDeleted', payload));
    connection.on('OrderItemAdded', (payload) => relay('OrderItemAdded', payload));
    connection.on('PaymentRegistered', (payload) =>
      relay('PaymentRegistered', payload),
    );
    connection.on('TableLocked', (payload) => relay('TableLocked', payload));
    connection.on('TableReleased', (payload) => relay('TableReleased', payload));

    connection.onreconnecting((error) => {
      this.connected.set(false);
      this.lastError.set(error?.message || 'Reconectando realtime...');
    });

    connection.onreconnected(async () => {
      this.connected.set(true);
      this.lastError.set(null);
      if (this.currentBranchId) {
        try {
          await connection.invoke('JoinBranch', this.currentBranchId);
          await this.restoreActiveTablePresence(connection);
        } catch (error: any) {
          this.lastError.set(
            error?.message || 'No se pudo restaurar la suscripcion realtime.',
          );
        }
      }
    });

    connection.onclose((error) => {
      this.connected.set(false);
      if (error) {
        this.lastError.set(error.message || 'Conexion realtime cerrada.');
      }
    });
  }

  private async restoreActiveTablePresence(connection: HubConnection): Promise<void> {
    const entries = Array.from(this.activeTablePresence.values());
    for (const entry of entries) {
      try {
        await connection.invoke(
          'EnterTable',
          entry.branchId,
          entry.tableId,
          entry.userId,
          entry.userName,
        );
      } catch {}
    }
  }

  private async leaveBranch(branchId: string): Promise<void> {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
      return;
    }

    try {
      await this.connection.invoke('LeaveBranch', branchId);
    } catch {}
  }

  private buildOrdersHubUrl(): string {
    const apiBaseUrl = environment.apiBaseUrl || '/api';

    if (/^https?:\/\//i.test(apiBaseUrl)) {
      const url = new URL(apiBaseUrl);
      url.pathname = '/hubs/orders';
      url.search = '';
      url.hash = '';
      return url.toString();
    }

    if (typeof window !== 'undefined') {
      return new URL('/hubs/orders', window.location.origin).toString();
    }

    return '/hubs/orders';
  }
}
