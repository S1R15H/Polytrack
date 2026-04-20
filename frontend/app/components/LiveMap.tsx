import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LiveTelemetryData } from '../hooks/useTelemetryWebSocket';
import { RoutingControl, type RouteResult } from './RoutingControl';
import { MapControls } from './ui/MapControls';

// PolyTrack default center (NYC as an example)
const DEFAULT_CENTER: [number, number] = [28.147725, -81.848810];

interface LiveMapProps {
  latestTelemetry: LiveTelemetryData | null;
  activeDeviceIds?: string[];
  theme?: 'dark' | 'light';
  showControls?: boolean;
  routeWaypoints?: [number, number][];
  navigatingPolyline?: [number, number][];
  onRoutesFound?: (routes: RouteResult[]) => void;
  onRoutingError?: (error: string) => void;
  onMapCenterChange?: (center: [number, number]) => void;
  searchTarget?: { lat: number; lng: number } | null;
  previewPolyline?: [number, number][];
  onDeviceSelect?: (deviceId: string, lat: number, lng: number) => void;
  onShowToast?: (msg: string) => void;
  onSearchMarkerClick?: () => void;
  isNavigating?: boolean;
}

function MapCenterTracker({ onCenterChange }: { onCenterChange?: (center: [number, number]) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onCenterChange) return;
    // Report initial center
    const c = map.getCenter();
    onCenterChange([c.lat, c.lng]);

    const handler = () => {
      const center = map.getCenter();
      onCenterChange([center.lat, center.lng]);
    };
    map.on('moveend', handler);
    return () => { map.off('moveend', handler); };
  }, [map, onCenterChange]);
  return null;
}

function MapPreviewFitter({ previewPolyline }: { previewPolyline?: [number, number][] }) {
  const map = useMap();
  
  useEffect(() => {
    if (previewPolyline && previewPolyline.length > 0) {
      const bounds = L.latLngBounds(previewPolyline);
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { 
          paddingTopLeft: [50, 100], // Extra top padding for the floating search bar
          paddingBottomRight: [50, 50],
          animate: true, 
          duration: 1.5 
        });
      }
    }
  }, [previewPolyline, map]);
  
  return null;
}

// Helper function to generate vehicle SVG marker
function getVehicleIconHtml(heading: number | null): string {
  const rot = heading !== null ? heading : 0;
  return `
    <div class="relative w-10 h-10 transition-transform duration-300 flex items-center justify-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" style="transform: rotate(${rot}deg); transform-origin: center;">
      <svg width="34" height="34" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <!-- Wheels -->
        <rect x="22" y="25" width="6" height="15" rx="2" fill="#1e293b"/>
        <rect x="72" y="25" width="6" height="15" rx="2" fill="#1e293b"/>
        <rect x="22" y="60" width="6" height="15" rx="2" fill="#1e293b"/>
        <rect x="72" y="60" width="6" height="15" rx="2" fill="#1e293b"/>
        <!-- Car body -->
        <path d="M32 15 L68 15 Q78 15 78 30 L78 70 Q78 85 68 85 L32 85 Q22 85 22 70 L22 30 Q22 15 32 15 Z" fill="#3b82f6" stroke="#2563eb" stroke-width="2"/>
        <!-- Windshield -->
        <path d="M32 30 L68 30 L62 42 L38 42 Z" fill="#bfdbfe"/>
        <!-- Rear window -->
        <path d="M36 60 L64 60 L68 70 L32 70 Z" fill="#bfdbfe"/>
        <!-- Headlights/Taillights -->
        <rect x="26" y="15" width="10" height="4" rx="2" fill="#fef08a"/>
        <rect x="64" y="15" width="10" height="4" rx="2" fill="#fef08a"/>
        <rect x="26" y="81" width="10" height="4" rx="2" fill="#ef4444"/>
        <rect x="64" y="81" width="10" height="4" rx="2" fill="#ef4444"/>
      </svg>
    </div>
  `;
}

