"""
Servidor web (FastAPI) de Gielis Web.

Para arrancarlo, desde la carpeta backend con el .venv activado:

    uvicorn gielis_api.main:app --reload

y abrir http://localhost:8000/docs para ver y probar todas las rutas.

Rutas:
    GET  /api/health                     ¿está vivo? ¿qué simulador usa?
    POST /api/simulations                pone un caso en la cola → 202 + el trabajo
    GET  /api/simulations                historial (sin curvas)
    GET  /api/simulations/{id}           estado de un trabajo y, si terminó, sus curvas
    POST /api/simulations/{id}/cancel    cancela un trabajo en cola o en curso

Variables de entorno (todas opcionales):
    GIELIS_SIMULATOR            "mock" (por defecto). "cst" para CST Studio Suite.
    GIELIS_MOCK_DELAY           segundos por paso del simulador de prueba (0.25).
    GIELIS_RUNS_DIR             carpeta del historial (backend/runs).
    GIELIS_CORS_ORIGINS         páginas que pueden llamar al servidor, separadas por comas.
    GIELIS_API_TOKEN            token compartido opcional (X-API-Key o Bearer).
    GIELIS_MAX_RUNS             máximo de ejecuciones guardadas en disco (50; 0 desactiva).
    GIELIS_SIM_TIMEOUT_SECONDS  tiempo máximo por simulación en segundos (1800; 0 desactiva).
"""
from __future__ import annotations

import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .jobs import JobAlreadyFinished, JobManager, JobNotFound
from .schemas import CaseRequest, JobDetail, JobSummary
from .simulator import MockSimulator, Simulator

DEFAULT_ORIGINS = [
    "http://localhost:5173",  # npm run dev
    "http://127.0.0.1:5173",
    "http://localhost:4173",  # npm run preview
    "https://brayam777a.github.io",  # la página publicada
]

LOCAL_AND_TAILSCALE_ORIGIN_REGEX = (
    r"^https?://("
    r"localhost|127\.0\.0\.1|\[::1\]|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|"
    r"100\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r")(:\d+)?$"
)


def _default_simulator(runs_dir: Path | None = None) -> Simulator:
    kind = os.environ.get("GIELIS_SIMULATOR", "mock")
    if kind == "mock":
        return MockSimulator(step_delay=float(os.environ.get("GIELIS_MOCK_DELAY", "0.25")))
    if kind == "cst":
        from .cst.simulator import CSTSimulator

        return CSTSimulator(runs_dir=runs_dir)
    raise RuntimeError(f"Simulador desconocido: {kind!r}. Opciones: 'mock', 'cst'.")


def _positive_int_env(name: str, default: int) -> int | None:
    raw = os.environ.get(name)
    val = int(raw) if raw is not None and raw.strip() else default
    return val if val > 0 else None


def _positive_float_env(name: str, default: float) -> float | None:
    raw = os.environ.get(name)
    val = float(raw) if raw is not None and raw.strip() else default
    return val if val > 0 else None


def create_app(
    simulator: Simulator | None = None,
    runs_dir: Path | None = None,
    *,
    api_token: str | None = None,
    max_runs: int | None = None,
    job_timeout_s: float | None = None,
) -> FastAPI:
    """Las pruebas crean su propia app con un simulador rápido y una carpeta temporal."""
    if runs_dir is None:
        runs_dir = Path(os.environ.get("GIELIS_RUNS_DIR", Path(__file__).parents[1] / "runs"))
    effective_token = (
        (os.environ.get("GIELIS_API_TOKEN") or "").strip() or None
        if api_token is None
        else (api_token.strip() or None)
    )
    effective_max_runs = _positive_int_env("GIELIS_MAX_RUNS", 50) if max_runs is None else (max_runs if max_runs > 0 else None)
    effective_timeout = _positive_float_env("GIELIS_SIM_TIMEOUT_SECONDS", 1800.0) if job_timeout_s is None else (job_timeout_s if job_timeout_s > 0 else None)

    jobs = JobManager(
        simulator or _default_simulator(runs_dir),
        runs_dir,
        max_runs=effective_max_runs,
        job_timeout_s=effective_timeout,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        jobs.start()
        yield
        jobs.stop()

    app = FastAPI(title="Gielis Web", version=__version__, lifespan=lifespan)
    app.state.jobs = jobs

    origins = os.environ.get("GIELIS_CORS_ORIGINS")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in origins.split(",") if o.strip()] if origins else DEFAULT_ORIGINS,
        allow_origin_regex=None if origins else LOCAL_AND_TAILSCALE_ORIGIN_REGEX,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key", "Authorization"],
    )

    def require_token(
        x_api_key: str | None = Header(default=None, alias="X-API-Key"),
        authorization: str | None = Header(default=None, alias="Authorization"),
    ) -> None:
        if effective_token is None:
            return
        candidate = x_api_key
        if candidate is None and authorization and authorization.lower().startswith("bearer "):
            candidate = authorization[7:].strip()
        if candidate is None or not secrets.compare_digest(candidate, effective_token):
            raise HTTPException(
                status_code=401,
                detail="Token de API requerido o inválido.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        # El servidor no tiene página propia: la raíz lleva a la documentación de las rutas.
        return RedirectResponse("/docs")

    @app.get("/api/health")
    def health() -> dict:
        return {
            "status": "ok",
            "version": __version__,
            "simulator": jobs.simulator.name,
            "auth_required": effective_token is not None,
            "queue_depth": jobs.queue_depth(),
        }

    @app.post("/api/simulations", status_code=202, dependencies=[Depends(require_token)])
    def start_simulation(case: CaseRequest) -> JobSummary:
        return jobs.submit(case).summary()

    @app.get("/api/simulations", dependencies=[Depends(require_token)])
    def list_simulations() -> list[JobSummary]:
        return [j.summary() for j in jobs.list()]

    @app.get("/api/simulations/{job_id}", dependencies=[Depends(require_token)])
    def get_simulation(job_id: str) -> JobDetail:
        try:
            return jobs.get(job_id).detail()
        except JobNotFound:
            raise HTTPException(404, "No existe esa simulación.") from None

    @app.post("/api/simulations/{job_id}/cancel", dependencies=[Depends(require_token)])
    def cancel_simulation(job_id: str) -> JobSummary:
        try:
            return jobs.cancel(job_id).summary()
        except JobNotFound:
            raise HTTPException(404, "No existe esa simulación.") from None
        except JobAlreadyFinished:
            raise HTTPException(409, "La simulación ya terminó.") from None

    dist_dir = Path(__file__).parents[2] / "frontend" / "dist"
    if (dist_dir / "index.html").is_file():
        app.mount("/app", StaticFiles(directory=dist_dir, html=True), name="frontend")

    return app


app = create_app()
