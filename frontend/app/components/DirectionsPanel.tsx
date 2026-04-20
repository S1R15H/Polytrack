import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { saveRoute } from '../lib/api';
import { SearchBar, type GeocodedLocation } from './ui/SearchBar';

interface DirectionsPanelProps {
  onClose: () => void;
  initialOrigin?: string;
  initialDestination?: string;
  initialMode?: TravelMode;
  initialOriginCoords?: [number, number] | null;
  initialDestCoords?: [number, number] | null;
  onStartNavigation?: (origin: [number, number], dest: [number, number], originName: string, geometry: [number, number][]) => void;
  onMyPositionSelect?: (lat: number, lng: number) => void;
  onRouteSelect?: (route: RouteResult) => void;
  onShowToast?: (msg: string) => void;
}

type TravelMode = 'drive' | 'walk' | 'bike';

const OSRM_PROFILES: Record<TravelMode, string> = {
  drive: 'car',
  walk: 'foot',
  bike: 'bike',
};

interface RouteResult {
  duration: string;
  via: string;
  distance: string;
  durationRaw: number;
  geometry: [number, number][];
}

// Removed: geocodeAddress has been deprecated. The SearchBar now strictly enforces explicit coordinate selection.

async function fetchOSRMRoute(
  origin: [number, number],
  dest: [number, number],
  profile: string
): Promise<RouteResult[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout to prevent hanging

  try {
    const coords = `${origin[1]},${origin[0]};${dest[1]},${dest[0]}`;
    
    // Using community FOSSGIS server for all routing profiles 
    const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/${profile}/${coords}?overview=full&geometries=geojson&alternatives=true`;
    
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return [];
    return data.routes
      .map((route: any, i: number) => ({
        duration: formatDuration(route.duration),
        via: route.legs?.[0]?.summary || `Route ${i + 1}`,
        distance: `${(route.distance / 1609.34).toFixed(1)} mi`,
        durationRaw: route.duration,
        geometry: route.geometry && route.geometry.coordinates ? route.geometry.coordinates.map((c: any) => [c[1], c[0]]) : [],
      }))
      .sort((a: RouteResult, b: RouteResult) => a.durationRaw - b.durationRaw);
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h} hr ${m} min`;
}

export function DirectionsPanel({ 
  onClose, 
  onStartNavigation, 
  onMyPositionSelect, 
  onRouteSelect, 
  initialOrigin = '', 
  initialDestination = '', 
  initialMode = 'drive',
  initialOriginCoords = null,
  initialDestCoords = null,
  onShowToast
}: DirectionsPanelProps) {
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [mode, setMode] = useState<TravelMode>(initialMode);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modeEtas, setModeEtas] = useState<Record<TravelMode, string | null>>({ drive: null, walk: null, bike: null });
  const [isNamingRoute, setIsNamingRoute] = useState(false);
  const [routeName, setRouteName] = useState("");

  const onRouteSelectRef = useRef(onRouteSelect);
  useEffect(() => {
    onRouteSelectRef.current = onRouteSelect;
  }, [onRouteSelect]);

  // Sync incoming map pointer requests when the panel is already open
  useEffect(() => {
    if (initialOrigin) {
      setOrigin(initialOrigin);
      setCachedOrigin(initialOriginCoords ?? null);
    }
  }, [initialOrigin, initialOriginCoords]);

  useEffect(() => {
    if (initialDestination) {
      setDestination(initialDestination);
      setCachedDest(initialDestCoords ?? null);
    }
  }, [initialDestination, initialDestCoords]);

  // Cache geocoded coords so mode switching doesn't re-geocode
  const [cachedOrigin, setCachedOrigin] = useState<[number, number] | null>(initialOriginCoords);
  const [cachedDest, setCachedDest] = useState<[number, number] | null>(initialDestCoords);

  const calculateRoutes = useCallback(async (selectedMode: TravelMode, originCoords: [number, number], destCoords: [number, number]) => {
    setIsLoading(true);
    setError(null);

    // 1. Fetch strictly the requested active mode first to INSTANTLY unblock the UI.
    const activeRouteResults = await fetchOSRMRoute(originCoords, destCoords, OSRM_PROFILES[selectedMode]);
    
    setRoutes(activeRouteResults);
    if (activeRouteResults.length === 0) {
      setError('No routes found for this baseline mode. Try a different transport mode.');
    } else {
      setSelectedRouteIndex(0);
      if (onRouteSelectRef.current) onRouteSelectRef.current(activeRouteResults[0]);
    }

    setIsLoading(false); // UI unblocked! Let user look at the result.

    // 2. Passively fetch the other remaining modes in the background to pre-populate the little ETA tags on the tabs.
    const modeEtaCache: Record<TravelMode, string | null> = { drive: null, walk: null, bike: null };
    modeEtaCache[selectedMode] = activeRouteResults.length > 0 ? formatDuration(activeRouteResults[0].durationRaw) : null;
    
    // Partially update what we know right now
    setModeEtas({ ...modeEtaCache });

    const remainingModes: TravelMode[] = ['drive', 'walk', 'bike'].filter(m => m !== selectedMode) as TravelMode[];
    
    // Don't await this, just run fire-and-forget in background
    Promise.all(remainingModes.map(async (m) => {
      const r = await fetchOSRMRoute(originCoords, destCoords, OSRM_PROFILES[m]);
      return { mode: m, eta: r.length > 0 ? formatDuration(r[0].durationRaw) : null };
    })).then((results) => {
      results.forEach(res => {
         modeEtaCache[res.mode] = res.eta;
      });
      // Safety check to ensure we only update if the component is still mounted / coords haven't changed:
      setModeEtas({ ...modeEtaCache });
    });

  }, []);

  const handleCalculateRoutes = () => {
    if (!cachedOrigin || !cachedDest) {
      setError("Please search and select explicit addresses for both origin and destination.");
      return;
    }
    setError(null);
    calculateRoutes(mode, cachedOrigin, cachedDest);
  };

  const confirmSaveRoute = async () => {
    if (!cachedOrigin || !cachedDest || routes.length === 0 || !routeName.trim()) return;
    try {
      setIsSaving(true);
      const activeRoute = routes[selectedRouteIndex];
      
      await saveRoute({
        name: routeName.trim(),
        origin_name: origin,
        destination_name: destination,
        origin_lat: cachedOrigin[0],
        origin_lng: cachedOrigin[1],
        dest_lat: cachedDest[0],
        dest_lng: cachedDest[1],
        mode,
        distance: activeRoute.distance,
        duration: activeRoute.duration
      });
      setIsNamingRoute(false);
      if (onShowToast) onShowToast("Route saved successfully!");
    } catch (e) {
      console.error(e);
      setError('Error saving route. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMyPosition = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setIsLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setOrigin("My Location");
        setCachedOrigin([latitude, longitude]);
        setIsLoading(false);
        if (onMyPositionSelect) {
          onMyPositionSelect(latitude, longitude);
        }
      },
      (error) => {
        console.error("Error getting location:", error);
        setError("Unable to retrieve your location. " + error.message);
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  useEffect(() => {
    // If mounting with explicit locations (like from a clicked saved route), auto-calculate immediately
    if (initialOriginCoords && initialDestCoords) {
      calculateRoutes(initialMode, initialOriginCoords, initialDestCoords);
    }
  }, []);

  // Re-calculate when mode changes if we have cached coords
  useEffect(() => {
    if (cachedOrigin && cachedDest) {
      calculateRoutes(mode, cachedOrigin, cachedDest);
    }
  }, [mode, cachedOrigin, cachedDest, calculateRoutes]);

  const modes: { id: TravelMode; label: string; icon: ReactNode }[] = [
    {
      id: 'drive', label: 'Drive',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h8m-8 4h8m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
        </svg>
      ),
    },
    {
      id: 'walk', label: 'Walk',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      id: 'bike', label: 'Bike',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="absolute inset-0 md:relative md:inset-auto w-full md:w-[400px] max-w-full bg-white h-full flex flex-col shadow-2xl z-50 md:z-30 border-r border-gray-100">
      {/* Header */}
      <div className="flex items-center gap-3 p-5 border-b border-gray-100">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-gray-900">Directions</h2>
      </div>

      {/* Origin / Destination Geocoders */}
      <div className="p-5 space-y-3 relative">
        <div className="flex items-center">
          <SearchBar
            value={origin}
            onChange={(val) => { setOrigin(val); setCachedOrigin(null); }}
            placeholder="Search an origin address..."
            icon={<span className="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0" title="Origin"></span>}
            onSearch={(loc: GeocodedLocation) => {
              setOrigin(loc.displayName);
              setCachedOrigin([loc.lat, loc.lng]);
            }}
          />
        </div>
        
        <div className="flex items-center relative z-40">
          <SearchBar
            value={destination}
            onChange={(val) => { setDestination(val); setCachedDest(null); }}
            placeholder="Search a destination..."
            icon={<span className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0" title="Destination"></span>}
            onSearch={(loc: GeocodedLocation) => {
              setDestination(loc.displayName);
              setCachedDest([loc.lat, loc.lng]);
            }}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleMyPosition}
            disabled={isLoading}
            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            My position
          </button>
          <button
            onClick={handleCalculateRoutes}
            disabled={!cachedOrigin || !cachedDest || isLoading}
            className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-xl font-medium text-sm transition-all active:scale-[0.98]"
          >
            {isLoading ? 'Calculating...' : 'Find Routes'}
          </button>
        </div>
      </div>

      {/* Travel mode tabs with ETAs */}
      <div className="flex gap-1 px-5 pb-4">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-1 ${
              mode === m.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center gap-1.5">{m.icon}{m.label}</div>
            {modeEtas[m.id] && (
              <span className={`text-[10px] font-normal ${mode === m.id ? 'text-gray-300' : 'text-gray-400'}`}>
                {modeEtas[m.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-3 px-4 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
            <span className="text-sm">Calculating routes...</span>
          </div>
        </div>
      )}

      {/* Route results */}
      {!isLoading && routes.length > 0 && (
        <div className="flex-1 overflow-y-auto px-5 space-y-2">
          {routes.map((route, i) => (
            <div 
              key={i} 
              onClick={() => {
                setSelectedRouteIndex(i);
                if (onRouteSelect) onRouteSelect(route);
              }}
              className={`cursor-pointer rounded-xl p-3 -mx-1 transition-colors border ${selectedRouteIndex === i ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-transparent'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl font-bold text-gray-900">{route.duration}</span>
                {i === 0 && routes.length > 1 && (
                  <span className="text-xs font-semibold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">Fastest</span>
                )}
              </div>
              <p className="text-sm text-gray-600">{route.via}</p>
              <div className="flex items-center gap-1 text-sm text-gray-400 mt-0.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {route.distance}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && routes.length === 0 && !error && (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-sm text-gray-400 text-center">
            Enter origin and destination, then press <strong>Find Routes</strong> to calculate travel times.
          </p>
        </div>
      )}

      {/* Start Navigation */}
      {routes.length > 0 && (
        <div className="p-5 border-t border-gray-100 flex gap-3">
          {isNamingRoute ? (
             <div className="flex-1 flex flex-col gap-3">
                <input 
                  type="text" 
                  value={routeName} 
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="Route name..."
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button 
                    onClick={confirmSaveRoute} 
                    disabled={isSaving || !routeName.trim()} 
                    className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-md"
                  >
                     {isSaving ? 'Saving...' : 'Save Route'}
                  </button>
                  <button 
                    onClick={() => setIsNamingRoute(false)} 
                    disabled={isSaving} 
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition-colors"
                  >
                     Cancel
                  </button>
                </div>
             </div>
          ) : (
            <>
              <button 
                onClick={() => {
                  if (cachedOrigin && cachedDest && onStartNavigation && routes[selectedRouteIndex]) {
                    onStartNavigation(cachedOrigin, cachedDest, origin, routes[selectedRouteIndex].geometry);
                  }
                }}
                className="flex-1 py-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-semibold text-sm shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
              >
                Start Navigation
              </button>
              <button 
                onClick={() => {
                  const defaultName = `${origin.split(',')[0]} to ${destination.split(',')[0]}`;
                  setRouteName(defaultName);
                  setIsNamingRoute(true);
                }}
                disabled={isSaving}
                className="px-5 py-3.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-2xl font-semibold text-sm shadow-sm transition-all active:scale-[0.98]"
                title="Save Route"
              >
                <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
