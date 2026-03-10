import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Coordinates } from '../../core/services/geolocation.service';

type PersistedGeocodeEntry = {
  latitude: number;
  longitude: number;
  cachedAt: string;
};

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly countryCode = 'CO';
  private readonly countryName = 'Colombia';
  private readonly cache = new Map<string, Coordinates | null>();
  private readonly storageKey = 'restrologic.geocoding-cache.v1';
  private readonly maxPersistedEntries = 200;

  constructor() {
    this.loadPersistedCache();
  }

  private normalizeColombianAddress(address: string): string {
    let a = (address || '').trim();
    a = a.replace(/\bTransversal\b/gi, 'Tv.');
    a = a.replace(/\bCarrera\b/gi, 'Cra.');
    a = a.replace(/\bCalle\b/gi, 'Cl.');
    a = a.replace(/\s*#\s*/g, ' #');
    a = a.replace(/\s*-\s*/g, '-');
    return a;
  }

  private buildCacheKey(address: string, cityHint?: string): string {
    return `${address.trim().toLowerCase()}|${(cityHint || '').trim().toLowerCase()}`;
  }

  private buildPrimaryGoogleQuery(address: string, cityHint?: string): string {
    const city = (cityHint || '').trim();
    return city
      ? `${address}, ${city}, ${this.countryName}`
      : `${address}, ${this.countryName}`;
  }

  private loadPersistedCache(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Record<string, PersistedGeocodeEntry>;
      for (const [key, value] of Object.entries(parsed)) {
        if (
          value &&
          typeof value.latitude === 'number' &&
          typeof value.longitude === 'number'
        ) {
          this.cache.set(key, {
            latitude: value.latitude,
            longitude: value.longitude,
          });
        }
      }
    } catch {
      // Ignore corrupted cache and rebuild it lazily.
    }
  }

  private persistCacheEntry(key: string, coordinates: Coordinates): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw
        ? (JSON.parse(raw) as Record<string, PersistedGeocodeEntry>)
        : {};

      parsed[key] = {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        cachedAt: new Date().toISOString(),
      };

      const entries = Object.entries(parsed)
        .sort((a, b) =>
          String(b[1]?.cachedAt || '').localeCompare(String(a[1]?.cachedAt || ''))
        )
        .slice(0, this.maxPersistedEntries);

      localStorage.setItem(this.storageKey, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // Storage quota errors are non-fatal for geocoding.
    }
  }

  async geocodeAddress(
    address: string,
    cityHint?: string
  ): Promise<Coordinates | null> {
    const raw = (address || '').trim();
    const normalized = this.normalizeColombianAddress(raw);
    if (!raw) return null;

    const cacheKey = this.buildCacheKey(normalized, cityHint);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    let result: Coordinates | null = null;

    if (environment.useGoogleGeocoding && environment.googleMapsApiKey) {
      console.log('[GeocodingService] Using Google Geocoding');
      result = await this.googleGeocode(raw, normalized, cityHint);
    }

    if (!result) {
      console.log('[GeocodingService] Falling back to Nominatim');
      result = await this.nominatimGeocode(normalized, cityHint);
    }

    this.cache.set(cacheKey, result);
    if (result) {
      this.persistCacheEntry(cacheKey, result);
    }
    return result;
  }

  private async googleGeocode(
    rawAddress: string,
    normalizedAddress: string,
    cityHint?: string
  ): Promise<Coordinates | null> {
    try {
      const primaryQuery = this.buildPrimaryGoogleQuery(rawAddress, cityHint);
      const fallbackQuery =
        primaryQuery === this.buildPrimaryGoogleQuery(normalizedAddress, cityHint)
          ? null
          : this.buildPrimaryGoogleQuery(normalizedAddress, cityHint);

      const queries = [primaryQuery, fallbackQuery].filter(
        (query): query is string => !!query
      );

      for (const query of queries) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          query
        )}&key=${
          environment.googleMapsApiKey
        }&language=es&region=co&components=country:${this.countryCode}`;

        console.log('[GeocodingService] Google request:', {
          query,
          cityHint: cityHint || null,
          url,
        });

        const res = await fetch(url);
        const json = await res.json();
        const result = Array.isArray(json?.results) ? json.results[0] : null;
        const loc = result?.geometry?.location;

        console.log('[GeocodingService] Google response:', {
          query,
          status: json?.status,
          errorMessage: json?.error_message ?? null,
          formattedAddress: result?.formatted_address ?? null,
          partialMatch: result?.partial_match ?? false,
          locationType: result?.geometry?.location_type ?? null,
        });

        if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
          return { latitude: loc.lat, longitude: loc.lng };
        }

        if (json?.status && json.status !== 'ZERO_RESULTS') {
          break;
        }
      }

      return null;
    } catch (e) {
      console.error('[GeocodingService] Google geocoding error:', e);
      return null;
    }
  }

  private async nominatimGeocode(
    address: string,
    cityHint?: string
  ): Promise<Coordinates | null> {
    try {
      const q = cityHint
        ? `${address}, ${cityHint}, Colombia`
        : `${address}, Colombia`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=es&countrycodes=co&q=${encodeURIComponent(
        q
      )}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RestroLogic-Delivery-App/1.0' },
      });
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length > 0) {
        return {
          latitude: parseFloat(arr[0].lat),
          longitude: parseFloat(arr[0].lon),
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}
