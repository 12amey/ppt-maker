# Local setup

Start the edited source directly on Windows without Docker:

```powershell
.\start-presenton.ps1
```

Open http://localhost:3000/ppt-maker. The launcher starts the local FastAPI and Next.js services and writes logs to `.cache/creative-hub/`. Stop them with:

```powershell
.\stop-creative-hub.ps1
```

If backend dependencies are missing, install them with `uv sync --group dev` from `servers/fastapi`. The frontend uses the workspace's installed Node dependencies. To choose another frontend port, run `start-creative-hub.ps1 -FrontendPort 3100`.

Ollama and other model services are optional. The editor opens without checking model availability; model errors are shown when you request generation.
