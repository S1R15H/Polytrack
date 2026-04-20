from fastapi import WebSocket
import logging
import asyncio

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"Client disconnected. Total: {len(self.active_connections)}")

    async def _send_to_client(self, connection: WebSocket, message: str):
        try:
            await connection.send_text(message)
        except Exception as e:
            logger.error(f"Error broadcasting to client: {e}")
            self.disconnect(connection)

    async def broadcast(self, message: str):
        if self.active_connections:
            await asyncio.gather(*(self._send_to_client(c, message) for c in list(self.active_connections)))

ws_manager = ConnectionManager()
