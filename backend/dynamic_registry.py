# dynamic_registry.py
import threading

# Model ID -> {"port": int, "pid": int}
_REGISTRY = {}
_LOCK = threading.RLock()

def register(model_id: str, port: int, pid: int):
    with _LOCK:
        _REGISTRY[model_id] = {"port": port, "pid": pid}

def get(model_id: str):
    with _LOCK:
        return _REGISTRY.get(model_id)

def all_models():
    with _LOCK:
        return dict(_REGISTRY)

def remove(model_id: str):
    with _LOCK:
        _REGISTRY.pop(model_id, None)
