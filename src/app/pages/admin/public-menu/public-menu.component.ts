import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import {
  BranchSummary,
  BusinessService,
} from '../../../core/services/business.service';
import { PublicUrlHelper } from '../../../shared/utils/public-url.helper';

@Component({
  selector: 'app-public-menu-links',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './public-menu.component.html',
})
export class PublicMenuComponent implements OnInit {
  private auth = inject(AuthService);
  private business = inject(BusinessService);

  branches = signal<BranchSummary[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  // QR Modal state
  qrModalOpen = signal(false);
  qrBranch = signal<BranchSummary | null>(null);
  qrUrl = signal('');
  qrImageUrl = computed(() => {
    const url = this.qrUrl();
    if (!url) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
  });

  readonly tenantId = this.auth.me()?.tenantId ?? '';

  buildUrl = (branchId: string) =>
    PublicUrlHelper.buildMenuUrl(this.tenantId, branchId);

  ngOnInit(): void {
    this.business.getBranches().subscribe({
      next: (res) => {
        this.branches.set(res || []);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading branches', err);
        this.error.set('No se pudieron cargar las sucursales.');
        this.loading.set(false);
      },
    });
  }

  generateMenuUrl(branch: any): string {
    // Ajusta esta lógica a como construyes tu URL real
    // Ejemplo basado en tu imagen:
    const baseUrl = window.location.origin; // O tu dominio fijo
    return `${baseUrl}/menu?tenantId=${this.tenantId}&branchId=${branch.id}`;
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      // Aquí puedes mostrar un Toast de "Copiado!" si tienes un servicio de alertas
      // alert('Enlace copiado al portapapeles');
    });
  }

  openQrModal(branch: BranchSummary) {
    const url = this.generateMenuUrl(branch);
    this.qrBranch.set(branch);
    this.qrUrl.set(url);
    this.qrModalOpen.set(true);
  }

  closeQrModal() {
    this.qrModalOpen.set(false);
    this.qrBranch.set(null);
    this.qrUrl.set('');
  }

  printQr() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const branch = this.qrBranch();
    const branchName = branch?.name || 'Menú';
    const qrImageUrl = this.qrImageUrl();
    const menuUrl = this.qrUrl();

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Código QR - ${branchName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 2rem;
            text-align: center;
          }
          .title {
            font-size: 1.5rem;
            font-weight: bold;
            margin-bottom: 0.5rem;
          }
          .subtitle {
            color: #666;
            font-size: 0.9rem;
            margin-bottom: 2rem;
          }
          .qr-container {
            padding: 1.5rem;
            border: 2px solid #eee;
            border-radius: 1rem;
            background: white;
          }
          .qr-image {
            width: 250px;
            height: 250px;
          }
          .url {
            margin-top: 1.5rem;
            font-size: 0.75rem;
            color: #888;
            word-break: break-all;
            max-width: 300px;
          }
          @media print {
            body { padding: 1rem; }
          }
        </style>
      </head>
      <body>
        <div class="title">${branchName}</div>
        <div class="subtitle">Escanea para ver el menú</div>
        <div class="qr-container">
          <img src="${qrImageUrl}" alt="Código QR" class="qr-image" />
        </div>
        <div class="url">${menuUrl}</div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
}
