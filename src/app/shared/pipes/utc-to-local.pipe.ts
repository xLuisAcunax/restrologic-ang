import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'utcToLocal',
})
export class UtcToLocalPipe implements PipeTransform {
  transform(value: string | Date, format?: Intl.DateTimeFormatOptions): string {
    if (!value) return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return '';
    // Default format if not provided
    const options: Intl.DateTimeFormatOptions = format || {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    };
    return date.toLocaleString(undefined, options);
  }
}
