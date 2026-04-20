from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str
    mapbox_access_token: str = ""
    mqtt_broker_host: str = "mqtt"
    mqtt_broker_port: int = 1883
    ws_heartbeat_interval_seconds: int = 30
    cors_origins: str | list[str] = ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"]
    telemetry_retention_interval_hours: int = 24
    ollama_url: str = "http://localhost:11434/api/chat"

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()
