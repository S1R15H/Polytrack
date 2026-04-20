import argparse
import time
import json
import random
import requests
from datetime import datetime, timezone

# Emulate the 5-element Ring Buffer constraint of the Arduino SRAM
MAX_BUFFERED_PAYLOADS = 5
payload_buffer = []

def create_payload(device_id: str, lat: float, lng: float) -> dict:
    return {
        "device_id": device_id,
        "latitude": lat,
        "longitude": lng,
        "altitude": 15.2,
        "speed": 45.0,
        "heading": 180.0,
        "recorded_at": datetime.now(timezone.utc).isoformat()
    }

def enqueue_payload(payload: dict):
    global payload_buffer
    if len(payload_buffer) < MAX_BUFFERED_PAYLOADS:
        payload_buffer.append(payload)
    else:
        print("[BUFFER FULL] Dropping oldest payload.")
        payload_buffer.pop(0)
        payload_buffer.append(payload)
    print(f"[BUFFER] Current buffer size: {len(payload_buffer)} / {MAX_BUFFERED_PAYLOADS}")

def process_buffered_payloads(backend_url: str) -> bool:
    global payload_buffer
    if not payload_buffer:
        return True
        
    print(f"[RETRY] Attempting to flush {len(payload_buffer)} buffered payloads...")
    # The Arduino sends payloads one by one when connection returns
    for i in range(len(payload_buffer)):
        payload = payload_buffer[0] # peek at head
        try:
            req = requests.post(
                f"{backend_url}/api/v1/telemetry", 
                json=payload,
                headers={"ngrok-skip-browser-warning": "true"},
                timeout=5
            )
            if req.status_code == 200 or req.status_code == 201:
                # Success, remove from buffer
                payload_buffer.pop(0)
            else:
                print(f"[RETRY FAILED] HTTP {req.status_code}")
                return False
        except requests.exceptions.RequestException:
            print("[RETRY FAILED] Network error.")
            return False
            
    print("[RETRY SUCCESS] Buffer flushed.")
    return True

def main():
    parser = argparse.ArgumentParser(description="PolyTrack Hardware node simulator (Python)")
    parser.add_argument("--device-id", type=str, default="123e4567-e89b-12d3-a456-426614174000")
    parser.add_argument("--interval", type=int, default=10, help="Seconds between GNSS polls")
    parser.add_argument("--fail-rate", type=float, default=0.2, help="Probability (0.0 - 1.0) of a cell network dropout")
    parser.add_argument("--backend-url", type=str, default="http://localhost:8000")
    
    args = parser.parse_args()
    
    print(f"--- Starting PolyTrack Hardware Simulator ---")
    print(f"Device ID:  {args.device_id}")
    print(f"Interval:   {args.interval} seconds")
    print(f"Fail Rate:  {args.fail_rate * 100}% (Dead Zone simulation)")
    print(f"Target URL: {args.backend_url}")
    print(f"---------------------------------------------")

    # Start near Orlando, FL and move slightly south-east
    current_lat = 28.147725
    current_lng = -81.848810

    while True:
        print("\n--- New Cycle ---")
        
        # 1. Generate real-time GNSS payload
        current_lat += random.uniform(-0.0005, 0.0005)
        current_lng += random.uniform(-0.0005, 0.0005)
        payload = create_payload(args.device_id, current_lat, current_lng)
        
        print(f"Fix acquired! Lat: {current_lat:.6f} Lng: {current_lng:.6f}")
        print(f"Payload: {json.dumps(payload)}")

        # 2. Simulate Network Conditions (Dead reckoning/Store-and-forward test)
        if random.random() < args.fail_rate:
            # We hit a dead zone!
            print("[SIMULATED DEAD ZONE] HTTP Post Failed (AT+SHREQ timeout).")
            enqueue_payload(payload)
        else:
            # Good connection! Try to clear buffer first
            if process_buffered_payloads(args.backend_url):
                # Only post live if buffer flushed successfully or was empty
                try:
                    print("Sending via HTTP...")
                    req = requests.post(
                        f"{args.backend_url}/api/v1/telemetry", 
                        json=payload, 
                        headers={"ngrok-skip-browser-warning": "true"},
                        timeout=5
                    )
                    if req.status_code == 200 or req.status_code == 201:
                        print("Telemetry sent successfully!")
                    else:
                        print(f"Server rejected payload. HTTP {req.status_code}")
                        enqueue_payload(payload)
                except requests.exceptions.RequestException as e:
                    print(f"HTTP Connection Failed: {e}")
                    enqueue_payload(payload)
            else:
                # Buffer flush failed (server must be down, or connection dropped during flush)
                enqueue_payload(payload)

        time.sleep(args.interval)

if __name__ == "__main__":
    main()
