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
    GIELIS_SIMULATOR     "mock" (por defecto). "cst" cuando exista el adaptador.
    GIELIS_MOCK_DELAY    segundos por paso del simulador de prueba (0.25).
    GIELIS_RUNS_DIR      carpeta del historial (backend/runs).
    GIELIS_CORS_ORIGINS  páginas que pueden llamar al servidor, separadas por comas.

Seguridad: el servidor escucha en localhost. NO se expone a Internet: maneja
la licencia de CST y no tiene usuarios ni contraseñas.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

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


def _default_simulator() -> Simulator:
    kind = os.environ.get("GIELIS_SIMULATOR", "mock")
    if kind == "mock":
        return MockSimulator(step_delay=float(os.environ.get("GIELIS_MOCK_DELAY", "0.25")))
    raise RuntimeError(f"Simulador desconocido: {kind!r}. Por ahora solo existe 'mock'.")


def create_app(simulator: Simulator | None = None, runs_dir: Path | None = None) -> FastAPI:
    """Las pruebas crean su propia app con un simulador rápido y una carpeta temporal."""
    if runs_dir is None:
        runs_dir = Path(os.environ.get("GIELIS_RUNS_DIR", Path(__file__).parents[1] / "runs"))
    jobs = JobManager(simulator or _default_simulator(), runs_dir)

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
        allow_origins=origins.split(",") if origins else DEFAULT_ORIGINS,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        # El servidor no tiene página propia: la raíz lleva a la documentación de las rutas.
        return RedirectResponse("/docs")

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok", "version": __version__, "simulator": jobs.simulator.name}

    @app.post("/api/simulations", status_code=202)
    def start_simulation(case: CaseRequest) -> JobSummary:
        return jobs.submit(case).summary()

    @app.get("/api/simulations")
    def list_simulations() -> list[JobSummary]:
        return [j.summary() for j in jobs.list()]

    @app.get("/api/simulations/{job_id}")
    def get_simulation(job_id: str) -> JobDetail:
        try:
            return jobs.get(job_id).detail()
        except JobNotFound:
            raise HTTPException(404, "No existe esa simulación.") from None

    @app.post("/api/simulations/{job_id}/cancel")
    def cancel_simulation(job_id: str) -> JobSummary:
        try:
            return jobs.cancel(job_id).summary()
        except JobNotFound:
            raise HTTPException(404, "No existe esa simulación.") from None
        except JobAlreadyFinished:
            raise HTTPException(409, "La simulación ya terminó.") from None

    return app


app = create_app()
