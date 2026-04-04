import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  signal,
  computed,
  inject,
} from '@angular/core';

import * as L from 'leaflet';
import { AuthService } from '../../../../core/services/auth.service';
import { OrderService } from '../../../../core/services/order.service';
import {
  GeolocationService,
  Coordinates,
} from '../../../../core/services/geolocation.service';
import { Subscription } from 'rxjs';
import { Order } from '../../../../core/models/order.model';

interface DeliveryStop {
  order: Order;
  coordinates: Coordinates;
  distance?: number;
}

type SortOrder = 'nearest' | 'farthest';

@Component({
  selector: 'app-route-map',
  standalone: true,
  imports: [],
  templateUrl: './route-map.component.html',
  styleUrls: ['./route-map.component.css'],
})
export class RouteMapComponent implements OnInit, AfterViewInit, OnDestroy {
  private auth = inject(AuthService);
  private orderService = inject(OrderService);
  private geoService = inject(GeolocationService);

  private map: L.Map | null = null;
  private driverMarker: L.Marker | null = null;
  private deliveryMarkers: L.Marker[] = [];
  private routePolylines: L.Polyline[] = [];
  private positionSubscription: Subscription | null = null;
  private initialViewSet = false;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;

  loading = signal(true);
  currentPosition = signal<Coordinates | null>(null);
  deliveryStops = signal<DeliveryStop[]>([]);
  sortOrder = signal<SortOrder>('nearest');

  tenantId = computed(() => this.auth.me()?.tenantId || '');
  branchId = computed(() => this.auth.me()?.branchId || '');
  driverId = computed(() => this.auth.me()?.id || '');

  sortedStops = computed(() => {
    const stops = [...this.deliveryStops()];
    const order = this.sortOrder();
    const current = this.currentPosition();

    if (!current || stops.length === 0) return stops;

    // Calculate distances if not already done
    stops.forEach((stop) => {
      if (stop.distance === undefined) {
        stop.distance = this.geoService.calculateDistance(
          current,
          stop.coordinates
        );
      }
    });

    // Sort by distance
    stops.sort((a, b) => {
      const distA = a.distance || 0;
      const distB = b.distance || 0;
      return order === 'nearest' ? distA - distB : distB - distA;
    });

    return stops;
  });

  ngOnInit() {
    this.loadDeliveries();
  }

