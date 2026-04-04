
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageBreadcrumbComponent } from '../../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import {
  AssignModuleDto,
  ModuleAssignment,
  ModuleManifest,
  ModuleScope,
  ModuleStatus,
} from '../../../core/models/module.model';
import { ModuleService } from '../../../core/services/module.service';
import {
  BusinessService,
  BusinessItem,
  BranchSummary,
} from '../../../core/services/business.service';

@Component({
  selector: 'app-module-management',
  standalone: true,
  imports: [FormsModule, PageBreadcrumbComponent],
  templateUrl: './module-management.component.html',
})
export class ModuleManagementComponent implements OnInit {
  readonly statuses: ModuleStatus[] = [
    'draft',
    'beta',
    'active',
    'deprecated',
    'retired',
  ];
  readonly scopes: ModuleScope[] = ['TENANT', 'BRANCH'];

  modules = signal<ModuleManifest[]>([]);
  loadingModules = signal(false);
  selectedModuleKey = signal<string | null>(null);

  tenants = signal<BusinessItem[]>([]);
  tenantBranches = signal<BranchSummary[]>([]);

  assignments = signal<ModuleAssignment[]>([]);
  loadingAssignments = signal(false);

  creatingModule = signal(false);
  createForm = signal({
    key: '',
    name: '',
    description: '',
    status: 'draft' as ModuleStatus,
    category: '',
    defaultConfig: '',
    configSchema: '',
    docsUrl: '',
    createdBy: '',
    updatedBy: '',
  });

  assignmentForm = signal({
    tenantId: '',
    branchId: '',
    scope: 'TENANT' as ModuleScope,
    isEnabled: true,
  });

  readonly selectedModule = computed(() => {
    const key = this.selectedModuleKey();
    if (!key) return null;
    return this.modules().find((module) => module.key === key) ?? null;
  });

  readonly filteredAssignments = computed(() => {
    const moduleKey = this.selectedModuleKey();
    if (!moduleKey) return [];
    return this.assignments().filter(
      (assignment) => assignment.moduleKey === moduleKey
    );
  });

  constructor(
    private readonly moduleService: ModuleService,
    private readonly businessService: BusinessService
  ) {}

  ngOnInit(): void {
    this.loadModules();
    this.loadTenants();
  }

  toggleCreateModule() {
    this.creatingModule.set(!this.creatingModule());
    if (!this.creatingModule()) {
      this.resetCreateForm();
    }
  }

  updateCreateField(field: string, value: any) {
    this.createForm.update((prev) => ({ ...prev, [field]: value }));
  }

  loadModules() {
    this.loadingModules.set(true);
    this.moduleService.listModules().subscribe({
      next: (modules) => {
        this.modules.set(modules);
        this.loadingModules.set(false);
        if (!this.selectedModuleKey() && modules.length > 0) {
          this.onSelectModule(modules[0].key);
        }
      },
      error: () => {
        this.loadingModules.set(false);
      },
    });
  }

  loadTenants() {
    this.businessService.list().subscribe({
      next: (response) => {
        this.tenants.set(response.data ?? []);
      },
      error: () => {
        this.tenants.set([]);
      },
    });
  }

  loadBranches(tenantId: string) {
    this.businessService.getBranches(tenantId).subscribe({
      next: (result) => {
        this.tenantBranches.set(result ?? []);
      },
      error: () => {
        this.tenantBranches.set([]);
      },
    });
  }

  onSelectModule(key: string) {
    this.selectedModuleKey.set(key);
    this.fetchAssignments();
  }

