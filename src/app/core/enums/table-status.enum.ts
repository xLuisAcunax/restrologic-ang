/**
 * Mapeo de estados de mesa desde el backend (.NET)
 * Sincroniza con el enum TableStatus del backend para mantener consistencia
 */

export enum TableStatusEnum {
  Free = 0,
  Occupied = 1,
  Reserved = 2,
  Cleaning = 3,
  Disabled = 4,
}

export const TABLE_STATUS_LABELS: Record<TableStatusEnum, string> = {
  [TableStatusEnum.Free]: 'Libre',
  [TableStatusEnum.Occupied]: 'Ocupada',
  [TableStatusEnum.Reserved]: 'Reservada',
  [TableStatusEnum.Cleaning]: 'Limpiando',
  [TableStatusEnum.Disabled]: 'Inhabilitada',
};

/**
 * Obtener el texto del estado de una mesa
 * @param status - El estado como número o enum
 * @returns El label en español del estado
 * @example getTableStatusLabel(1) // 'Ocupada'
 */
export function getTableStatusLabel(status: TableStatusEnum | number): string {
  return TABLE_STATUS_LABELS[status as TableStatusEnum] || 'Desconocido';
}
