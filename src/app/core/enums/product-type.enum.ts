export enum ProductTypeEnum {
  Simple, // Una Coca-Cola
  Manufacturado, // Una Pizza (requiere preparación)
  Adicional, // "Extra Queso" o un Sabor como "Pepperoni"
  Ingrediente, // Harina, Tomate (Inventario puro)
}

// return enum keys as array
export const getProductTypeEnumKeys = (): string[] => {
  return Object.keys(ProductTypeEnum).filter(
    (key) => isNaN(Number(key)), // Filter out numeric keys
  );
};
