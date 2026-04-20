import json
import httpx
from pydantic import BaseModel

from app.config import settings

class AIChatService:
    def __init__(self):
        self.ollama_url = settings.ollama_url
        # Load the campus context exactly as requested
        try:
            with open("app/data/campus_info.json", "r") as f:
                self.campus_info = json.load(f)
        except Exception as e:
            print("Failed to load campus_info.json", e)
            self.campus_info = {}

        self.system_prompt = f"""You are a helpful campus assistant for the school project. You are provided with the following information about the school premises:
{json.dumps(self.campus_info, indent=2)}

You may ONLY answer questions related to the school premises based on this provided information. If the user asks about anything else, or if the answer is not in the provided information, you must reply exactly: 'I am a campus assistant and can only answer questions related to the school premises.' Do not hallucinate or guess. Keep your answers brief and concise.
"""

    async def ask_stream(self, user_message: str):
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        payload = {
            "model": "phi3",
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": 0.1 
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", self.ollama_url, json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line:
                            try:
                                data = json.loads(line)
                                if "message" in data and "content" in data["message"]:
                                    yield data["message"]["content"]
                            except json.JSONDecodeError:
                                continue
        except httpx.ConnectError:
            import os
            actual_env = os.environ.get("OLLAMA_URL", "NOT_SET")
            yield f"Local AI model is currently unreachable at {self.ollama_url} (OS env: {actual_env}). Make sure Ollama is running."
        except Exception as e:
            yield f"\nAn error occurred: {type(e).__name__} - {repr(e)}"

# Singleton instance
ai_service = AIChatService()
