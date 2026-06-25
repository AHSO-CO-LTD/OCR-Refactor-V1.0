import multiprocessing
import sys

import uvicorn

from tool.app.core.config import get_config


def _ensure_python_39():
    if sys.version_info[:2] != (3, 9):
        version = ".".join(str(part) for part in sys.version_info[:3])
        raise RuntimeError(
            "This project must run on Python 3.9 because native runtime files "
            f"are built for cp39-win_amd64. Current Python: {version} at {sys.executable}"
        )


def _prepare_windowed_stdio():
    if sys.stdout is not None and sys.stderr is not None:
        return None

    log_dir = get_config().logs_dir
    log_dir.mkdir(parents=True, exist_ok=True)
    stream = (log_dir / "console.log").open("a", encoding="utf-8")
    if sys.stdout is None:
        sys.stdout = stream
    if sys.stderr is None:
        sys.stderr = stream
    return stream


def _ensure_single_instance() -> bool:
    try:
        import win32api
        import win32event
        import winerror
    except Exception:
        return True

    api_port = get_config().api_port
    mutex = win32event.CreateMutex(
        None,
        False,
        f"Global\\AHSO_DRB_OCR_AI_Device_Tool_{api_port}",
    )
    return win32api.GetLastError() != winerror.ERROR_ALREADY_EXISTS


def main():
    multiprocessing.freeze_support()
    _ensure_python_39()
    _prepare_windowed_stdio()
    if not _ensure_single_instance():
        return

    config = get_config()
    uvicorn.run(
        "tool.app.main:app",
        host=config.api_host,
        port=config.api_port,
        reload=False,
        log_level="info",
        ws_ping_interval=None,
        ws_ping_timeout=None,
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
