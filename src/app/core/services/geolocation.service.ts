import { Injectable, signal } from '@angular/core';
import { Observable, interval, Subscription } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

@Injectable({
  providedIn: 'root',
})
export class GeolocationService {
  private currentPosition = signal<Coordinates | null>(null);
  private watchId: number | null = null;
  private trackingSubscription: Subscription | null = null;

  constructor() {}

  /**
   * Get current position once with retry logic
   */
  getCurrentPosition(): Promise<Coordinates> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no soportada en este navegador'));
        return;
      }

      console.log('[GeolocationService] Requesting position...');

      // Try with high accuracy first
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: Coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          console.log('[GeolocationService] Position obtained:', coords);
          this.currentPosition.set(coords);
          resolve(coords);
        },
        (error) => {
          console.warn(
            '[GeolocationService] High accuracy failed, trying low accuracy...',
            error.message
          );

          // Retry with lower accuracy and longer timeout
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const coords: Coordinates = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: position.timestamp,
              };
              console.log(
                '[GeolocationService] Position obtained (low accuracy):',
                coords
              );
              this.currentPosition.set(coords);
              resolve(coords);
            },
            (error2) => {
              console.error(
                '[GeolocationService] Error getting position:',
                error2
              );
              let errorMsg = 'No se pudo obtener tu ubicación.';

              switch (error2.code) {
                case error2.PERMISSION_DENIED:
                  errorMsg =
                    'Permiso de ubicación denegado. Por favor, activa los permisos de ubicación.';
                  break;
                case error2.POSITION_UNAVAILABLE:
                  errorMsg = 'Información de ubicación no disponible.';
                  break;
                case error2.TIMEOUT:
                  errorMsg =
                    'Tiempo de espera agotado al obtener ubicación. Intenta de nuevo.';
                  break;
              }

              reject(new Error(errorMsg));
            },
            {
              enableHighAccuracy: false,
              timeout: 30000, // 30 seconds
              maximumAge: 60000, // Accept 1 minute old position
            }
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 15000, // 15 seconds
          maximumAge: 10000, // Accept 10 seconds old position
        }
      );
    });
  }

  /**
   * Watch position changes continuously
   */
  watchPosition(): Observable<Coordinates> {
    return new Observable((subscriber) => {
      if (!navigator.geolocation) {
        subscriber.error(new Error('Geolocalización no soportada'));
        return;
      }

      console.log('[GeolocationService] Starting position watch...');

      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          const coords: Coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          console.log('[GeolocationService] Position update:', coords);
          this.currentPosition.set(coords);
          subscriber.next(coords);
        },
        (error) => {
          console.warn('[GeolocationService] Watch error:', error.message);
          // Don't error out, just log and continue watching
        },
        {
          enableHighAccuracy: false, // Use false for better battery life
          timeout: 30000, // 30 seconds
          maximumAge: 30000, // Accept positions up to 30 seconds old
        }
      );

      return () => {
        if (this.watchId !== null) {
          console.log('[GeolocationService] Stopping position watch');
          navigator.geolocation.clearWatch(this.watchId);
          this.watchId = null;
        }
      };
    });
  }

  /**
   * Start tracking position at intervals (for syncing with backend)
   */
  startTracking(intervalMs: number = 30000): void {
    this.stopTracking();

    this.trackingSubscription = interval(intervalMs)
      .pipe(
        startWith(0),
        switchMap(() => this.getCurrentPosition())
      )
      .subscribe({
        next: (coords) => {
          console.log('[GeolocationService] Position updated:', coords);
        },
        error: (err) => {
          console.error('[GeolocationService] Tracking error:', err);
        },
      });
  }

  /**
   * Stop tracking
   */
  stopTracking(): void {
    if (this.trackingSubscription) {
      this.trackingSubscription.unsubscribe();
      this.trackingSubscription = null;
    }
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   * Returns distance in kilometers
   */
  calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(coord2.latitude - coord1.latitude);
    const dLon = this.toRad(coord2.longitude - coord1.longitude);
    const lat1 = this.toRad(coord1.latitude);
    const lat2 = this.toRad(coord2.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get current position signal
   */
  getCurrentPositionSignal() {
    return this.currentPosition;
  }
}
