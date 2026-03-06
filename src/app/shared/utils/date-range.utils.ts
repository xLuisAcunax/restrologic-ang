export type DayRange = {
  start: string;
  end: string;
};

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return false;
  }
  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > 31) {
    return false;
  }
  return true;
}

export function createDayRangeIso(
  dateInput: string | null | undefined
): DayRange | null {
  if (!dateInput || typeof dateInput !== 'string') {
    return null;
  }

  const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  // Crear el rango en límites de medianoche LOCAL y convertir a UTC.
  // Así, si se selecciona 2025-11-08 en UTC-05:00, el rango será
  // 2025-11-08T05:00:00.000Z a 2025-11-09T04:59:59.999Z, que cubre
  // todo el día local.
  const startLocal = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endLocal = new Date(year, month - 1, day, 23, 59, 59, 999);

  return {
    start: startLocal.toISOString(),
    end: endLocal.toISOString(),
  };
}

export function todayAsInputLocalDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const localDate = `${yyyy}-${mm}-${dd}`;
  return localDate;
}

export function todayAsInputLocalDateTime(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  let hours = now.getHours();
  const min = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const hh = String(hours).padStart(2, '0');
  const localDate = `${yyyy}-${mm}-${dd} ${hh}:${min} ${ampm}`;
  return localDate;
}

export function IsoToLocalDate(isoDate: string): string {
  const iso = new Date(isoDate);
  const yyyy = iso.getFullYear();
  const mm = String(iso.getMonth() + 1).padStart(2, '0');
  const dd = String(iso.getDate()).padStart(2, '0');
  const localDate = `${yyyy}-${mm}-${dd}`;
  return localDate;
}

export function IsoToLocalDateTime(isoDate: string): string {
  const iso = new Date(isoDate);
  const yyyy = iso.getFullYear();
  const mm = String(iso.getMonth() + 1).padStart(2, '0');
  const dd = String(iso.getDate()).padStart(2, '0');
  let hours = iso.getHours();
  const min = String(iso.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const hh = String(hours).padStart(2, '0');
  const localDate = `${yyyy}-${mm}-${dd} ${hh}:${min} ${ampm}`;
  return localDate;
}

export function todayAsInputIsoDate(): string {
  const now = new Date();
  return now.toISOString().substring(0, 10);
}

export function localToIsoDate(localDate: string): string {
  // No aplicar desplazamiento de día. Simplemente interpretar la cadena como fecha local
  // y devolver la porción YYYY-MM-DD del equivalente UTC.
  const parts = localDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return localDate;
  const [, y, m, d] = parts;
  const dt = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
  return dt.toISOString().substring(0, 10);
}
