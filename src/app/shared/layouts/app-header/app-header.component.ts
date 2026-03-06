import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SidebarService } from '../../services/sidebar.service';
import { UserDropdownComponent } from '../../components/header/user-dropdown/user-dropdown.component';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  BusinessService,
  BranchSummary,
} from '../../../core/services/business.service';
import { OrderNotificationService } from '../../services/order-notification.service';

@Component({
  selector: 'app-header',
  imports: [CommonModule, RouterModule, FormsModule, UserDropdownComponent],
  templateUrl: './app-header.component.html',
})
export class AppHeaderComponent {
  isApplicationMenuOpen = false;
  readonly isMobileOpen$;

  private businessService = inject(BusinessService);
  private authService = inject(AuthService);
  public branchSelectionService = inject(BranchSelectionService);
  private notif = inject(OrderNotificationService);

  branches = signal<BranchSummary[]>([]);
  selectedBranchId = signal<string | null>(null);
  isAdminUser = signal<boolean>(false);
  soundEnabled = computed(() => this.notif.soundEnabled());

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  constructor(public sidebarService: SidebarService) {
    this.isMobileOpen$ = this.sidebarService.isMobileOpen$;

    // Only load branches when user is authenticated
    effect(() => {
      const user = this.authService.me();
      if (!user) return; // Don't load until authenticated

      // Verificar si es usuario admin
      this.isAdminUser.set(this.branchSelectionService.isAdminUser());
      // Si es admin, cargar las sucursales
      if (this.isAdminUser() && this.branches().length === 0) {
        this.loadBranches();
      }
    });
  }

  loadBranches(): void {
    // Safety check: don't load if user isn't authenticated
    const user = this.authService.me();
    if (!user) {
      console.log('Skipping branch load - user not authenticated');
      return;
    }

    console.log('Cargando sucursales...');
    this.businessService.getBranches().subscribe((response) => {
      this.branches.set(response);
      console.log('Branches loaded:', response);
      // Obtener el branchId ya seleccionado o usar el primero
      const storedBranchId = this.branchSelectionService.selectedBranchId();

      if (storedBranchId) {
        this.selectedBranchId.set(storedBranchId);
      } else if (response.length > 0) {
        // Si no hay selección previa, usar la primera sucursal
        const firstBranchId = response[0].id;
        this.selectedBranchId.set(firstBranchId);
        this.branchSelectionService.setSelectedBranchId(firstBranchId);
      }
    });
  }

  onBranchChange(branchId: string): void {
    this.selectedBranchId.set(branchId);
    this.branchSelectionService.setSelectedBranchId(branchId);
  }

  toggleSound() {
    if (this.notif.soundEnabled()) this.notif.disableSound();
    else this.notif.enableSound();
  }

  handleToggle() {
    if (window.innerWidth >= 1280) {
      this.sidebarService.toggleExpanded();
    } else {
      this.sidebarService.toggleMobileOpen();
    }
  }

  toggleApplicationMenu() {
    this.isApplicationMenuOpen = !this.isApplicationMenuOpen;
  }

  ngAfterViewInit() {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  ngOnDestroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.searchInput?.nativeElement.focus();
    }
  };
}
