
import { Component, Inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { Product } from '../../../core/services/product.service';
import {
  Modifier,
  ModifierGroup,
} from '../../../core/services/modifier.service';
import { ModifierGroupSelection } from '../../../core/models/order.model';

export type ProductConfigData = { product: Product };

@Component({
  selector: 'app-product-config-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card bg-base-100 w-full shadow-2xl p-4">
      <div class="card-body">
        <h2 class="card-title text-xl">
          {{ data.product.name }}
          <span class="badge badge-accent badge-lg"
            >\${{ data.product.price.toFixed(2) }}</span
          >
        </h2>

        @if (data.product.description) {
        <p class="text-sm text-neutral-500">{{ data.product.description }}</p>
        }

        <div class="divider"></div>

        @if (!hasModifiers) {
        <div class="alert alert-info alert-soft">
          Este producto no tiene opciones de personalización.
        </div>
        } @else {
        <div class="space-y-3 max-h-96 overflow-y-auto"></div>
        }

        <div class="divider">Cantidad</div>
        <div class="flex items-center justify-center gap-4">
          <button class="btn btn-circle" (click)="decrementQuantity()">
            -
          </button>
          <span class="text-3xl font-bold">{{ itemQuantity() }}</span>
          <button class="btn btn-circle" (click)="incrementQuantity()">
            +
          </button>
        </div>

        <div class="mt-4 p-4 bg-accent/10 rounded-lg">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-lg">Total:</span>
            <span class="text-2xl font-bold text-accent-content"
              >\${{ calculateTotal().toFixed(2) }}</span
            >
          </div>
          <div class="text-xs text-neutral-500 mt-1">
            Base: \${{ data.product.price.toFixed(2) }} × {{ itemQuantity() }}
          </div>
        </div>

        @if (validationError()) {
        <div class="alert alert-error alert-soft">
          <span>{{ validationError() }}</span>
        </div>
        }

        <div class="card-actions justify-end mt-4">
          <button class="btn btn-ghost" (click)="cancel()">Cancelar</button>
          <button
            class="btn btn-accent"
            (click)="confirm()"
            [disabled]="!isValid()"
          >
            Agregar a la Orden
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ProductConfigModalComponent {
  itemQuantity = signal(1);
  selections = signal<Map<string, ModifierGroupSelection>>(new Map());
  validationError = signal<string>('');

  constructor(
    public dialogRef: DialogRef<{
      quantity: number;
      modifiers: ModifierGroupSelection[];
    }>,
    @Inject(DIALOG_DATA) public data: ProductConfigData
  ) {}

  get hasModifiers(): boolean {
    return false; // (this.data.product.modifierGroups || []).length > 0
  }

  getSelectionType(group: ModifierGroup): 'SINGLE' | 'MULTIPLE' {
    return group.maxSelection === 1 ? 'SINGLE' : 'MULTIPLE';
  }

  selectSingleModifier(group: ModifierGroup, modifier: Modifier) {
    const selection: ModifierGroupSelection = {
      groupId: group.id,
      groupName: group.name,
      selectionType: 'SINGLE',
      modifiers: [
        { modifierId: modifier.id, modifierName: modifier.name, quantity: 1 },
      ],
    };
    this.selections.update((map) => {
      map.set(group.id, selection);
      return new Map(map);
    });
    this.validationError.set('');
  }

  toggleMultipleModifier(
    group: ModifierGroup,
    modifier: Modifier,
    event: Event
  ) {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;
    this.selections.update((map) => {
      let groupSelection = map.get(group.id);
      if (!groupSelection) {
        groupSelection = {
          groupId: group.id,
          groupName: group.name,
          selectionType: 'MULTIPLE',
          modifiers: [],
        };
      }
      if (checked) {
        const max =
          typeof group.maxSelection === 'number' ? group.maxSelection : -1;
        if (max > 0 && groupSelection.modifiers.length >= max) {
          input.checked = false;
          this.validationError.set(
            `Solo puedes seleccionar hasta ${max} opciones en "${group.name}"`
          );
          return new Map(map);
        }
        groupSelection.modifiers.push({
          modifierId: modifier.id,
          modifierName: modifier.name,
          quantity: 1,
        });
      } else {
        groupSelection.modifiers = groupSelection.modifiers.filter(
          (m) => m.modifierId !== modifier.id
        );
      }
      if (groupSelection.modifiers.length > 0) {
        map.set(group.id, groupSelection);
      } else {
        map.delete(group.id);
      }
      return new Map(map);
    });
    if (group.allowPortionSplit && group.maxSelection >= 2) {
      this.validationError.set('');
    }
  }

  isModifierSelected(groupId: string, modifierId: string): boolean {
    const group = this.selections().get(groupId);
    return group?.modifiers.some((m) => m.modifierId === modifierId) || false;
  }

  getModifierQuantity(groupId: string, modifierId: string): number {
    const group = this.selections().get(groupId);
    const mod = group?.modifiers.find((m) => m.modifierId === modifierId);
    return mod?.quantity || 1;
  }

  incrementModifierQuantity(groupId: string, modifierId: string) {
    this.selections.update((map) => {
      const group = map.get(groupId);
      if (group) {
        const mod = group.modifiers.find((m) => m.modifierId === modifierId);
        if (mod) mod.quantity = (mod.quantity || 1) + 1;
      }
      return new Map(map);
    });
  }

  decrementModifierQuantity(groupId: string, modifierId: string) {
    this.selections.update((map) => {
      const group = map.get(groupId);
      if (group) {
        const mod = group.modifiers.find((m) => m.modifierId === modifierId);
        if (mod && (mod.quantity || 1) > 1)
          mod.quantity = (mod.quantity || 1) - 1;
      }
      return new Map(map);
    });
  }

  getModifiersCost(): number {
    let cost = 0;

    return cost;
  }

  calculateTotal(): number {
    return (
      (this.data.product.price + this.getModifiersCost()) * this.itemQuantity()
    );
  }

  isValid(): boolean {
    return true;
  }

  incrementQuantity() {
    this.itemQuantity.update((q) => q + 1);
  }
  decrementQuantity() {
    if (this.itemQuantity() > 1) this.itemQuantity.update((q) => q - 1);
  }

  confirm() {
    if (!this.isValid()) return;
    this.dialogRef.close({
      quantity: this.itemQuantity(),
      modifiers: Array.from(this.selections().values()),
    });
  }

  cancel() {
    this.dialogRef.close(undefined);
  }
}
