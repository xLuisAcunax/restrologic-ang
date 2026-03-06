import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import {
  Style,
  Circle as CircleStyle,
  Fill,
  Stroke,
  Text,
  Icon,
} from 'ol/style';
import { Subscription, firstValueFrom } from 'rxjs';

import { AuthService } from '../../../../core/services/auth.service';
import { OrderService } from '../../../../core/services/order.service';
import {
  BusinessService,
  BranchSummary,
} from '../../../../core/services/business.service';
import {
  GeolocationService,
  Coordinates,
} from '../../../../core/services/geolocation.service';
import { GeocodingService } from '../../../../shared/services/geocoding.service';
import { Order } from '../../../../core/models/order.model';

interface DeliveryStop {
  order: Order;
  coordinates: Coordinates;
  distance?: number;
}

@Component({
  selector: 'app-route-map-ol',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './route-map-ol.component.html',
  styleUrls: ['./route-map-ol.component.css'],
})
export class RouteMapOlComponent implements OnInit, AfterViewInit, OnDestroy {
  private auth = inject(AuthService);
  private orderService = inject(OrderService);
  private geoService = inject(GeolocationService);
  private businessService = inject(BusinessService);
  private geocoder: GeocodingService = inject(GeocodingService);

  loading = signal(true);
  currentPosition = signal<Coordinates | null>(null);
  deliveryStops = signal<DeliveryStop[]>([]);

  tenantId = computed(() => this.auth.me()?.tenantId || '');
  branchId = computed(() => this.auth.me()?.branchId || '');
  driverId = computed(() => this.auth.me()?.id || '');

  private map: Map | null = null;
  private vectorSource = new VectorSource();
  private vectorLayer = new VectorLayer({ source: this.vectorSource });
  private positionSubscription: Subscription | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private lastSize: { w: number; h: number } = { w: 0, h: 0 };
  private cachedCity: string | null = null;
  private initialFitDone = false;
  private branchInfo: BranchSummary | null = null;
  private branchCenter: Coordinates | null = null;

  ngOnInit() {
    // Preload branch context to improve geocoding accuracy
    this.resolveBranchContext().finally(() => this.loadDeliveries());
  }