  ngAfterViewInit() {
    // Wait for DOM to be fully ready
    setTimeout(() => {
      this.initMap();
      // Start location after map is ready
      setTimeout(() => this.initializeLocation(), 500);

      // Observe when the map container becomes visible in viewport
      const container = document.getElementById('map');
      if (container) {
        this.intersectionObserver = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (entry && entry.isIntersecting) {
              // Force a hard size recalculation when it becomes visible
              this.map?.invalidateSize(true);
            }
          },
          { threshold: 0.05 }
        );
        this.intersectionObserver.observe(container);
      }
    }, 300);
  }

  ngOnDestroy() {
    if (this.positionSubscription) {
      this.positionSubscription.unsubscribe();
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    this.geoService.stopTracking();
    if (this.map) {
      this.map.remove();
    }
  }

  // Public helper to manually force a map refresh if needed
  forceMapRefresh() {
    if (this.map) {
      this.map.invalidateSize(true);
    }
  }

  async initializeLocation() {
    console.log('[RouteMap] Initializing location...');

    try {
      const position = await this.geoService.getCurrentPosition();
      this.currentPosition.set(position);
      console.log('[RouteMap] Initial position obtained:', position);

      // Update map center and add/update driver marker
      if (this.map) {
        this.map.setView([position.latitude, position.longitude], 15);

        // Force size recalculation
        setTimeout(() => this.map?.invalidateSize(), 100);

        if (this.driverMarker) {
          this.updateDriverMarker(position);
        } else {
          this.addDriverMarker(position);
        }
      }

      // Send initial location to backend
      this.syncLocationToBackend(position);

      // Start watching position
      this.positionSubscription = this.geoService.watchPosition().subscribe({
        next: (coords) => {
          console.log('[RouteMap] Position updated:', coords);
          this.currentPosition.set(coords);
          this.updateDriverMarker(coords);
          this.recalculateDistances(coords);

          // Sync location to backend every position update
          this.syncLocationToBackend(coords);
        },
        error: (err) => {
          console.warn('[RouteMap] Error watching position:', err);
          // Continue without real-time updates
        },
      });
    } catch (error: any) {
      console.error('[RouteMap] Error getting location:', error);

      const errorMessage =
        error?.message ||
        'No se pudo obtener tu ubicación. El mapa usará una ubicación por defecto.';

      console.warn('[RouteMap]', errorMessage);
      // Don't show alert, just log warning
    }
  }

  initMap() {
    // If already initialized, just refresh size
    if (this.map) {
      console.warn('[RouteMap] Map already initialized, refreshing size');
      this.map.invalidateSize(true);
      console.log('[RouteMap] Size after refresh:', this.map.getSize());
      return;
    }
    const container = document.getElementById('map');
    if (!container) {
      console.error('[RouteMap] Map container not found');
      return;
    }

    // Check if container has size
    const rect = container.getBoundingClientRect();
    console.log('[RouteMap] Container size:', rect.width, 'x', rect.height);

    if (rect.height === 0 || rect.width === 0) {
      console.warn('[RouteMap] Container has no size, retrying...');
      setTimeout(() => this.initMap(), 100);
      return;
    }

    const defaultCenter: [number, number] = [4.6097, -74.0817]; // Bogotá
    const current = this.currentPosition();

    try {
      this.map = L.map('map', {
        zoomControl: true,
        attributionControl: true,
      }).setView(
        current ? [current.latitude, current.longitude] : defaultCenter,
        current ? 15 : 12
      );

      // Add OpenStreetMap tile layer
      const tiles = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
          minZoom: 10,
        }
      );

      tiles.addTo(this.map);

      // Wait for tiles to load before hiding spinner
      tiles.on('load', () => {
        console.log('[RouteMap] Map tiles loaded');
        this.loading.set(false);
      });

      // Fallback: hide loading after 2 seconds even if tiles don't load
      setTimeout(() => {
        if (this.loading()) {
          console.log('[RouteMap] Hiding loading (timeout)');
          this.loading.set(false);
        }
      }, 2000);

      // Force map to recalculate size multiple times to ensure proper rendering
      const invalidateSizes = [16, 100, 300, 500, 1000];
      invalidateSizes.forEach((delay) => {
        setTimeout(() => {
          if (this.map) {
            this.map.invalidateSize(true);
            console.log(
              '[RouteMap] Map size invalidated at',
              delay,
              'ms',
              this.map.getSize()
            );
          }
        }, delay);
      });

      // Also try on next animation frames for safety
      if (this.map) {
        const tryFrames = 4;
        let frame = 0;
        const rafInvalidate = () => {
          if (!this.map || frame >= tryFrames) return;
          this.map.invalidateSize(true);
          console.log('[RouteMap] RAF invalidate', frame, this.map.getSize());
          frame++;
          requestAnimationFrame(rafInvalidate);
        };
        requestAnimationFrame(rafInvalidate);
      }

      // Use ResizeObserver to handle dynamic size changes
      this.resizeObserver = new ResizeObserver(() => {
        if (this.map) {
          this.map.invalidateSize(true);
          console.log(
            '[RouteMap] ResizeObserver invalidate',
            this.map.getSize()
          );
        }
      });
      this.resizeObserver.observe(container);

      // Handle window resize events (throttled)
      let resizeTimer: any = null;
      const onWindowResize = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (this.map) {
            this.map.invalidateSize(true);
            console.log(
              '[RouteMap] Window resize invalidate',
              this.map.getSize()
            );
          }
        }, 120);
      };
      window.addEventListener('resize', onWindowResize);
      // Clean up listener on destroy by attaching to map removal
      const originalRemove = this.map.remove.bind(this.map);
      this.map.remove = () => {
        window.removeEventListener('resize', onWindowResize);
        return originalRemove();
      };

      // Add driver marker if position available
      if (current) {
        this.addDriverMarker(current);
      }

      // Add delivery markers
      this.addDeliveryMarkers();

      console.log('[RouteMap] Map initialized successfully');
    } catch (error) {
      console.error('[RouteMap] Error initializing map:', error);
      this.loading.set(false);
    }
  }

  addDriverMarker(coords: Coordinates) {
    if (!this.map) return;

    const icon = L.divIcon({
      className: 'driver-marker',
      html: `<div style="background: #3b82f6; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    this.driverMarker = L.marker([coords.latitude, coords.longitude], {
      icon,
    })
      .addTo(this.map)
      .bindPopup('Tu ubicación actual');

    // Only center on first add, not on updates
    // this.map.setView([coords.latitude, coords.longitude], 15);
  }

  updateDriverMarker(coords: Coordinates) {
    if (!this.map || !this.driverMarker) {
      this.addDriverMarker(coords);
      return;
    }

    this.driverMarker.setLatLng([coords.latitude, coords.longitude]);
  }

  addDeliveryMarkers() {
    if (!this.map) return;

    // Clear existing markers
    this.deliveryMarkers.forEach((marker) => marker.remove());
    this.deliveryMarkers = [];

    const stops = this.sortedStops();

    stops.forEach((stop, index) => {
      const icon = L.divIcon({
        className: 'delivery-marker',
        html: `<div style="background: #ef4444; color: white; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">${
          index + 1
        }</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker(
        [stop.coordinates.latitude, stop.coordinates.longitude],
        { icon }
      )
        .addTo(this.map!)
        .bindPopup(
          `
          <div style="min-width: 200px;">
            <strong>Entrega #${index + 1}</strong><br>
            <strong>Orden:</strong> ${stop.order.id}<br>
            <strong>Cliente:</strong> ${stop.order.customer?.name || 'N/A'}<br>
            <strong>Dirección:</strong> ${
              stop.order.delivery?.address || 'N/A'
            }<br>
            ${
              stop.distance
                ? `<strong>Distancia:</strong> ${stop.distance.toFixed(2)} km`
                : ''
            }
          </div>
        `
        );

      this.deliveryMarkers.push(marker);
    });

    // Don't auto-fit bounds as it moves the map constantly
    // User can manually zoom/pan to see all markers
  }

  drawRoute() {
    if (!this.map) return;

    // Clear existing routes
    this.routePolylines.forEach((line) => line.remove());
    this.routePolylines = [];

    const current = this.currentPosition();
    const stops = this.sortedStops();

    if (!current || stops.length === 0) return;

    // Draw lines from current position to each stop in order
    let previousPoint: [number, number] = [current.latitude, current.longitude];

    stops.forEach((stop, index) => {
      const currentPoint: [number, number] = [
        stop.coordinates.latitude,
        stop.coordinates.longitude,
      ];

      const polyline = L.polyline([previousPoint, currentPoint], {
        color: index === 0 ? '#3b82f6' : '#94a3b8',
        weight: index === 0 ? 4 : 2,
        opacity: index === 0 ? 0.8 : 0.5,
        dashArray: index === 0 ? undefined : '5, 10',
      }).addTo(this.map!);

      this.routePolylines.push(polyline);
      previousPoint = currentPoint;
    });
  }

  loadDeliveries() {
    const tid = this.tenantId();
    const bid = this.branchId();
    const did = this.driverId();

    if (!tid || !bid || !did) {
      this.loading.set(false);
      return;
    }

    this.orderService.getDriverOrders(tid, bid, did).subscribe({
      next: (orders) => {
        // Filter only pending and active deliveries
        const activeOrders = orders.filter(
          (o) =>
            o.delivery?.status === 'assigned' ||
            o.delivery?.status === 'accepted' ||
            o.delivery?.status === 'picked_up' ||
            o.delivery?.status === 'in_transit'
        );

        // Convert to delivery stops with coordinates
        const stops: DeliveryStop[] = activeOrders
          .map((order) => {
            const address = order.delivery?.address;
            // TODO: Geocode address to coordinates
            // For now, using mock coordinates near Bogotá
            return {
              order,
              coordinates: this.mockGeocodeAddress(address || ''),
            };
          })
          .filter((stop) => stop.coordinates.latitude !== 0);

        this.deliveryStops.set(stops);

        // Update map
        setTimeout(() => {
          if (this.map) {
            this.addDeliveryMarkers();
            this.drawRoute();

            // Only fit bounds on initial load
            if (!this.initialViewSet && this.deliveryMarkers.length > 0) {
              const markers = [...this.deliveryMarkers];
              if (this.driverMarker) {
                markers.push(this.driverMarker);
              }
              const group = L.featureGroup(markers);
              this.map.fitBounds(group.getBounds().pad(0.1));
              this.initialViewSet = true;
            }
          }
        }, 100);
      },
      error: (err) => {
        console.error('[RouteMap] Error loading deliveries:', err);
      },
    });
  }

  recalculateDistances(currentPos: Coordinates) {
    const stops = this.deliveryStops();
    stops.forEach((stop) => {
      stop.distance = this.geoService.calculateDistance(
        currentPos,
        stop.coordinates
      );
    });
    this.deliveryStops.set([...stops]);

    // Redraw route with updated order
    setTimeout(() => {
      this.addDeliveryMarkers();
      this.drawRoute();
    }, 50);
  }

  toggleSortOrder() {
    this.sortOrder.set(this.sortOrder() === 'nearest' ? 'farthest' : 'nearest');
    setTimeout(() => {
      this.addDeliveryMarkers();
      this.drawRoute();
    }, 50);
  }

  // Mock geocoding - replace with real geocoding service
  private mockGeocodeAddress(address: string): Coordinates {
    // Generate random coordinates near Bogotá for demo
    const baseLat = 4.6097;
    const baseLng = -74.0817;
    const randomOffset = () => (Math.random() - 0.5) * 0.05;

    return {
      latitude: baseLat + randomOffset(),
      longitude: baseLng + randomOffset(),
    };
  }

  private lastSyncTime = 0;
  private syncIntervalMs = 10000; // Sync every 10 seconds

  private syncLocationToBackend(coords: Coordinates) {
    const now = Date.now();

    // Throttle sync to avoid excessive requests
    if (now - this.lastSyncTime < this.syncIntervalMs) {
      return;
    }

    const tid = this.tenantId();
    const bid = this.branchId();
    const did = this.driverId();

    if (!tid || !bid || !did) return;

    this.lastSyncTime = now;

    this.orderService
      .updateDriverLocation(tid, bid, did, coords.latitude, coords.longitude)
      .subscribe({
        next: () => {
          console.log('[RouteMap] Location synced to backend');
        },
        error: (err) => {
          console.error('[RouteMap] Error syncing location:', err);
        },
      });
  }
}