function MapController({ 
  latestTelemetry, 
  activeDeviceIds, 
  searchTarget,
  isNavigating,
  onDeviceSelect,
  onSearchMarkerClick,
  onShowToast
}: { 
  latestTelemetry: LiveTelemetryData | null, 
  activeDeviceIds: string[], 
  searchTarget?: { lat: number; lng: number } | null,
  isNavigating?: boolean,
  onDeviceSelect?: (id: string, lat: number, lng: number) => void,
  onSearchMarkerClick?: () => void,
  onShowToast?: (msg: string) => void
}) {
  const map = useMap();
  const markersRef = useRef<Record<string, L.Marker>>({});
  const animationFramesRef = useRef<Record<string, number>>({});
  const markersLastSeenRef = useRef<Record<string, number>>({});
  const searchMarkerRef = useRef<L.Marker | null>(null);

  const onDeviceSelectRef = useRef(onDeviceSelect);
  const onSearchMarkerClickRef = useRef(onSearchMarkerClick);
  const onShowToastRef = useRef(onShowToast);
  const markersLastSeenPayloadTimeRef = useRef<Record<string, string>>({});

  useEffect(() => {
    onDeviceSelectRef.current = onDeviceSelect;
  }, [onDeviceSelect]);

  useEffect(() => {
    onSearchMarkerClickRef.current = onSearchMarkerClick;
  }, [onSearchMarkerClick]);

  useEffect(() => {
    onShowToastRef.current = onShowToast;
  }, [onShowToast]);

  const wasNavigatingRef = useRef(false);

  // Tighten zoom dynamically when navigation engages
  useEffect(() => {
     if (isNavigating && !wasNavigatingRef.current && activeDeviceIds.length > 0) {
        const primaryDevice = activeDeviceIds[0];
        if (markersRef.current[primaryDevice]) {
           const pos = markersRef.current[primaryDevice].getLatLng();
           map.flyTo(pos, 18, { animate: true, duration: 1.5 });
        }
     }
     wasNavigatingRef.current = !!isNavigating;
  }, [isNavigating, activeDeviceIds, map]);

  // 1. Marker TTL Cleanup (Memory Leak Fix)
  useEffect(() => {
    const TTL_MS = 10000; // Remove markers silent for 10 seconds
    const interval = setInterval(() => {
      const now = Date.now();
      Object.keys(markersLastSeenRef.current).forEach(deviceId => {
         if (now - markersLastSeenRef.current[deviceId] > TTL_MS) {
            // Idle device - Purge
            if (markersRef.current[deviceId]) {
               markersRef.current[deviceId].remove();
               delete markersRef.current[deviceId];
               if (onShowToastRef.current) {
                 onShowToastRef.current(`device '${deviceId.split('-')[0]}' disconnected`);
               }
            }
            if (animationFramesRef.current[deviceId]) {
               cancelAnimationFrame(animationFramesRef.current[deviceId]);
               delete animationFramesRef.current[deviceId];
            }
            delete markersLastSeenRef.current[deviceId];
         }
      });
    }, 1000); // check more frequently since TTL is small
    return () => clearInterval(interval);
  }, []);

  // Search target: fly to geocoded address and drop a marker
  useEffect(() => {
    if (!searchTarget) {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
        searchMarkerRef.current = null;
      }
      return;
    }

    // Remove previous search marker if exists
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }

    const { lat, lng } = searchTarget;

    // Create a red search marker
    const searchIcon = L.divIcon({
      html: `<div style="width:28px;height:28px;position:relative;">
               <div style="width:28px;height:28px;background:#ef4444;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(239,68,68,0.5);"></div>
             </div>`,
      className: 'search-marker-icon',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });

    const marker = L.marker([lat, lng], { icon: searchIcon }).addTo(map);
    
    marker.on('click', () => {
      if (onSearchMarkerClickRef.current) {
        onSearchMarkerClickRef.current();
      }
    });

    searchMarkerRef.current = marker;

    // Fly the map to the searched location
    map.flyTo([lat, lng], 16, { animate: true, duration: 2 });

    // Auto-remove marker after 30 seconds
    const timeout = setTimeout(() => {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
        searchMarkerRef.current = null;
      }
    }, 30000);

    return () => clearTimeout(timeout);
  }, [searchTarget, map]);

  const interpolatePosition = useCallback((
    marker: L.Marker,
    deviceId: string,
    targetLat: number,
    targetLng: number,
    durationMs: number = 1000
  ) => {
    const start = marker.getLatLng();
    const startTime = performance.now();

    if (animationFramesRef.current[deviceId]) {
      cancelAnimationFrame(animationFramesRef.current[deviceId]);
    }

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const t = Math.min(elapsed / durationMs, 1);

      const lat = start.lat + (targetLat - start.lat) * t;
      const lng = start.lng + (targetLng - start.lng) * t;
      
      marker.setLatLng([lat, lng]);

      if (t < 1) {
        animationFramesRef.current[deviceId] = requestAnimationFrame(animate);
      }
    }

    animationFramesRef.current[deviceId] = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (!latestTelemetry) return;
    const { device_id, latitude, longitude, heading, speed, recorded_at } = latestTelemetry;
    
    // Issue #6: useMemo for stable activeDeviceIds reference
    if (activeDeviceIds.length > 0 && !activeDeviceIds.includes(device_id)) return;

    // Fix Zombie Marker resurrection: Do not re-process exactly the same payload point due to React re-renders.
    if (markersLastSeenPayloadTimeRef.current[device_id] === recorded_at) {
       return;
    }
    markersLastSeenPayloadTimeRef.current[device_id] = recorded_at;

    // Issue #11: Read the previous lastSeen BEFORE updating it, so dynamic duration is correct
    const previousLastSeen = markersLastSeenRef.current[device_id];
    const now = Date.now();

    if (!markersRef.current[device_id]) {
      const customIcon = L.divIcon({
        html: getVehicleIconHtml(heading),
        className: 'custom-leaflet-icon bg-transparent border-0',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      const marker = L.marker([latitude, longitude], { icon: customIcon }).addTo(map);
      
      marker.on('click', () => {
         const currentPos = marker.getLatLng();
         if (onDeviceSelectRef.current) {
            onDeviceSelectRef.current(device_id, currentPos.lat, currentPos.lng);
         }
      });
      
      markersRef.current[device_id] = marker;
      markersLastSeenRef.current[device_id] = Date.now();

      if (Object.keys(markersRef.current).length === 1) {
        map.flyTo([latitude, longitude], isNavigating ? 18 : 14, { animate: true, duration: 2 });
      }
    } else {
      // Issue #11: Calculate duration from the PREVIOUS lastSeen (before updating)
      const dynamicDuration = previousLastSeen ? Math.max(now - previousLastSeen, 1000) : 1000;
      markersLastSeenRef.current[device_id] = now;

      interpolatePosition(
         markersRef.current[device_id], 
         device_id, 
         latitude, 
         longitude, 
         dynamicDuration
      );

      if (isNavigating && device_id === activeDeviceIds[0]) {
         map.panTo([latitude, longitude], { animate: true, duration: dynamicDuration / 1000 });
      }
      
      // Update heading dynamically by changing the icon
      if (heading !== null) {
         const customIcon = L.divIcon({
            html: getVehicleIconHtml(heading),
            className: 'custom-leaflet-icon bg-transparent border-0',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          });
         markersRef.current[device_id].setIcon(customIcon);
      }
    }

    return () => {
      // Intentionally not clearing all animations here to prevent fleet stutter
      // Cleanups are handled per-device above and globally on map unmount TTL
    };
  // Issue #6: Use memoized activeDeviceIds reference for stable deps
  }, [latestTelemetry, activeDeviceIds, isNavigating, map, interpolatePosition]);

  // 2. Map Unmount Animation Cleanup (Zombie Animation Fix)
  useEffect(() => {
    return () => {
      // Loop over active frames when the map is unmounting to prevent DOM traps
      Object.keys(animationFramesRef.current).forEach(deviceId => {
        if (animationFramesRef.current[deviceId]) {
          cancelAnimationFrame(animationFramesRef.current[deviceId]);
        }
      });
    };
  }, []);

  return null;
}

