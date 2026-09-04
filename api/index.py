import sys
from pathlib import Path

# Add backend directory to sys.path so app modules are found
current_dir = Path(__file__).resolve().parent
backend_dir = current_dir.parent / "backend"
if backend_dir.exists() and str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

var_task_backend = Path("/var/task/backend")
if var_task_backend.exists() and str(var_task_backend) not in sys.path:
    sys.path.insert(0, str(var_task_backend))

from app.main import app
