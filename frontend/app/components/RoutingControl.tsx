import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

export interface RouteResult {
  duration: number;   // seconds
  distance: number;   // meters
  name: string;       // route summary name
}

interface RoutingControlProps {
  waypoints?: [number, number][];   // Array of [lat, lng] tuples
  onRoutesFound?: (routes: RouteResult[]) => void;
  onRoutingError?: (error: string) => void;
}

export function RoutingControl({ waypoints, onRoutesFound, onRoutingError }: RoutingControlProps) {
  const map = useMap();
  const routingControlRef = useRef<L.Routing.Control | null>(null);

  // Store callbacks in refs to prevent dependency instability
  const onRoutesFoundRef = useRef(onRoutesFound);
  const onRoutingErrorRef = useRef(onRoutingError);
  
  onRoutesFoundRef.current = onRoutesFound;
  onRoutingErrorRef.current = onRoutingError;

  useEffect(() => {
    if (!waypoints || waypoints.length < 2) {
      if (routingControlRef.current) {
        routingControlRef.current.setWaypoints([]);
      }
      return;
    }

    const leafletWaypoints = waypoints.map(([lat, lng]) => L.latLng(lat, lng));

    // Initialize the routing control only once
    if (!routingControlRef.current) {
      const routingControl = L.Routing.control({
        waypoints: leafletWaypoints,
        routeWhileDragging: false,
        lineOptions: {
          styles: [{ color: '#4285F4', weight: 5, opacity: 0.85 }],
          extendToWaypoints: true,
          missingRouteTolerance: 0
        },
        show: false,
        addWaypoints: false,
        fitSelectedRoutes: false,
        // @ts-expect-error — createMarker is supported by leaflet-routing-machine but missing from definitely-typed definitions
        createMarker: (i: number, wp: any) => {
          const isOrigin = i === 0;
          const bgClass = isOrigin ? 'bg-[#4285F4]' : 'bg-[#EA4335]';
          const icon = L.divIcon({
            className: 'routing-waypoint-icon',
            html: `<div class="w-3.5 h-3.5 ${bgClass} border-[3px] border-white rounded-full shadow-md"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });
          return L.marker(wp.latLng, { icon, draggable: false });
        }
      });
      
      routingControl.on('routesfound', (e: any) => {
        if (onRoutesFoundRef.current && e.routes) {
          const results: RouteResult[] = e.routes.map((r: any) => ({
            duration: r.summary.totalTime,
            distance: r.summary.totalDistance,
            name: r.name || 'Route'
          }));
          onRoutesFoundRef.current(results);
        }
      });

      routingControl.on('routingerror', (e: any) => {
        if (onRoutingErrorRef.current) {
          onRoutingErrorRef.current(e.error?.message || 'Routing failed');
        }
      });

      routingControl.addTo(map);
      routingControlRef.current = routingControl;
    } else {
      // If already initialized, just update the waypoints instead of recreating it
      routingControlRef.current.setWaypoints(leafletWaypoints);
    }

    // Cleanup happens on unmount
    return () => {
      // Deliberately empty: we want to persist the control across waypoint updates
    };
  }, [map, waypoints]);

  // Handle rigid unmount cleanup
  useEffect(() => {
    return () => {
      if (routingControlRef.current) {
        map.removeControl(routingControlRef.current);
        routingControlRef.current = null;
      }
    };
  }, [map]);

  return null;
}
