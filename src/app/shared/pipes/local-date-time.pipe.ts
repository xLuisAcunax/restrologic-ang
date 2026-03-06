import { Pipe, PipeTransform } from '@angular/core';

/**
 * LocalDateTimePipe
 *
 * Uso:
 *   {{ isoDate | localDateTime }}              -> "07/11/2025 02:01 p. m." (por defecto)
 *   {{ isoDate | localDateTime:'date' }}       -> "07/11/2025"
 *   {{ isoDate | localDateTime:'time' }}       -> "02:01 p. m." (hora local 12h)
 *   {{ isoDate | localDateTime:'datetime' }}   -> "07/11/2025 02:01 p. m."
 *   {{ isoDate | localDateTime:'short' }}      -> "07/11 14:01" (24h, sin segundos)
 *   {{ isoDate | localDateTime:'relative' }}   -> "hace 5 min" / "en 2 h" (experimental)
 *
 * Acepta: string ISO, Date, number (timestamp ms).
 */
// LEGACY / UNUSED: Renamed to avoid duplicate pipe name 'localDateTime'.
// Use local-datetime.pipe.ts (LocalDateTimePipe) as the canonical implementation.
// This version preserves extended modes under a different selector in case
// future granular formatting (date/time/short/relative) is desired.
@Pipe({ name: 'localDateTimeModes', standalone: true })
export class LocalDateTimeModesPipe implements PipeTransform {
  transform(
    value: unknown,
    mode: 'date' | 'time' | 'datetime' | 'short' | 'relative' = 'datetime'
  ): string {
    if (value === null || value === undefined) {
      return '';
    }

    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'number') {
      date = new Date(value);
    } else if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) {
        return value; // cadena sin parsear
      }
      date = new Date(parsed);
    } else {
      return '';
    }

    // Intl fallback para navegadores sin soporte completo
    const supportsIntl = typeof Intl !== 'undefined';

    switch (mode) {
      case 'date':
        return supportsIntl
          ? new Intl.DateTimeFormat('es-CO', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(date)
          : this.manualDate(date);
      case 'time':
        return supportsIntl
          ? new Intl.DateTimeFormat('es-CO', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }).format(date)
          : this.manualTime(date, true);
      case 'short':
        return supportsIntl
          ? `${new Intl.DateTimeFormat('es-CO', {
              month: '2-digit',
              day: '2-digit',
            }).format(date)} ${new Intl.DateTimeFormat('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(date)}`
          : `${this.pad(date.getMonth() + 1)}/${this.pad(
              date.getDate()
            )} ${this.pad(date.getHours())}:${this.pad(date.getMinutes())}`;
      case 'relative':
        return this.relativeFormat(date);
      case 'datetime':
      default:
        return supportsIntl
          ? `${new Intl.DateTimeFormat('es-CO', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(date)} ${new Intl.DateTimeFormat('es-CO', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }).format(date)}`
          : `${this.manualDate(date)} ${this.manualTime(date, true)}`;
    }
  }

  private pad(n: number): string {
    return String(n).padStart(2, '0');
  }
  private manualDate(d: Date): string {
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(
      d.getDate()
    )}`;
  }
  private manualTime(d: Date, twelve: boolean): string {
    let h = d.getHours();
    const m = this.pad(d.getMinutes());
    if (!twelve) {
      return `${this.pad(h)}:${m}`;
    }
    const ampm = h >= 12 ? 'p. m.' : 'a. m.';
    h = h % 12;
    h = h ? h : 12;
    return `${this.pad(h)}:${m} ${ampm}`;
  }
  private relativeFormat(target: Date): string {
    const now = Date.now();
    const diffMs = target.getTime() - now;
    const absMs = Math.abs(diffMs);
    const minutes = Math.floor(absMs / 60000);
    const hours = Math.floor(absMs / 3600000);
    const days = Math.floor(absMs / 86400000);
    const future = diffMs > 0;

    if (minutes < 1) return future ? 'en segundos' : 'hace segundos';
    if (minutes < 60)
      return future ? `en ${minutes} min` : `hace ${minutes} min`;
    if (hours < 24) return future ? `en ${hours} h` : `hace ${hours} h`;
    return future ? `en ${days} d` : `hace ${days} d`;
  }
}
