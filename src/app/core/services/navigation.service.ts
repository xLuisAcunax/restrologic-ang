import { Injectable, computed, signal } from '@angular/core';
import { ModuleService } from './module.service';
import { AuthService } from './auth.service';

export interface MenuItem {
  label: string;
  route: string;
  icon?: string;
  requiredModule?: string;
  requiredRoles?: string[];
  badge?: string;
  children?: MenuItem[];
}

/**
 * Service to manage navigation menus with role and module-based filtering
 */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  /**
   * Define all menu items with their requirements
   * This is the single source of truth for navigation
   */
  private allMenuItems = signal<MenuItem[]>([
    // Dashboard items
    {
      label: 'Dashboard',
      route: '/user',
      icon: 'home',
    },
    {
      label: 'Órdenes',
      route: '/user/orders',
      icon: 'receipt',
    },

    // Admin items
    {
      label: 'Productos',
      route: '/admin/products',
      icon: 'inventory_2',
      requiredRoles: ['Admin', 'Super'],
    },
    {
      label: 'Usuarios',
      route: '/admin/users',
      icon: 'people',
      requiredRoles: ['Admin', 'Super'],
    },

    // Premium features (require modules)
    {
      label: 'Entregas',
      route: '/admin/deliveries',
      icon: 'local_shipping',
      requiredModule: 'deliveries',
      requiredRoles: ['Admin', 'Super'],
      badge: 'Premium',
    },
    {
      label: 'Inventario',
      route: '/admin/inventory',
      icon: 'inventory',
      requiredModule: 'inventory',
      requiredRoles: ['Admin', 'Super'],
      badge: 'Premium',
    },
    {
      label: 'Facturación DIAN',
      route: '/admin/invoicing',
      icon: 'description',
      requiredModule: 'e-invoicing-dian',
      requiredRoles: ['Admin', 'Super'],
      badge: 'Premium',
    },
    {
      label: 'Analytics',
      route: '/admin/analytics',
      icon: 'analytics',
      requiredModule: 'advanced-admin',
      requiredRoles: ['Admin', 'Super'],
      badge: 'Pro',
    },

    // Super admin items
    {
      label: 'Negocios',
      route: '/super/businesses',
      icon: 'business',
      requiredRoles: ['Super'],
    },
    {
      label: 'Módulos',
      route: '/super/modules',
      icon: 'extension',
      requiredRoles: ['Super'],
    },
  ]);

  constructor(
    private moduleService: ModuleService,
    private authService: AuthService
  ) {}

  /**
   * Get filtered menu items based on user roles and enabled modules
   */
  getVisibleMenuItems = computed(() => {
    const userRoles = this.authService.getRole() ?? [];
    const allItems = this.allMenuItems();

    return allItems.filter((item) => this.isMenuItemVisible(item, userRoles));
  });

  /**
   * Get menu items for a specific section
   */
  getMenuItemsBySection(section: 'user' | 'admin' | 'super') {
    const allVisible = this.getVisibleMenuItems();
    const prefix = `/${section}`;

    return allVisible.filter((item) => item.route.startsWith(prefix));
  }

  /**
   * Check if a menu item should be visible
   */
  private isMenuItemVisible(item: MenuItem, userRoles: string[]): boolean {
    // Check role requirements
    if (item.requiredRoles && item.requiredRoles.length > 0) {
      const hasRole = item.requiredRoles.some((role) =>
        userRoles.includes(role)
      );
      if (!hasRole) return false;
    }

    // Check module requirements
    if (item.requiredModule) {
      const hasModule = this.moduleService.isModuleEnabled(item.requiredModule);
      if (!hasModule) return false;
    }

    return true;
  }

  /**
   * Add custom menu items (useful for plugins/extensions)
   */
  addMenuItem(item: MenuItem) {
    this.allMenuItems.update((items) => [...items, item]);
  }

  /**
   * Remove menu item by route
   */
  removeMenuItem(route: string) {
    this.allMenuItems.update((items) =>
      items.filter((item) => item.route !== route)
    );
  }

  /**
   * Update menu items
   */
  setMenuItems(items: MenuItem[]) {
    this.allMenuItems.set(items);
  }
}
