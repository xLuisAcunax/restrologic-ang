import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Coordinates } from '../../core/services/geolocation.service';

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  // Normalize Colombian address to Google-style abbreviations
  private normalizeColombianAddress(address: string): string {
    let a = (address || '').trim();
    // Common replacements: Transversal -> Tv., Carrera -> Cra., Calle -> Cl.
    a = a.replace(/\bTransversal\b/gi, 'Tv.');
    a = a.replace(/\bCarrera\b/gi, 'Cra.');
    a = a.replace(/\bCalle\b/gi, 'Cl.');
    // Remove extra spaces around # and dashes
    a = a.replace(/\s*#\s*/g, ' #');
    a = a.replace(/\s*-\s*/g, '-');
    return a;
  }
  async geocodeAddress(
    address: string,
    cityHint?: string
  ): Promise<Coordinates | null> {
    const trimmed = this.normalizeColombianAddress(address);
    if (!trimmed) return null;
    if (environment.useGoogleGeocoding && environment.googleMapsApiKey) {
      console.log('[GeocodingService] Using Google Geocoding');
      const coords = await this.googleGeocode(trimmed, cityHint);
      if (coords) return coords;
    }
    console.log('[GeocodingService] Falling back to Nominatim');
    return this.nominatimGeocode(trimmed, cityHint);
  }

  private async googleGeocode(
    address: string,
    cityHint?: string
  ): Promise<Coordinates | null> {
    try {
      const q = cityHint ? `${address}, ${cityHint}` : address;
      // Add components filter and region bias for better accuracy in Colombia
      const components = cityHint
        ? `&components=locality:${cityHint}|country:CO`
        : '&components=country:CO';
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        q
      )}&key=${
        environment.googleMapsApiKey
      }&language=es&region=co${components}`;
      const res = await fetch(url);
      const json = await res.json();
      console.log('[GeocodingService] Google API response:', json);
      const r = Array.isArray(json?.results) ? json.results[0] : null;
      const loc = r?.geometry?.location;
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        console.log(
          '[GeocodingService] Using result:',
          r?.formatted_address,
          loc
        );
        return { latitude: loc.lat, longitude: loc.lng } as Coordinates;
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
        } as Coordinates;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}
