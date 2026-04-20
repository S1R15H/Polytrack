import { useState, useEffect, useRef, useCallback } from "react";

const API_SERVER = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

interface TelemetryPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
}

interface TelemetryPayload extends TelemetryPoint {
  device_id: string;
  batch_id: string | null;
}

export function useSimulator(
  deviceId: string,
  startCoords: [number, number] | null = null,
  targetCoords: [number, number] | null = null
) {
  const [isActive, setIsActive] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [status, setStatus] = useState<"idle" | "running" | "error" | "reconnecting">("idle");
  const [lastPoint, setLastPoint] = useState<TelemetryPoint | null>(null);
  const [pointsTransmitted, setPointsTransmitted] = useState(0);
  const [cacheSize, setCacheSize] = useState(0);

  const watchIdRef = useRef<number | null>(null);

  // Load cache size initially
  useEffect(() => {
    const cache = localStorage.getItem("telemetry_cache");
    if (cache) {
      setCacheSize(JSON.parse(cache).length);
    }
    
    // Track network state
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    setIsOnline(navigator.onLine);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const flushCache = useCallback(async (): Promise<boolean> => {
    const cacheStr = localStorage.getItem("telemetry_cache");
    if (!cacheStr) return false;
    
    const cache: TelemetryPayload[] = JSON.parse(cacheStr);
    if (cache.length === 0) return false;

    // Chunk size of 100 to prevent payload blocking
    const batchToSend = cache.slice(0, 100);

    setStatus("reconnecting");
    const batchId = crypto.randomUUID();
    const batch = batchToSend.map(p => ({ ...p, batch_id: batchId }));

    try {
      const response = await fetch(`${API_SERVER}/telemetry/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });

      if (response.ok) {
        // RACE CONDITION FIX
        const freshCacheStr = localStorage.getItem("telemetry_cache");
        if (freshCacheStr) {
            const freshCache: TelemetryPayload[] = JSON.parse(freshCacheStr);
            const updatedCache = freshCache.slice(batch.length);
            
            if (updatedCache.length > 0) {
                localStorage.setItem("telemetry_cache", JSON.stringify(updatedCache));
                setCacheSize(updatedCache.length);
            } else {
                localStorage.removeItem("telemetry_cache");
                setCacheSize(0);
            }
        }
        
        setStatus("running");
        setPointsTransmitted(prev => prev + batch.length);
        return true;
      } else {
        throw new Error(`HTTP Error ${response.status}: Failed to accept batch payload.`);
      }
    } catch (err) {
      console.warn("Failed to flush cache batch:", err);
      setStatus("error");
      return false;
    }
  }, []);

  // Try flush when coming back online
  useEffect(() => {
    if (isOnline && cacheSize > 0) {
      flushCache();
    }
  }, [isOnline, cacheSize, flushCache]);

  const sendTelemetry = useCallback(async (payload: TelemetryPayload) => {
    try {
      const response = await fetch(`${API_SERVER}/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      setPointsTransmitted(prev => prev + 1);
      
      if (cacheSize > 0) {
        flushCache();
      }
      
    } catch (err) {
      console.warn("Network error, caching locally.");
      const cacheStr = localStorage.getItem("telemetry_cache");
      const cache = cacheStr ? JSON.parse(cacheStr) : [];
      
      const MAX_CACHE = 5000;
      if (cache.length >= MAX_CACHE) {
        cache.splice(0, cache.length - MAX_CACHE + 1); // Drop oldest
      }
      cache.push(payload);
      localStorage.setItem("telemetry_cache", JSON.stringify(cache));
      setCacheSize(cache.length);
      setStatus("error");
    }
  }, [cacheSize, flushCache]);

  useEffect(() => {
    if (isActive) {
      setStatus("running");
      
      // Starting location: Use user input, or fallback to map default (Florida)
      let currentLat = startCoords ? startCoords[0] : 28.147725;
      let currentLng = startCoords ? startCoords[1] : -81.848810;
      
      let heading = Math.random() * 360;

      const intervalId = window.setInterval(() => {
         if (targetCoords) {
           const dLat = targetCoords[0] - currentLat;
           const dLng = targetCoords[1] - currentLng;
           const dist = Math.sqrt(dLat * dLat + dLng * dLng); // Pythagoras simple bearing
           
           if (dist > 0.0001) {
             const STEP = 0.0002; // Roughly 22 m/s
             currentLat += (dLat / dist) * STEP;
             currentLng += (dLng / dist) * STEP;
             // Calculate true bearing from dy, dx
             heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
           } else {
             // Reached
             currentLat = targetCoords[0];
             currentLng = targetCoords[1];
           }
         } else {
           // Random walk fallback
           currentLat += (Math.random() - 0.5) * 0.0005;
           currentLng += (Math.random() - 0.5) * 0.0005;
         }
         
         const point: TelemetryPoint = {
           latitude: currentLat,
           longitude: currentLng,
           altitude: 15.2,
           speed: targetCoords ? 22.5 : 12.5,
           heading: heading,
           recorded_at: new Date().toISOString(),
         };
         
         setLastPoint(point);
         
         const payload: TelemetryPayload = {
           ...point,
           device_id: deviceId,
           batch_id: null
         };
         
         sendTelemetry(payload);
      }, 1000);

      watchIdRef.current = intervalId;

    } else {
      if (watchIdRef.current !== null) {
        window.clearInterval(watchIdRef.current);
        watchIdRef.current = null;
      }
      setStatus("idle");
    }

    return () => {
      if (watchIdRef.current !== null) {
        window.clearInterval(watchIdRef.current);
      }
    };
  }, [isActive, deviceId, sendTelemetry]);

  return {
    isActive,
    setIsActive,
    isOnline,
    status,
    lastPoint,
    pointsTransmitted,
    cacheSize,
    flushCache
  };
}
