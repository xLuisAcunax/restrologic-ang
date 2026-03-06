import { Injectable, signal, computed } from '@angular/core';

export type CartModifierSelection = {
  groupId: string;
  groupName: string;
  modifierId: string;
  modifierName: string;
  priceAdjustment: number;
};

export type CartItemSingle = {
  id: string;
  type: 'single';
  productId: string;
  productName: string;
  sizeKey: string; // personal|mediana|familiar|unico
  sizeId?: string; // backend size identifier
  price: number; // includes modifier price adjustments
  basePrice: number; // original product price without modifiers
  qty: number;
  imageUrl?: string | null;
  // Metadata adicional para pizzas (construir descripción completa)
  categoryName?: string; // "Pizza"
  subcategoryName?: string; // "Napolitana", "BBQ", etc.
  flavorName?: string; // Alias de subcategoryName
  // Modifier selections
  modifiers?: CartModifierSelection[];
  // Bundle selections
  bundleName?: string;
  bundleSelections?: any[];
};

export type CartItemHalf = {
  id: string;
  type: 'half';
  productIdA: string;
  productNameA: string;
  productIdB: string;
  productNameB: string;
  sizeKey: string; // mediana|familiar
  sizeId?: string; // backend size identifier (shared size for half)
  price: number; // average of A and B size prices
  qty: number;
  imageUrlA?: string | null;
  imageUrlB?: string | null;
  // Metadata adicional
  categoryName?: string;
  subcategoryNameA?: string; // Subcategoría del sabor A
  subcategoryNameB?: string; // Subcategoría del sabor B
};

export type CartItem = CartItemSingle | CartItemHalf;

const STORAGE_KEY = 'public_cart_v1';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private _items = signal<CartItem[]>(this.load());

  // Animation signal for cart icon
  private _itemAdded = signal(false);
  readonly itemAdded = this._itemAdded.asReadonly();

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().reduce((a, b) => a + b.qty, 0));
  readonly total = computed(() =>
    this._items().reduce((a, b) => a + b.price * b.qty, 0)
  );

  private triggerAddedAnimation() {
    this._itemAdded.set(true);
    setTimeout(() => this._itemAdded.set(false), 600);
  }

  addSingle(
    product: { id: string; name: string; imageUrl?: string | null },
    sizeKey: string,
    price: number,
    sizeId?: string,
    metadata?: {
      categoryName?: string;
      subcategoryName?: string;
      flavorName?: string;
      modifiers?: CartModifierSelection[];
      bundleName?: string;
      bundleSelections?: any[];
    }
  ) {
    // Derive basePrice by subtracting modifier adjustments when provided
    const modsTotal = (metadata?.modifiers || []).reduce(
      (sum, m) => sum + Number(m.priceAdjustment || 0),
      0
    );
    const derivedBase = Math.max(0, Number(price) - modsTotal);

    const item: CartItemSingle = {
      id: uuid(),
      type: 'single',
      productId: product.id,
      productName: product.name,
      sizeKey,
      sizeId,
      price,
      basePrice: derivedBase,
      qty: 1,
      imageUrl: product.imageUrl || null,
      categoryName: metadata?.categoryName,
      subcategoryName: metadata?.subcategoryName || metadata?.flavorName,
      flavorName: metadata?.flavorName || metadata?.subcategoryName,
      modifiers: metadata?.modifiers,
      bundleName: metadata?.bundleName,
      bundleSelections: metadata?.bundleSelections,
    };
    this._items.update((list) => [...list, item]);
    this.persist();
    this.triggerAddedAnimation();
  }

  addHalf(
    productA: { id: string; name: string; imageUrl?: string | null },
    productB: { id: string; name: string; imageUrl?: string | null },
    sizeKey: string,
    priceA: number,
    priceB: number,
    sizeId?: string,
    metadata?: {
      categoryName?: string;
      subcategoryNameA?: string;
      subcategoryNameB?: string;
    }
  ) {
    const avg = (Number(priceA) + Number(priceB)) / 2;
    const item: CartItemHalf = {
      id: uuid(),
      type: 'half',
      productIdA: productA.id,
      productNameA: productA.name,
      productIdB: productB.id,
      productNameB: productB.name,
      sizeKey,
      sizeId,
      price: Math.round(avg * 100) / 100,
      qty: 1,
      imageUrlA: productA.imageUrl || null,
      imageUrlB: productB.imageUrl || null,
      categoryName: metadata?.categoryName,
      subcategoryNameA: metadata?.subcategoryNameA,
      subcategoryNameB: metadata?.subcategoryNameB,
    };
    this._items.update((list) => [...list, item]);
    this.persist();
    this.triggerAddedAnimation();
  }

  inc(itemId: string) {
    this._items.update((list) =>
      list.map((it) => (it.id === itemId ? { ...it, qty: it.qty + 1 } : it))
    );
    this.persist();
  }

  dec(itemId: string) {
    this._items.update((list) =>
      list.map((it) =>
        it.id === itemId ? { ...it, qty: Math.max(1, it.qty - 1) } : it
      )
    );
    this.persist();
  }

  remove(itemId: string) {
    this._items.update((list) => list.filter((it) => it.id !== itemId));
    this.persist();
  }

  clear() {
    this._items.set([]);
    this.persist();
  }

  private load(): CartItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._items()));
    } catch {
      // ignore
    }
  }
}