export function LiveMapInner({ 
  latestTelemetry,
  activeDeviceIds = [], 
  theme = 'dark',
  showControls = true,
  routeWaypoints,
  navigatingPolyline,
  onRoutesFound,
  onRoutingError,
  onMapCenterChange,
  searchTarget,
  previewPolyline,
  onDeviceSelect,
  onSearchMarkerClick,
  onShowToast,
  isNavigating
}: LiveMapProps) {
  
  // Use generic OSM for light theme, CartoDB Dark Matter for dark theme
  const tileUrl = theme === 'dark' 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    
  const tileAttribution = theme === 'dark'
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return (
    <div className="w-full h-full overflow-hidden relative z-0">
      <MapContainer 
         center={DEFAULT_CENTER} 
         zoom={12} 
         className="w-full h-full z-0"
         zoomControl={false}
      >
        <TileLayer
          attribution={tileAttribution}
          url={tileUrl}
        />
        {!navigatingPolyline && (
           <RoutingControl
             waypoints={routeWaypoints}
             onRoutesFound={onRoutesFound}
             onRoutingError={onRoutingError}
           />
        )}
        {navigatingPolyline && navigatingPolyline.length > 0 && (
           <Polyline positions={navigatingPolyline} pathOptions={{ color: '#4285F4', weight: 5, opacity: 0.85 }} />
        )}
        <MapCenterTracker onCenterChange={onMapCenterChange} />
        {showControls && <MapControls latestTelemetry={latestTelemetry} />}
        {previewPolyline && previewPolyline.length > 0 && (
           <>
             <Polyline positions={previewPolyline} pathOptions={{ color: '#4285F4', weight: 5, opacity: 0.85 }} />
             {/* Origin Marker */}
             <Marker 
                position={previewPolyline[0]} 
                icon={L.divIcon({
                  className: 'routing-waypoint-icon',
                  html: `<div class="w-3.5 h-3.5 bg-[#4285F4] border-[3px] border-white rounded-full shadow-md"></div>`,
                  iconSize: [14, 14],
                  iconAnchor: [7, 7]
                })} 
              />
              {/* Destination Marker */}
              <Marker 
                position={previewPolyline[previewPolyline.length - 1]} 
                icon={L.divIcon({
                  className: 'routing-waypoint-icon',
                  html: `<div class="w-4 h-4 bg-[#EA4335] border-[3px] border-white rounded-full shadow-md flex items-center justify-center"></div>`,
                  iconSize: [16, 16],
                  iconAnchor: [8, 8]
                })} 
              />
           </>
        )}
        <MapPreviewFitter previewPolyline={previewPolyline} />
        <MapController latestTelemetry={latestTelemetry} activeDeviceIds={activeDeviceIds} searchTarget={searchTarget} isNavigating={isNavigating} onDeviceSelect={onDeviceSelect} onSearchMarkerClick={onSearchMarkerClick} onShowToast={onShowToast} />
      </MapContainer>
    </div>
  );
}

class MapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean, errorMsg: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Map rendering error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[400px] rounded-2xl border border-red-500/50 bg-slate-900 flex flex-col items-center justify-center p-6 text-center shadow-2xl">
           <svg className="w-12 h-12 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
           </svg>
           <h3 className="text-lg font-bold text-white mb-2">Map Display Error</h3>
           <p className="text-slate-400 max-w-sm mb-4">The underlying mapping engine encountered an error. The dispatch dashboard remains active.</p>
           {this.state.errorMsg && (
             <div className="bg-red-950/50 text-red-200 text-xs font-mono p-3 rounded border border-red-900/50 max-w-lg break-all">
               {this.state.errorMsg}
             </div>
           )}
           <button 
             onClick={() => this.setState({ hasError: false, errorMsg: null })}
             className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
           >
             Retry Map Render
           </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function LiveMap(props: LiveMapProps) {
  return (
    <MapErrorBoundary>
      <LiveMapInner {...props} />
    </MapErrorBoundary>
  );
}
