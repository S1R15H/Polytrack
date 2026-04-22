import type { MetaFunction } from "react-router";
import { useState, useEffect, lazy, Suspense, useCallback } from "react";
import { useTelemetryWebSocket } from "../hooks/useTelemetryWebSocket";
import { SearchBar } from "../components/ui/SearchBar";
import type { GeocodedLocation } from "../components/ui/SearchBar";
import { DirectionsButton } from "../components/ui/DirectionsButton";
import { BottomNav } from "../components/ui/BottomNav";
import { DirectionsPanel } from "../components/DirectionsPanel";
import { SavedRoutesPanel } from "../components/SavedRoutesPanel";
import { AiChatPanel } from "../components/AiChatPanel";
import type { SavedRoute } from "../lib/api";

type TabId = 'explore' | 'go' | 'saved';

// Issue #4: Derive WS URL from environment or window.location
const WS_URL = typeof window !== "undefined"
  ? (import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws/telemetry")
  : "ws://localhost:8000/ws/telemetry";

const ClientLiveMap = lazy(async () => {
  const module = await import("../components/LiveMap");
  return { default: module.LiveMap };
});

export const meta: MetaFunction = () => {
  return [
    { title: "PolyTrack — Live Map" },
    { name: "description", content: "Real-time fleet tracking map" },
  ];
};

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getPointToSegmentDistanceSq(p: [number, number], p1: [number, number], p2: [number, number]) {
  const latRatio = 111139;
  const lngRatio = 111139 * Math.cos(p[0] * Math.PI / 180);
  
  const x = p[1] * lngRatio, y = p[0] * latRatio;
  const x1 = p1[1] * lngRatio, y1 = p1[0] * latRatio;
  const x2 = p2[1] * lngRatio, y2 = p2[0] * latRatio;

  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;
  return dx * dx + dy * dy;
}

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [showDirections, setShowDirections] = useState(false);
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [directionsInitial, setDirectionsInitial] = useState<{origin: string, dest: string, mode: any, originCoords?: [number, number], destCoords?: [number, number]} | null>(null);
  const [searchTarget, setSearchTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('explore');
  const [goWaypoints, setGoWaypoints] = useState<[number, number][] | undefined>(undefined);
  const [navigatingPolyline, setNavigatingPolyline] = useState<[number, number][] | undefined>(undefined);
  const [previewPolyline, setPreviewPolyline] = useState<[number, number][] | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string, lat: number, lng: number } | null>(null);

  const [pendingOriginVehicleId, setPendingOriginVehicleId] = useState<string | null>(null);
  const [navigatingVehicleId, setNavigatingVehicleId] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const { isConnected, latestData } = useTelemetryWebSocket(WS_URL);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSearchSelect = useCallback((loc: GeocodedLocation) => {
    setSearchTarget({ lat: loc.lat, lng: loc.lng });
    setShowSearchOverlay(true);
  }, []);

  const handleStartNavigation = useCallback((origin: [number, number], dest: [number, number], originName: string, geometry: [number, number][]) => {
    setGoWaypoints([origin, dest]);
    setNavigatingPolyline(geometry);
    
    // Check if the Origin was set explicitly to a vehicle entity.
    if (originName.startsWith('Vehicle ') && pendingOriginVehicleId) {
        setNavigatingVehicleId(pendingOriginVehicleId);
    } else {
        setNavigatingVehicleId(null);
    }
    
    setShowDirections(false);
    setPreviewPolyline(undefined);
    setActiveTab('go');
  }, [pendingOriginVehicleId]);

  // Turn-by-Turn Dynamic Routing Engine
  useEffect(() => {
     if (activeTab === 'go' && navigatingVehicleId && latestData && navigatingPolyline && navigatingPolyline.length >= 2 && goWaypoints) {
         if (latestData.device_id === navigatingVehicleId) {
            const p = [latestData.latitude, latestData.longitude] as [number, number];
            let minDistanceSq = Infinity;
            let closestSegmentIndex = 0;

            for (let i = 0; i < navigatingPolyline.length - 1; i++) {
               const distSq = getPointToSegmentDistanceSq(p, navigatingPolyline[i], navigatingPolyline[i + 1]);
               if (distSq < minDistanceSq) {
                  minDistanceSq = distSq;
                  closestSegmentIndex = i;
               }
            }

            const minDistanceMeters = Math.sqrt(minDistanceSq);

            if (minDistanceMeters > 20) {
               // DIVERSION TRIGGERED - Background OSRM recalculation
               const dest = goWaypoints[goWaypoints.length - 1];
               const profile = directionsInitial?.mode === 'walk' ? 'foot' : directionsInitial?.mode === 'bike' ? 'bike' : 'car';
               const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/${profile}/${p[1]},${p[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson&alternatives=false`;
               
               fetch(url)
                  .then(res => res.json())
                  .then(data => {
                     if (data.code === 'Ok' && data.routes?.length) {
                        const newGeom = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
                        setNavigatingPolyline(newGeom);
                        setGoWaypoints([p, dest]);
                     }
                  })
                  .catch(err => console.error("Recalculation error:", err));

            } else if (closestSegmentIndex > 0) {
               // CHOP THE POLYLINE cleanly behind the vehicle driver!
               setNavigatingPolyline(prev => {
                  if (!prev) return prev;
                  if (closestSegmentIndex >= prev.length - 1) return prev;
                  const remaining = prev.slice(closestSegmentIndex + 1);
                  return [p, ...remaining];
               });
            }
         }
     }
  }, [latestData, activeTab, navigatingVehicleId, goWaypoints, navigatingPolyline, directionsInitial?.mode]);

  // Destination breached active tracking
  useEffect(() => {
     if (activeTab === 'go' && goWaypoints && goWaypoints.length >= 2 && latestData) {
         // Prevent the destination hook from prematurely triggering if we are dynamically navigating
         // a vehicle and it isn't even the vehicle currently pinging the loop!
         if (navigatingVehicleId && latestData.device_id !== navigatingVehicleId) return;

         const dest = goWaypoints[goWaypoints.length - 1];
         const dist = getDistance(latestData.latitude, latestData.longitude, dest[0], dest[1]);
         
         if (dist < 30) { // 30 meters threshold
            showToast('Navigation Complete: Destination Reached! 🏁');
            setActiveTab('explore');
            setGoWaypoints(undefined);
            setNavigatingPolyline(undefined);
            setPreviewPolyline(undefined);
            setNavigatingVehicleId(null);
         }
     }
  }, [activeTab, navigatingVehicleId, goWaypoints, latestData, showToast]);

  if (!mounted) return null;

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 overflow-hidden font-sans">
      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">

        {showDirections && (
          <DirectionsPanel 
            onClose={() => {
              setShowDirections(false);
              setDirectionsInitial(null);
              setPreviewPolyline(undefined);
            }} 
            initialOrigin={directionsInitial?.origin}
            initialDestination={directionsInitial?.dest}
            initialMode={directionsInitial?.mode}
            initialOriginCoords={directionsInitial?.originCoords}
            initialDestCoords={directionsInitial?.destCoords}
            onStartNavigation={handleStartNavigation}
            onMyPositionSelect={(lat, lng) => setSearchTarget({ lat, lng })}
            onRouteSelect={(route) => setPreviewPolyline(route.geometry)}
            onShowToast={showToast}
          />
        )}

        {/* Saved Routes sidebar */}
        {showSavedRoutes && (
          <SavedRoutesPanel 
            onClose={() => setShowSavedRoutes(false)}
            onRouteSelect={(route: SavedRoute) => {
              setShowSavedRoutes(false);
              setDirectionsInitial({
                origin: route.origin_name,
                dest: route.destination_name,
                mode: route.mode as any,
                originCoords: [route.origin_lat, route.origin_lng],
                destCoords: [route.dest_lat, route.dest_lng]
              });
              setShowDirections(true);
            }}
            onShowToast={showToast}
          />
        )}

        {/* Map fills remaining space */}
        <div className="flex-1 relative z-0">

          {/* AI Chat sidebar */}
          {showAiChat && (
            <AiChatPanel onClose={() => setShowAiChat(false)} />
          )}

          <Suspense
            fallback={
              <div className="w-full h-full bg-gray-200 animate-pulse flex items-center justify-center text-gray-400 text-sm font-medium">
                Loading Map...
              </div>
            }
          >
            <ClientLiveMap
              latestTelemetry={latestData}
              activeDeviceIds={navigatingVehicleId ? [navigatingVehicleId] : []}
              isNavigating={!!navigatingVehicleId}
              theme="light"
              searchTarget={searchTarget}
              routeWaypoints={goWaypoints}
              navigatingPolyline={navigatingPolyline}
              previewPolyline={previewPolyline}
              onDeviceSelect={(id, lat, lng) => setSelectedDevice({ id, lat, lng })}
              onSearchMarkerClick={() => setShowSearchOverlay(true)}
              onShowToast={showToast}
            />
          </Suspense>

          {/* ============ TOAST ============ */}
          {toastMessage && (
            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[60] bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 transition-all">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-semibold">{toastMessage}</span>
            </div>
          )}

          {/* ============ FLOATING OVERLAYS ============ */}

          {/* Device Selection Overlay */}
          {selectedDevice && activeTab !== 'go' && (
            <div className="absolute bottom-20 md:bottom-28 left-4 right-4 md:left-1/2 md:-translate-x-1/2 z-40 bg-white shadow-2xl rounded-2xl p-4 flex flex-col gap-3 md:min-w-[300px] border border-gray-100 transition-all duration-300">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Vehicle {selectedDevice.id.split('-')[0]}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Location: {selectedDevice.lat.toFixed(5)}, {selectedDevice.lng.toFixed(5)}</p>
                </div>
                <button 
                  onClick={() => setSelectedDevice(null)} 
                  className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full p-1.5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-2 mt-1">
                <button 
                  onClick={() => {
                     setDirectionsInitial({
                       origin: `Vehicle ${selectedDevice.id.split('-')[0]}`,
                       dest: '',
                       mode: 'drive',
                       originCoords: [selectedDevice.lat, selectedDevice.lng]
                     });
                     setPendingOriginVehicleId(selectedDevice.id);
                     setShowDirections(true);
                     setSelectedDevice(null);
                  }}
                  className="flex-1 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-semibold text-sm transition-colors border border-blue-200"
                >
                  Set as Origin
                </button>
                <button 
                  onClick={() => {
                     setDirectionsInitial({
                       origin: '',
                       dest: `Vehicle ${selectedDevice.id.split('-')[0]}`,
                       mode: 'drive',
                       destCoords: [selectedDevice.lat, selectedDevice.lng]
                     });
                     setShowDirections(true);
                     setSelectedDevice(null);
                  }}
                  className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-semibold text-sm transition-colors border border-red-200"
                >
                  Set as Dest
                </button>
              </div>
            </div>
          )}

          {/* Search Target Selection Overlay */}
          {searchTarget && showSearchOverlay && !selectedDevice && activeTab !== 'go' && (
            <div className="absolute bottom-20 md:bottom-28 left-4 right-4 md:left-1/2 md:-translate-x-1/2 z-40 bg-white shadow-2xl rounded-2xl p-4 flex flex-col gap-3 md:min-w-[300px] border border-gray-100 transition-all duration-300">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    📍 Search Result
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Location: {searchTarget.lat.toFixed(5)}, {searchTarget.lng.toFixed(5)}</p>
                </div>
                <button 
                  onClick={() => setShowSearchOverlay(false)} 
                  className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full p-1.5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-2 mt-1">
                <button 
                  onClick={() => {
                     setDirectionsInitial({
                       origin: searchQuery || 'Pin Location',
                       dest: '',
                       mode: 'drive',
                       originCoords: [searchTarget.lat, searchTarget.lng]
                     });
                     setShowDirections(true);
                     setShowSearchOverlay(false);
                  }}
                  className="flex-1 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-semibold text-sm transition-colors border border-blue-200"
                >
                  Set as Origin
                </button>
                <button 
                  onClick={() => {
                     setDirectionsInitial({
                       origin: '',
                       dest: searchQuery || 'Pin Location',
                       mode: 'drive',
                       destCoords: [searchTarget.lat, searchTarget.lng]
                     });
                     setShowDirections(true);
                     setShowSearchOverlay(false);
                  }}
                  className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-semibold text-sm transition-colors border border-red-200"
                >
                  Set as Dest
                </button>
              </div>
            </div>
          )}

          {/* Top row: Search + Live View + Directions (same horizontal row) */}
          {activeTab !== 'go' ? (
            <div className="absolute top-4 left-3 right-3 md:left-4 md:right-4 z-40 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3 pointer-events-none">
              <div className="flex justify-center w-full flex-1 max-w-xl px-0 md:px-4 pointer-events-auto">
                <SearchBar 
                  value={searchQuery}
                  onChange={(val) => {
                    setSearchQuery(val);
                    if (val.trim() === '') {
                       setSearchTarget(null);
                       setShowSearchOverlay(false);
                    }
                  }}
                  onSearch={handleSearchSelect} 
                  onAiClick={() => {
                    setShowAiChat(true);
                    setShowDirections(false);
                    setShowSavedRoutes(false);
                  }}
                  showAiButton={true}
                  showQuickCategories={true}
                />
              </div>
              <div className="pointer-events-auto flex w-full sm:w-auto justify-end sm:justify-start">
                <DirectionsButton onClick={() => setShowDirections(true)} />
              </div>
            </div>
          ) : (
            <div className="absolute top-4 left-3 right-3 md:left-4 md:right-4 z-40 bg-blue-600 shadow-xl rounded-2xl p-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-bold text-lg">Navigating...</h2>
                  <p className="text-blue-100 text-sm">Follow the highlighted route</p>
                </div>
              </div>
              <button 
                onClick={() => { setActiveTab('explore'); setGoWaypoints(undefined); setNavigatingPolyline(undefined); setNavigatingVehicleId(null); }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-medium text-sm transition-colors"
              >
                End Route
              </button>
            </div>
          )}

          {/* Issue #14: Connection status indicator */}
          <div className={`absolute bottom-4 right-4 z-30 px-3 py-1.5 rounded-full text-xs font-medium shadow-md border ${
            isConnected
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
              : 'bg-red-50 text-red-600 border-red-200'
          }`}>
            <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
            {isConnected ? 'Live' : 'Offline'}
          </div>

          {/* Attribution badge (bottom-left, above bottom nav) */}
          <div className="absolute bottom-2 left-3 z-20 text-[10px] text-gray-500">
            © OpenStreetMap
          </div>
        </div>
      </div>

      {/* Bottom navigation bar */}
      <BottomNav 
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'saved') {
            setShowSavedRoutes(true);
            setShowDirections(false);
            setGoWaypoints(undefined);
            setNavigatingPolyline(undefined);
            setPreviewPolyline(undefined);
          } else if (tab === 'go') {
            setShowDirections(true);
            setShowSavedRoutes(false);
            setPreviewPolyline(undefined);
          } else { // 'explore'
            setShowSavedRoutes(false);
            setShowDirections(false);
            setGoWaypoints(undefined);
            setNavigatingPolyline(undefined);
            setPreviewPolyline(undefined);
          }
        }} 
      />
    </div>
  );
}
