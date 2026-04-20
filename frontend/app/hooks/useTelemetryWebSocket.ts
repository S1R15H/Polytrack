import { useState, useEffect, useCallback, useRef } from "react";

export interface LiveTelemetryData {
  device_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
}

export function useTelemetryWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [latestData, setLatestData] = useState<LiveTelemetryData | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(1000);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const maxDelay = 30000;
  const heartbeatIntervalRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Track mount status explicitly
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        if (!isMountedRef.current) {
           ws.close();
           return;
        }
        setIsConnected(true);
        reconnectDelayRef.current = 1000; // Reset
        
        // Start Heartbeat
        heartbeatIntervalRef.current = window.setInterval(() => {
           if (ws.readyState === WebSocket.OPEN) {
             ws.send(JSON.stringify({ type: "ping" }));
           }
        }, 30000);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "pong") return;

          // Handle arrays (batch flushes) or single points
          if (Array.isArray(data)) {
            if (data.length > 0) {
               const pt = data[data.length - 1];
               if (pt && typeof pt.latitude === 'number' && typeof pt.longitude === 'number') {
                 setLatestData(pt as LiveTelemetryData);
               }
            }
          } else {
             if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
                setLatestData(data as LiveTelemetryData);
             } else {
                console.warn("WebSocket received invalid payload missing coordinates:", data);
             }
          }
          
        } catch (e) {
           console.error("Failed to parse WS message", e);
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        
        // Exponential backoff reconnect
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current) {
             connect();
             reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, maxDelay);
          }
        }, reconnectDelayRef.current);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error", err);
        ws.close();
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("Failed to establish WebSocket", err);
      if (isMountedRef.current) {
         reconnectTimeoutRef.current = window.setTimeout(connect, reconnectDelayRef.current);
      }
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Detach handler to prevent rogue reconnect loop on unmount
        wsRef.current.onmessage = null;
        wsRef.current.onopen = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, latestData };
}
