// return productTypeEnum name value by id
export function getProductTypeName(type: number | undefined): string {
  if (type === undefined || type === null) return 'Sin tipo';
  const typeMap: { [key: number]: string } = {
    0: 'Simple',
    1: 'Manufacturado',
    2: 'Modificador',
    3: 'Ingrediente',
  };
  return typeMap[Number(type)] || 'Desconocido';
}

export function getProductTypeNameBk(type: number | undefined): string {
  if (type === undefined || type === null) return 'No type';
  const typeMap: { [key: number]: string } = {
    0: 'Simple',
    1: 'Manufactured',
    2: 'Modifier',
    3: 'Ingredient',
  };
  return typeMap[Number(type)] || 'Unknown';
}