  private drawOrigin(origin: Coordinates, label: string) {
    // Remove previous origin feature
    const prev = this.vectorSource
      .getFeatures()
      .find((f) => f.get('kind') === 'origin');
    if (prev) this.vectorSource.removeFeature(prev);

    const feature = new Feature({
      geometry: new Point(fromLonLat([origin.longitude, origin.latitude])),
    });
    feature.set('kind', 'origin');

    // Store/shop icon SVG with solid colors
    const storeSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.3"/>
          </filter>
        </defs>
        <g filter="url(#shadow)">
          <!-- Building base -->
          <rect x="4" y="10" width="16" height="12" fill="#f97316" rx="1"/>
          <!-- Storefront awning -->
          <path d="M3 10 L21 10 L21 8 C21 7 20 6 19 6 L5 6 C4 6 3 7 3 8 Z" fill="#dc2626"/>
          <path d="M3 10 L21 10 L20 11 L4 11 Z" fill="#b91c1c"/>
          <!-- Awning stripes -->
          <rect x="6" y="6" width="2" height="5" fill="#fff" opacity="0.3"/>
          <rect x="10" y="6" width="2" height="5" fill="#fff" opacity="0.3"/>
          <rect x="14" y="6" width="2" height="5" fill="#fff" opacity="0.3"/>
          <rect x="18" y="6" width="2" height="5" fill="#fff" opacity="0.3"/>
          <!-- Door -->
          <rect x="10" y="14" width="4" height="8" fill="#7c2d12" rx="0.5"/>
          <circle cx="13" cy="18" r="0.4" fill="#fbbf24"/>
          <!-- Window left -->
          <rect x="5" y="12" width="3.5" height="3" fill="#60a5fa" rx="0.3"/>
          <line x1="6.7" y1="12" x2="6.7" y2="15" stroke="#fff" stroke-width="0.3"/>
          <line x1="5" y1="13.5" x2="8.5" y2="13.5" stroke="#fff" stroke-width="0.3"/>
          <!-- Window right -->
          <rect x="15.5" y="12" width="3.5" height="3" fill="#60a5fa" rx="0.3"/>
          <line x1="17.2" y1="12" x2="17.2" y2="15" stroke="#fff" stroke-width="0.3"/>
          <line x1="15.5" y1="13.5" x2="19" y2="13.5" stroke="#fff" stroke-width="0.3"/>
          <!-- Sign -->
          <rect x="8" y="3" width="8" height="2.5" fill="#3b82f6" rx="0.3"/>
          <text x="12" y="5" font-size="1.8" fill="#fff" text-anchor="middle" font-weight="bold">STORE</text>
        </g>
      </svg>
    `;
    const iconDataUri = 'data:image/svg+xml;base64,' + btoa(storeSvg);

    const style = new Style({
      image: new Icon({
        src: iconDataUri,
        scale: 1,
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
      text: new Text({
        text: label,
        font: 'bold 12px sans-serif',
        fill: new Fill({ color: '#0f172a' }),
        backgroundFill: new Fill({ color: 'rgba(255,255,255,0.9)' }),
        padding: [3, 6, 3, 6],
        offsetY: -38,
      }),
    });
    feature.setStyle(style);
    this.vectorSource.addFeature(feature);
  }

  private parseColIntersection(
    address: string
  ): { via1: string; via2: string } | null {
    const a = this.normalizeColAddress(address);
    // Carrera 45 # 97-73 -> via1 = Carrera 45, via2 = Calle 97
    const m = a.match(
      /\b(Calle|Carrera|Transversal|Diagonal)\s*(\d+[A-Za-z]?(?:\s*bis)?)\s*(?:#|No\.?|N°|Nº)\s*(\d+[A-Za-z]?)/i
    );
    if (!m) return null;
    const vial = m[1];
    const viaNum = m[2];
    const cross = m[3];
    const crossVia = vial.toLowerCase() === 'carrera' ? 'Calle' : 'Carrera';
    return { via1: `${vial} ${viaNum}`, via2: `${crossVia} ${cross}` };
  }

  ngAfterViewInit() {
    this.initMap();
    // Give map a moment to initialize, then start location tracking
    setTimeout(() => this.initializeLocation(), 500);

    const el = document.getElementById('olmap');
    if (el) {
      // Observe visibility and enforce full render
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          const e = entries[0];
          if (e && e.isIntersecting) {
            this.ensureMapSized();
          }
        },
        { threshold: 0.05 }
      );
      this.intersectionObserver.observe(el);

      // Observe size changes
      this.resizeObserver = new ResizeObserver(() => {
        this.ensureMapSized();
      });
      this.resizeObserver.observe(el);
    }
  }

  ngOnDestroy() {
    if (this.positionSubscription) this.positionSubscription.unsubscribe();
    this.geoService.stopTracking();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.intersectionObserver) this.intersectionObserver.disconnect();
    this.map?.setTarget(undefined);
  }

  private initMap() {
    // Guard: if already exists, only update size
    if (this.map) {
      this.map.updateSize();
      return;
    }
    const defaultCenter: [number, number] = [-74.0817, 4.6097]; // lng, lat Bogotá

    this.map = new Map({
      target: 'olmap',
      layers: [new TileLayer({ source: new OSM() }), this.vectorLayer],
      view: new View({
        center: fromLonLat(defaultCenter),
        zoom: 12,
      }),
    });

    // Keep vector features above the tile layer
    this.vectorLayer.setZIndex(100);

    // Ensure proper sizing after initial render (timeouts + RAF)
    const delays = [16, 50, 150, 300, 600, 1000];
    delays.forEach((d) => setTimeout(() => this.map?.updateSize(), d));
    let rafs = 4;
    const rafTick = () => {
      if (!this.map || rafs-- <= 0) return;
      this.map.updateSize();
      requestAnimationFrame(rafTick);
    };
    requestAnimationFrame(rafTick);

    // Nudge layout engines that depend on window resize
    setTimeout(() => window.dispatchEvent(new Event('resize')), 60);

    // Final assurance
    this.ensureMapSized();
  }

  private async initializeLocation() {
    try {
      const pos = await this.geoService.getCurrentPosition();
      this.currentPosition.set(pos);
      const shouldRecenter =
        this.deliveryStops().length === 0 && !this.initialFitDone;
      this.centerAndMarkDriver(pos, shouldRecenter);

      this.positionSubscription = this.geoService.watchPosition().subscribe({
        next: (coords) => {
          this.currentPosition.set(coords);
          this.centerAndMarkDriver(coords, false);
        },
        error: (err) => {
          console.error('[RouteMapOL] Watch position error:', err);
        },
      });
    } catch (err) {
      console.error('[RouteMapOL] Failed to get initial position:', err);
    }
  }

  private reloadDeliveriesWithPosition() {
    // No longer needed since we use real geocoding
  }

  private async geocodeAddress(address: string): Promise<Coordinates> {
    if (!address || address.trim() === '') {
      // Fallback to current position if no address
      const current = this.currentPosition();
      return current || { latitude: 4.6097, longitude: -74.0817 };
    }

    try {
      // Prefer branch city/center; if far from driver, retry with driver city
      const current = this.currentPosition();
      const branchCity = null;
      const driverCity = await this.getCurrentCity();
      const baseBranch = this.branchCenter || current || null;

      const candidates = this.generateAddressCandidates(address);
      let firstTry: Coordinates | null = null;
      for (const cand of candidates) {
        firstTry = await this.searchNominatim(cand, branchCity, baseBranch);
        if (firstTry) break;
      }

      if (firstTry) {
        // If driver exists and result is very far from driver while driver and branch are far apart, retry driver city
        if (current && this.branchCenter) {
          const driverVsBranch = this.geoService.calculateDistance(
            current,
            this.branchCenter
          );
          const toDriver = this.geoService.calculateDistance(current, firstTry);
          if (driverVsBranch > 80 && toDriver > 40 && driverCity) {
            const secondTry = await this.searchNominatim(
              address,
              driverCity,
              current
            );
            if (secondTry) {
              const secondToDriver = this.geoService.calculateDistance(
                current,
                secondTry
              );
              // Prefer the closer to the driver
              if (secondToDriver + 5 < toDriver) {
                console.warn(
                  '[RouteMapOL] Switched geocode to driver city due to distance'
                );
                return secondTry;
              }
            }
          }
        }
        return firstTry;
      }

      // Branch attempt failed; try driver city if available
      if (driverCity) {
        for (const cand of candidates) {
          const alt = await this.searchNominatim(
            cand,
            driverCity,
            current || null
          );
          if (alt) return alt;
        }
      }

      // Fallback to base location with small offset (avoid driver position)
      const cur = this.branchCenter || {
        latitude: 4.6097,
        longitude: -74.0817,
      };
      console.warn(
        '[RouteMapOL] Using fallback coordinates for address:',
        address
      );
      return {
        latitude: cur.latitude + (Math.random() - 0.5) * 0.01,
        longitude: cur.longitude + (Math.random() - 0.5) * 0.01,
      };
    } catch (error) {
      console.error('[RouteMapOL] Geocoding error for', address, error);
      // Fallback to branch center instead of driver position
      return this.branchCenter || { latitude: 4.6097, longitude: -74.0817 };
    }
  }

  private async resolveBranchContext(): Promise<void> {
    try {
      const tid = this.tenantId();
      const bid = this.branchId();
      if (!tid || !bid) return;
      const resp = await firstValueFrom(this.businessService.getBranch(bid));
      this.branchInfo = resp ?? null;
      const hint = [this.branchInfo?.address, null, 'Colombia']
        .filter(Boolean)
        .join(', ');
      if (!hint) return;
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        hint
      )}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RestroLogic-Delivery-App/1.0' },
      });
      const data = await res.json();
      if (data && data.length > 0) {
        this.branchCenter = {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        };
      }
    } catch (e) {
      console.warn('[RouteMapOL] Unable to resolve branch context', e);
    }
  }

  private async getCurrentCity(): Promise<string | null> {
    if (this.cachedCity) return this.cachedCity;
    const current = this.currentPosition();
    if (!current) return null;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${current.latitude}&lon=${current.longitude}&zoom=10&addressdetails=1&accept-language=es`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RestroLogic-Delivery-App/1.0' },
      });
      const json = await res.json();
      const addr = json?.address || {};
      const city =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.municipality ||
        addr.county ||
        null;
      this.cachedCity = city;
      return city;
    } catch {
      return null;
    }
  }

  private async searchNominatim(
    address: string,
    city: string | null,
    base: Coordinates | null
  ): Promise<Coordinates | null> {
    const normalized = this.normalizeColAddress(address);
    const viewbox = base
      ? `${(base.longitude - 0.12).toFixed(6)},${(base.latitude - 0.12).toFixed(
          6
        )},${(base.longitude + 0.12).toFixed(6)},${(
          base.latitude + 0.12
        ).toFixed(6)}`
      : undefined;

    const withinBounds = (coords: Coordinates): boolean => {
      if (!base) return true;
      const km = this.geoService.calculateDistance(base, coords);
      return km <= 60; // tighten city radius to ~60km
    };

    const sameCity = (addr: any, expectedCity: string | null): boolean => {
      if (!expectedCity) return true;
      const c = (
        addr?.city ||
        addr?.town ||
        addr?.village ||
        addr?.municipality ||
        addr?.county ||
        ''
      )
        .toString()
        .toLowerCase();
      return c.includes(expectedCity.toLowerCase());
    };

    const fetchJson = async (params: URLSearchParams): Promise<any[]> => {
      const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RestroLogic-Delivery-App/1.0' },
      });
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    };

    // 1) Intersection first (e.g., "Carrera 45 & Calle 97")
    if (city) {
      const inter = this.parseColIntersection(normalized);
      if (inter) {
        const p = new URLSearchParams({
          format: 'json',
          limit: '1',
          addressdetails: '1',
          'accept-language': 'es',
          countrycodes: 'co',
          street: `${inter.via1} & ${inter.via2}`,
          city,
        });
        if (viewbox) {
          p.append('viewbox', viewbox);
          p.append('bounded', '1');
        }
        const dataI = await fetchJson(p);
        if (dataI.length > 0) {
          const r = dataI[0];
          const coords = {
            latitude: parseFloat(r.lat),
            longitude: parseFloat(r.lon),
          } as Coordinates;
          if (withinBounds(coords)) return coords;
        }
      }
    }

    // 2) Structured with housenumbers
    if (city) {
      const parsed = this.parseColAddress(normalized);
      if (parsed) {
        for (const hn of parsed.housenumbers) {
          const p = new URLSearchParams({
            format: 'json',
            limit: '1',
            addressdetails: '1',
            'accept-language': 'es',
            countrycodes: 'co',
            street: parsed.street,
            housenumber: hn,
            city,
          });
          if (viewbox) {
            p.append('viewbox', viewbox);
            p.append('bounded', '1');
          }
          const dataS = await fetchJson(p);
          if (dataS.length > 0) {
            // Prefer a result that matches street and city
            const r =
              dataS.find(
                (x) =>
                  this.roadMatches(x.address?.road, parsed.street) &&
                  sameCity(x.address, city)
              ) || dataS[0];
            const coords = {
              latitude: parseFloat(r.lat),
              longitude: parseFloat(r.lon),
            } as Coordinates;
            if (withinBounds(coords)) return coords;
          }
        }
      }

      // 3) Structured street-only
      const p2 = new URLSearchParams({
        format: 'json',
        limit: '1',
        addressdetails: '1',
        'accept-language': 'es',
        countrycodes: 'co',
        street: normalized,
        city,
      });
      if (viewbox) {
        p2.append('viewbox', viewbox);
        p2.append('bounded', '1');
      }
      const dataS2 = await fetchJson(p2);
      if (dataS2.length > 0) {
        const r = dataS2.find((x) => sameCity(x.address, city)) || dataS2[0];
        const coords = {
          latitude: parseFloat(r.lat),
          longitude: parseFloat(r.lon),
        } as Coordinates;
        if (withinBounds(coords)) return coords;
      }
    }

    // 4) Free-form fallback
    const q = city
      ? `${normalized}, ${city}, Colombia`
      : `${normalized}, Colombia`;
    const p3 = new URLSearchParams({
      format: 'json',
      limit: '1',
      addressdetails: '1',
      'accept-language': 'es',
      countrycodes: 'co',
      q,
    });
    if (viewbox) {
      p3.append('viewbox', viewbox);
      p3.append('bounded', '1');
    }
    const dataF = await fetchJson(p3);
    if (dataF.length > 0) {
      const r = dataF[0];
      const coords = {
        latitude: parseFloat(r.lat),
        longitude: parseFloat(r.lon),
      } as Coordinates;
      if (withinBounds(coords)) return coords;
    }

    return null;
  }

  private normalizeColAddress(address: string): string {
    let a = address.trim();
    a = a.replace(/\./g, ' ');
    a = a.replace(/\b(Kr|Kra|Cr|Cra)\b/gi, 'Carrera');
    a = a.replace(/\b(Cll|Cl)\b/gi, 'Calle');
    a = a.replace(/\b(Av|Avda)\b/gi, 'Avenida');
    a = a.replace(/\b(Tv|Transv|Trans)\b/gi, 'Transversal');
    a = a.replace(/\b(Dg|Diag)\b/gi, 'Diagonal');
    // keep '#', just pad with spaces for consistency
    a = a.replace(/\s*#\s*/g, ' # ');
    a = a.replace(/\bNo\.?\b/gi, '#');
    a = a.replace(/\s+/g, ' ').trim();
    return a;
  }

  private generateAddressCandidates(address: string): string[] {
    const norm = this.normalizeColAddress(address);
    // Regex for formats like: Carrera 45 # 97-73
    const m = norm.match(
      /\b(Calle|Carrera|Transversal|Diagonal)\s*(\d+)\s*(?:#|No|N°|Nº)\s*(\d+)(?:\s*-\s*(\d+))?/i
    );
    if (!m) return [norm];
    const vial = m[1];
    const numVia = m[2];
    const cross = m[3];
    const tail = m[4] || '';
    const sepTail = tail ? `-${tail}` : '';
    const sameViaStreet = `${vial} ${numVia} ${cross}${sepTail}`; // for structured 'street'
    const sharpForm = `${vial} ${numVia} # ${cross}${sepTail}`; // for free-form
    const cornerVia = vial.toLowerCase() === 'carrera' ? 'Calle' : 'Carrera';
    const cornerForm = `${vial} ${numVia} con ${cornerVia} ${cross}`;
    return [sameViaStreet, sharpForm, cornerForm, norm];
  }

  private parseColAddress(
    address: string
  ): { street: string; housenumbers: string[] } | null {
    const a = this.normalizeColAddress(address);
    // Match: Carrera 45 # 97-73  | Calle 97 # 45-73
    const m = a.match(
      /\b(Calle|Carrera|Transversal|Diagonal)\s*(\d+[A-Za-z]?(?:\s*bis)?)\s*(?:#|No\.?|N°|Nº)\s*(\d+[A-Za-z]?)(?:\s*-\s*(\d+))?/i
    );
    if (!m) return null;
    const vial = m[1];
    const viaNum = m[2];
    const cross = m[3];
    const tail = m[4] || '';
    const street = `${vial} ${viaNum}`;
    const hn1 = tail ? `${cross}-${tail}` : `${cross}`;
    const hn2 = tail ? `${cross} ${tail}` : `${cross}`;
    return { street, housenumbers: [hn1, hn2] };
  }

  private centerAndMarkDriver(coords: Coordinates, recenter: boolean = true) {
    if (!this.map) return;

    // Remove ONLY previous driver feature, keep stops
    const featuresToRemove: Feature[] = [];
    this.vectorSource.getFeatures().forEach((f) => {
      if (f.get('kind') === 'driver') {
        featuresToRemove.push(f);
      }
    });
    featuresToRemove.forEach((f) => this.vectorSource.removeFeature(f));

    const feature = new Feature({
      geometry: new Point(fromLonLat([coords.longitude, coords.latitude])),
    });
    feature.setStyle(
      new Style({
        image: new CircleStyle({
          radius: 12,
          fill: new Fill({ color: '#3b82f6' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
        }),
      })
    );
    feature.set('kind', 'driver');
    this.vectorSource.addFeature(feature);

    if (recenter) {
      this.map.getView().setZoom(15);
      this.map
        .getView()
        .setCenter(fromLonLat([coords.longitude, coords.latitude]));
      setTimeout(() => this.map?.updateSize(), 50);
      this.ensureMapSized();
    }
  }

  private loadDeliveries() {
    const tid = this.tenantId();
    const bid = this.branchId();
    const did = this.driverId();
    if (!tid || !bid || !did) {
      this.loading.set(false);
      return;
    }

    this.orderService.getDriverOrders(tid, bid, did).subscribe({
      next: async (orders) => {
        const active = orders.filter(
          (o) =>
            o.delivery?.status === 'assigned' ||
            o.delivery?.status === 'accepted' ||
            o.delivery?.status === 'picked_up' ||
            o.delivery?.status === 'in_transit'
        );

        // Geocode addresses in parallel
        const stops: (DeliveryStop | null)[] = await Promise.all(
          active.map(async (order) => {
            console.log(
              '[RouteMapOL] Processing order:',
              order.id,
              'delivery:',
              order.delivery
            );
            // Prefer stored location if available
            const loc = order.delivery?.location;
            let coordinates: Coordinates;
            if (
              loc &&
              typeof loc.lat === 'number' &&
              typeof loc.lng === 'number'
            ) {
              coordinates = { latitude: loc.lat, longitude: loc.lng };
            } else {
              const address = order.delivery?.address || '';
              if (!address || address.trim() === '') {
                console.warn(
                  '[RouteMapOL] ⚠️ Order',
                  order.id,
                  'has NO address - skipping'
                );
                return null;
              }
              const cityHint = null;
              const g = await this.geocoder.geocodeAddress(
                address,
                cityHint || undefined
              );
              if (g) {
                coordinates = g;
              } else {
                console.warn(
                  '[RouteMapOL] ✗ Geocoding FAILED for order',
                  order.id,
                  'address:',
                  address
                );
                coordinates = await this.geocodeAddress(address);
              }
            }
            return { order, coordinates };
          })
        );

        // Filter out null stops (orders without addresses)
        const validStops: DeliveryStop[] = stops.filter(
          (stop): stop is DeliveryStop => stop !== null && !!stop.coordinates
        );

        // ALWAYS geocode branch address as the origin (restaurant/sucursal)
        const branchAddress = this.branchInfo?.address || '';
        const branchCity = undefined;
        console.log(
          '[RouteMapOL] Geocoding branch address:',
          branchAddress,
          'city:',
          branchCity
        );

        let origin: Coordinates | null = null;
        if (branchAddress && branchAddress.trim() !== '') {
          origin = await this.geocoder.geocodeAddress(
            branchAddress,
            branchCity
          );
          console.log('[RouteMapOL] Branch geocoding result:', origin);
        }

        if (origin) {
          validStops.forEach((stop) => {
            stop.distance = this.geoService.calculateDistance(
              origin!,
              stop.coordinates
            );
          });
          validStops.sort((a, b) => (a.distance || 0) - (b.distance || 0));
          // Draw persistent origin marker with business + branch name
          const tenantName = this.branchInfo?.name || 'Negocio';
          const branchName = this.branchInfo?.name || 'Sucursal';
          this.drawOrigin(origin, `${tenantName} · ${branchName}`);
        }

        this.deliveryStops.set(validStops);
        this.drawStops();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private drawStops() {
    // remove previous stops
    this.vectorSource.getFeatures().forEach((f) => {
      if (f.get('kind') === 'stop') this.vectorSource.removeFeature(f);
    });

    this.deliveryStops().forEach((stop, idx) => {
      const f = new Feature({
        geometry: new Point(
          fromLonLat([stop.coordinates.longitude, stop.coordinates.latitude])
        ),
      });
      f.set('kind', 'stop');
      f.set('stopNumber', idx + 1);

      // Numbered marker
      f.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 16,
            fill: new Fill({ color: '#ef4444' }),
            stroke: new Stroke({ color: '#ffffff', width: 3 }),
          }),
          text: new Text({
            text: (idx + 1).toString(),
            fill: new Fill({ color: '#ffffff' }),
            font: 'bold 14px sans-serif',
          }),
        })
      );

      this.vectorSource.addFeature(f);
    });

    setTimeout(() => this.map?.updateSize(), 50);
    this.ensureMapSized();
    this.maybeFitToFeatures();

    // Draw route through all stops if available
    if (this.deliveryStops().length > 0 && this.currentPosition()) {
      this.drawRouteToAllStops();
    }
  }

  private ensureMapSized(retries: number = 20) {
    const el = document.getElementById('olmap');
    if (!this.map || !el) return;

    const w = el.clientWidth;
    const h = el.clientHeight;
    const size = this.map.getSize();
    const mw = size ? size[0] : 0;
    const mh = size ? size[1] : 0;

    if ((mw !== w || mh !== h) && retries > 0) {
      this.map.updateSize();
      // backoff a bit
      setTimeout(() => this.ensureMapSized(retries - 1), 80);
    }
  }

  private maybeFitToFeatures() {
    if (!this.map || this.initialFitDone) return;
    const features = this.vectorSource.getFeatures();
    if (!features.length) return;
    const extent = this.vectorSource.getExtent();
    this.map.getView().fit(extent, {
      padding: [80, 80, 80, 80],
      maxZoom: 17,
      duration: 450,
    });
    this.initialFitDone = true;
    setTimeout(() => this.map?.updateSize(), 80);
  }

  private normalizeTxt(s: string | undefined): string {
    return (s || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private roadMatches(road: string | undefined, expected: string): boolean {
    const r = this.normalizeTxt(road);
    const e = this.normalizeTxt(expected);
    return !!r && r.includes(e);
  }

  private async drawRouteToAllStops() {
    const stops = this.deliveryStops();
    if (stops.length === 0) {
      console.log('[RouteMapOL] No stops for routing');
      return;
    }

    // ALWAYS determine origin from branch address, NOT device position
    const branchAddress = this.branchInfo?.address || '';

    let origin: Coordinates | null = null;
    if (branchAddress && branchAddress.trim() !== '') {
      origin = await this.geocoder.geocodeAddress(branchAddress, '');
      console.log('[RouteMapOL] Branch geocoding result:', origin);
    }

    if (!origin) {
      console.log(
        '[RouteMapOL] No origin available (could not geocode branch)'
      );
      return;
    }

    // Draw/update origin marker with business + branch label
    const tenantName = this.branchInfo?.name || 'Negocio';
    const branchName = this.branchInfo?.name || 'Sucursal';
    this.drawOrigin(origin, `${tenantName} · ${branchName}`);

    try {
      // Build waypoints: origin -> stop1 -> stop2 -> ... -> stopN
      const waypoints = [
        `${origin.longitude},${origin.latitude}`,
        ...stops.map(
          (s) => `${s.coordinates.longitude},${s.coordinates.latitude}`
        ),
      ].join(';');

      const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;

      console.log(
        '[RouteMapOL] Fetching multi-stop route from OSRM for',
        stops.length,
        'stops'
      );
      const res = await fetch(url);
      const json = await res.json();

      if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
        const route = json.routes[0];
        const coords = route.geometry.coordinates as [number, number][];
        const distance = (route.distance / 1000).toFixed(2); // km
        const duration = Math.round(route.duration / 60); // min
        console.log(
          `[RouteMapOL] Route: ${stops.length} stops, ${distance} km, ~${duration} min`
        );
        this.drawPolyline(coords);
      } else {
        console.warn('[RouteMapOL] OSRM returned no route:', json);
      }
    } catch (e) {
      console.error('[RouteMapOL] Failed to draw multi-stop route:', e);
    }
  }

  private async drawRouteToStop(stop: DeliveryStop) {
    const driver = this.currentPosition();
    if (!driver) {
      console.log('[RouteMapOL] No driver position available for routing');
      return;
    }

    try {
      // Use OSRM (OpenStreetMap Routing Machine) - free and no CORS issues
      const url = `https://router.project-osrm.org/route/v1/driving/${driver.longitude},${driver.latitude};${stop.coordinates.longitude},${stop.coordinates.latitude}?overview=full&geometries=geojson`;

      console.log('[RouteMapOL] Fetching route from OSRM:', url);
      const res = await fetch(url);
      const json = await res.json();

      if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
        const route = json.routes[0];
        const coords = route.geometry.coordinates as [number, number][];
        console.log(
          '[RouteMapOL] Route received with',
          coords.length,
          'points'
        );
        this.drawPolyline(coords);
      } else {
        console.warn('[RouteMapOL] OSRM returned no route:', json);
      }
    } catch (e) {
      console.error('[RouteMapOL] Failed to draw route:', e);
    }
  }

  private drawPolyline(coords: [number, number][]) {
    // Remove previous route
    this.vectorSource.getFeatures().forEach((f) => {
      if (f.get('kind') === 'route') this.vectorSource.removeFeature(f);
    });

    const line = new LineString(coords.map((c) => fromLonLat(c)));
    const feature = new Feature({ geometry: line });
    feature.set('kind', 'route');
    feature.setStyle(
      new Style({
        stroke: new Stroke({ color: '#3b82f6', width: 4 }),
      })
    );
    this.vectorSource.addFeature(feature);
  }

  // Mock geocoding - use driver's current location as base
  private mockGeocode(
    address: string,
    basePosition: Coordinates | null
  ): Coordinates {
    // If we have driver's position, use it as base; otherwise use a default
    const baseLat = basePosition?.latitude || 4.6097;
    const baseLng = basePosition?.longitude || -74.0817;

    // Generate random offset within ~2-5 km radius
    const randomOffset = () => (Math.random() - 0.5) * 0.04; // ~2km radius

    return {
      latitude: baseLat + randomOffset(),
      longitude: baseLng + randomOffset(),
    };
  }
}
