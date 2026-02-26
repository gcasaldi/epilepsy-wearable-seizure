
import asyncio
import json
import random
import http.server
import socketserver
import threading
import websockets
from datetime import datetime

# --- HTTP Server to serve frontend files ---
class FrontendServer(threading.Thread):
    def __init__(self, directory):
        super().__init__()
        self.directory = directory
        self.httpd = None

    def run(self):
        Handler = http.server.SimpleHTTPRequestHandler
        # Change to the frontend directory to serve files from there
        import os
        os.chdir(self.directory)
        with socketserver.TCPServer(("", 8000), Handler) as self.httpd:
            print("HTTP server listening on port 8000")
            self.httpd.serve_forever()

    def stop(self):
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()

# --- WebSocket Server for telemetry ---
clients = set()

async def register(websocket):
    clients.add(websocket)
    print(f"New client connected. Total clients: {len(clients)}")
    try:
        await websocket.wait_closed()
    finally:
        clients.remove(websocket)
        print(f"Client disconnected. Total clients: {len(clients)}")

async def broadcast_data():
    alert_counter = 0
    while True:
        await asyncio.sleep(2)
        alert_counter += 1

        # Simulate telemetry
        telemetry_payload = {
            "heart_rate": random.randint(60, 100),
            "hrv": random.randint(40, 80),
            "spo2": round(random.uniform(95.0, 99.9), 1),
        }
        telemetry_data = {
            "type": "telemetry",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "payload": telemetry_payload
        }

        # Simulate alert
        alert_data = None
        if alert_counter >= 15: # Every 30 seconds
            alert_counter = 0
            alert_payload = {
                "title": "Potential Seizure Detected",
                "message": "Unusual patterns in telemetry data.",
                "risk_level": "High",
                "risk_score": round(random.uniform(0.75, 0.95), 2)
            }
            alert_data = {
                "type": "alert",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "payload": alert_payload
            }

        # Broadcast to all connected clients
        if clients:
            messages = [json.dumps(telemetry_data)]
            if alert_data:
                messages.append(json.dumps(alert_data))
            
            # Use asyncio.gather to send messages concurrently
            await asyncio.gather(
                *(client.send(msg) for msg in messages for client in clients)
            )


async def main():
    # Start the data broadcasting task
    data_task = asyncio.create_task(broadcast_data())

    # Start the WebSocket server
    async with websockets.serve(register, "0.0.0.0", 8001):
        print("WebSocket server listening on port 8001")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    # Start the HTTP server in a separate thread
    # The directory is relative to the execution path.
    # Assuming this script is run from the project root.
    http_server_thread = FrontendServer(directory="frontend")
    http_server_thread.daemon = True
    http_server_thread.start()

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Shutting down servers...")
        http_server_thread.stop()
        http_server_thread.join()
        print("Servers stopped.")

