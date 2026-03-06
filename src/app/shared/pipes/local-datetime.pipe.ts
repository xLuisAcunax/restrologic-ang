import { Pipe, PipeTransform } from '@angular/core';

const DEFAULT_LOCALE = 'es-MX';
const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

@Pipe({
  name: 'localDateTime',
  standalone: true,
})
export class LocalDateTimePipe implements PipeTransform {
  transform(
    value: string | number | Date | null | undefined,
    locale: string = DEFAULT_LOCALE,
    options: Intl.DateTimeFormatOptions = DEFAULT_OPTIONS
  ): string {
    if (value === null || value === undefined) {
      return '—';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return typeof value === 'string' && value.trim().length > 0 ? value : '—';
    }

    try {
      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch (error) {
      console.error('Error formatting date value:', value, error);
      return date.toLocaleString(locale);
    }
  }
}
