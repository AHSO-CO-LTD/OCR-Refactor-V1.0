import json
import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel


class AppConfig(BaseModel):
    app_name: str = "VisionCenter Device Tool"
    version: str = "0.1.0"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    base_dir: Path = Path(__file__).resolve().parents[3]

    @property
    def runtime_dir(self) -> Path:
        return self.base_dir / "runtime"

    @property
    def output_dir(self) -> Path:
        return self.runtime_dir / "outputs"

    @property
    def logs_dir(self) -> Path:
        return self.runtime_dir / "logs"


@lru_cache
def get_config() -> AppConfig:
    base_dir = Path(__file__).resolve().parents[3]
    config_path = base_dir / "config.json"
    data = {}
    if config_path.exists():
        with config_path.open("r", encoding="utf-8") as f:
            data = json.load(f)

    env_port = os.getenv("DEVICE_TOOL_PORT") or os.getenv("API_PORT")
    api_port = data.get("api_port", AppConfig().api_port)
    if env_port:
        api_port = int(env_port)

    config = AppConfig(
        base_dir=base_dir,
        api_host=data.get("api_host", AppConfig().api_host),
        api_port=api_port,
    )
    config.runtime_dir.mkdir(parents=True, exist_ok=True)
    config.output_dir.mkdir(parents=True, exist_ok=True)
    config.logs_dir.mkdir(parents=True, exist_ok=True)
    return config