  updateAssignmentField(
    field: 'tenantId' | 'branchId' | 'isEnabled',
    value: string | boolean
  ) {
    this.assignmentForm.update((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  fetchAssignments() {
    const moduleKey = this.selectedModuleKey();
    if (!moduleKey) {
      this.assignments.set([]);
      return;
    }
    this.loadingAssignments.set(true);
    this.moduleService.listAssignments({ moduleKey }).subscribe({
      next: (items) => {
        this.assignments.set(items);
        this.loadingAssignments.set(false);
      },
      error: () => {
        this.assignments.set([]);
        this.loadingAssignments.set(false);
      },
    });
  }

  submitCreateModule() {
    const form = this.createForm();

    // Validación básica
    if (!form.key.trim() || !form.name.trim()) {
      alert('Los campos "Identificador" y "Nombre" son obligatorios');
      return;
    }

    // Parsear JSON si existen
    let parsedConfigSchema = undefined;
    let parsedDefaultConfig = undefined;

    try {
      if (form.configSchema && form.configSchema.trim()) {
        parsedConfigSchema = JSON.parse(form.configSchema);
      }
    } catch (e) {
      alert('Config Schema no es un JSON válido');
      return;
    }

    try {
      if (form.defaultConfig && form.defaultConfig.trim()) {
        parsedDefaultConfig = JSON.parse(form.defaultConfig);
      }
    } catch (e) {
      alert('Default Config no es un JSON válido');
      return;
    }

    const payload = {
      key: form.key.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      status: form.status,
      category: form.category?.trim() || undefined,
      defaultConfig: parsedDefaultConfig,
      configSchema: parsedConfigSchema,
      docsUrl: form.docsUrl?.trim() || undefined,
      createdBy: form.createdBy?.trim() || undefined,
      updatedBy: form.updatedBy?.trim() || undefined,
    };

    console.log('Creando módulo:', payload);

    this.moduleService.createModule(payload).subscribe({
      next: (module) => {
        console.log('Módulo creado:', module);
        this.modules.update((current) => [
          module,
          ...current.filter((m) => m.key !== module.key),
        ]);
        this.selectedModuleKey.set(module.key);
        this.creatingModule.set(false);
        this.resetCreateForm();
        alert('Módulo creado exitosamente');
      },
      error: (error) => {
        console.error('Error creando módulo:', error);
        alert(
          'Error al crear el módulo: ' + (error.error?.message || error.message)
        );
      },
    });
  }

  submitAssignment() {
    const moduleKey = this.selectedModuleKey();
    if (!moduleKey) return;

    const form = this.assignmentForm();
    const payload: AssignModuleDto = {
      moduleKey,
      tenantId: form.tenantId,
      branchId: form.scope === 'BRANCH' ? form.branchId || null : null,
      scope: form.scope,
      isEnabled: form.isEnabled,
    };

    if (!payload.tenantId) return;
    if (payload.scope === 'BRANCH' && !payload.branchId) return;

    this.moduleService.assignModule(payload).subscribe({
      next: (assignment) => {
        this.assignments.update((items) => [
          assignment,
          ...items.filter((item) => item.id !== assignment.id),
        ]);
        this.resetAssignmentForm();
      },
    });
  }

  onTenantChange(tenantId: string) {
    this.assignmentForm.update((prev) => ({ ...prev, tenantId, branchId: '' }));
    this.loadBranches(tenantId);
  }

  onScopeChange(scope: ModuleScope) {
    this.assignmentForm.update((prev) => ({ ...prev, scope, branchId: '' }));
    if (scope === 'BRANCH') {
      const tenantId = this.assignmentForm().tenantId;
      if (tenantId) {
        this.loadBranches(tenantId);
      } else {
        this.tenantBranches.set([]);
      }
    } else {
      this.tenantBranches.set([]);
    }
  }

  toggleAssignmentEnabled(assignment: ModuleAssignment) {
    this.moduleService
      .updateAssignment(assignment.id, { isEnabled: !assignment.isEnabled })
      .subscribe(({ isEnabled }) => {
        this.assignments.update((items) =>
          items.map((item) =>
            item.id === assignment.id
              ? {
                  ...item,
                  isEnabled,
                }
              : item
          )
        );
      });
  }

  removeAssignment(assignment: ModuleAssignment) {
    if (!confirm('¿Eliminar esta asignación?')) {
      return;
    }
    this.moduleService.removeAssignment(assignment.id).subscribe(() => {
      this.assignments.update((items) =>
        items.filter((item) => item.id !== assignment.id)
      );
    });
  }

  trackByModuleKey(index: number, module: ModuleManifest): string {
    return module.key;
  }

  private resetCreateForm() {
    this.createForm.set({
      key: '',
      name: '',
      description: '',
      status: 'draft',
      category: '',
      defaultConfig: '',
      configSchema: '',
      docsUrl: '',
      createdBy: '',
      updatedBy: '',
    });
  }

  private resetAssignmentForm() {
    this.assignmentForm.set({
      tenantId: '',
      branchId: '',
      scope: 'TENANT',
      isEnabled: true,
    });
    this.tenantBranches.set([]);
  }
}




