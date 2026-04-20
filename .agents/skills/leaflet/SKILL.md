---
name: leaflet
description: How to integrate Leaflet for real-time vehicle tracking, route polylines, and responsive map views in PolyTrack.
---

# Leaflet Integration Skill

## Overview

PolyTrack uses Leaflet to render live vehicle positions, historical route polylines, and geofence boundaries. This skill covers setup, real-time marker updates, and dead reckoning interpolation.

---

## Setup

### 1. Include Leaflet JS and CSS

If using plain HTML:
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
```

If using React, install `leaflet` and `react-leaflet`, and import the CSS in your root file:
```javascript
import 'leaflet/dist/leaflet.css';
```

### 2. Initialize the Map

```javascript
// Remember that Leaflet uses [lat, lng], whereas Mapbox/GeoJSON uses [lng, lat]!
const map = L.map('map-container').setView([40.730610, -73.935242], 13);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);
```

---

## Real-Time Vehicle Markers

### Create a Marker for Each Device

We can use custom `divIcon` to style markers dynamically like we would with HTML elements.

```javascript
const markers = {};  // { deviceId: L.Marker }

function updateVehiclePosition(deviceId, lng, lat, heading) {
  // Leaflet uses LatLng [lat, lng]
  if (!markers[deviceId]) {
    // Create new custom marker
    const customIcon = L.divIcon({
      className: 'vehicle-marker-icon',
      html: `<div class="marker-body" style="transform: rotate(${heading || 0}deg);">
               <div class="pulse-ring"></div>
             </div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    markers[deviceId] = L.marker([lat, lng], { icon: customIcon })
      .bindPopup(`Device: ${deviceId}`)
      .addTo(map);
  } else {
    // Update existing marker position
    markers[deviceId].setLatLng([lat, lng]);
    
    // Update rotation
    if (heading !== null) {
      const iconElement = markers[deviceId].getElement();
      if (iconElement) {
        const body = iconElement.querySelector('.marker-body');
        if (body) {
           body.style.transform = `rotate(${heading}deg)`;
        }
      }
    }
  }
}
```

### Vehicle Marker CSS

```css
.vehicle-marker-icon {
  background: transparent;
  border: none;
}
.marker-body {
  width: 24px;
  height: 24px;
  background: #3b82f6;
  border: 3px solid #1d4ed8;
  border-radius: 50% 50% 50% 0; /* Arrow shape */
  transform: rotate(-45deg);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  position: relative;
  transition: transform 0.1s linear; /* Smooth rotation */
}
.pulse-ring {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border: 2px solid #60a5fa;
  border-radius: 50%;
  animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
}
@keyframes ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}
```

---

## Dead Reckoning (Interpolation)

Smooth marker movement between WebSocket updates:

```javascript
function interpolatePosition(marker, targetLng, targetLat, durationMs = 1000) {
  const start = marker.getLatLng(); // {lat, lng}
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const t = Math.min(elapsed / durationMs, 1);  // 0 → 1

    const lat = start.lat + (targetLat - start.lat) * t;
    const lng = start.lng + (targetLng - start.lng) * t;
    
    marker.setLatLng([lat, lng]);

    if (t < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}
```

---

## Historical Route Polyline

Draw a route from telemetry history:

```javascript
let routeLayer = null;

async function drawRouteHistory(deviceId) {
  const res = await fetch(`/api/v1/telemetry/history/${deviceId}`);
  const data = await res.json();

  // Leaflet polyline takes an array of [lat, lng]
  const latlngs = data.points.map(p => [p.latitude, p.longitude]);

  if (routeLayer) {
    map.removeLayer(routeLayer);
  }

  routeLayer = L.polyline(latlngs, {
    color: '#3b82f6',
    weight: 3,
    opacity: 0.7,
  }).addTo(map);

  // Zoom map to fit the route
  map.fitBounds(routeLayer.getBounds());
}
```

---

## Geofence Visualization

```javascript
function drawGeofence(geofence) {
  // Leaflet can parse GeoJSON directly. 
  // Remember GeoJSON uses [lng, lat], but L.geoJSON handles the conversion.
  L.geoJSON(geofence.boundary, {
    style: {
      color: '#ef4444',
      weight: 2,
      opacity: 1,
      fillColor: '#ef4444',
      fillOpacity: 0.15
    }
  }).addTo(map);
}
```

---

## Responsive Views

| View | Audience | Behavior |
|------|----------|----------|
| **Dispatcher Dashboard** | Operations staff | Full map + sidebar with device list, status table, alerts |
| **Rider Mobile View** | Passengers | Full-screen map centered on the vehicle they're tracking |

### Map Invalidation

If your sidebar toggles open/closed and changes the map container size, Leaflet must be told to recalculate its viewport:

```javascript
// Call after the sidebar animation finishes
map.invalidateSize();
```