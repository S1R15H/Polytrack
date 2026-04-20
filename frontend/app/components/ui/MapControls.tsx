import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * MapControls — rendered inside MapContainer as a react-leaflet child.
 * Uses useMap() to wire zoom/locate to the Leaflet instance.
 * Positioned via a custom Leaflet Control in the 'bottomright' slot.
 */
interface MapControlsProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  latestTelemetry?: { latitude: number; longitude: number } | null;
}

export function MapControls({ initialCenter = [28.147725, -81.848810], initialZoom = 12, latestTelemetry }: MapControlsProps) {
  const map = useMap();
  const telemetryRef = useRef(latestTelemetry);

  useEffect(() => {
    telemetryRef.current = latestTelemetry;
  }, [latestTelemetry]);

  useEffect(() => {
    const container = L.DomUtil.create('div', 'polytrack-map-controls leaflet-control');
    container.style.marginTop = '80px';
    
    // Using Tailwind classes directly to prevent needing imperative style injection
    container.innerHTML = `
      <div class="flex flex-col gap-2">
        <button class="w-11 h-11 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center cursor-pointer transition-all duration-150 text-gray-500 hover:shadow-md hover:text-gray-700 active:scale-95" title="Find Vehicle" data-action="locate">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </button>
        <button class="w-11 h-11 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center cursor-pointer transition-all duration-150 text-gray-500 hover:shadow-md hover:text-gray-700 active:scale-95" title="Zoom In" data-action="zoomIn">
          <span class="text-lg font-light text-gray-600">+</span>
        </button>
        <button class="w-11 h-11 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center cursor-pointer transition-all duration-150 text-gray-500 hover:shadow-md hover:text-gray-700 active:scale-95" title="Zoom Out" data-action="zoomOut">
          <span class="text-lg font-light text-gray-600">−</span>
        </button>
        <button class="w-11 h-11 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center cursor-pointer transition-all duration-150 text-gray-500 hover:shadow-md hover:text-gray-700 active:scale-95" title="Reset View" data-action="reset">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
      </div>
    `;

    // Prevent map events from leaking through control clicks
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    // Wire button actions using Leaflet's event handling for cross-browser safety
    container.querySelectorAll('[data-action]').forEach((btn) => {
      L.DomEvent.on(btn as HTMLElement, 'click', (e) => {
        L.DomEvent.stopPropagation(e as Event);
        L.DomEvent.preventDefault(e as Event);
        
        const action = (btn as HTMLElement).dataset.action;
        if (action === 'zoomIn') map.zoomIn();
        else if (action === 'zoomOut') map.zoomOut();
        else if (action === 'locate') {
          const loc = telemetryRef.current;
          if (loc) {
            map.flyTo([loc.latitude, loc.longitude], 16, { animate: true, duration: 1.5 });
          } else {
             // Provides console feedback that a click was registered but no vehicle was found
             console.warn("Locate: No active vehicle telemetry found.");
          }
        }
        else if (action === 'reset') map.setView(initialCenter, initialZoom, { animate: true });
      });
    });

    // Create a Leaflet control for proper positioning
    const CustomControl = L.Control.extend({
      onAdd: () => container,
      onRemove: () => {},
    });
    const control = new CustomControl({ position: 'topright' }) as L.Control;
    control.addTo(map);

    return () => {
      map.removeControl(control);
    };
  }, [map, initialCenter, initialZoom]);

  return null;
}
