"""
Cola de simulaciones.

CST usa una licencia y un solo proyecto abierto a la vez, así que las
simulaciones van UNA POR UNA: un hilo de fondo (el "worker") toma el siguiente
trabajo de la cola, lo corre y pasa al siguiente. Las rutas del servidor solo
agregan trabajos, los consultan o piden cancelarlos; nunca esperan a CST.

Cada trabajo se guarda en `runs/<id>/job.json` cuando cambia de etapa y al
terminar, así el historial sobrevive si se reinicia el servidor.

Estados:  queued → building → simulating → done
                 ↘ cancelled          ↘ failed / cancelled
"""
from __future__ import annotations

import json
import queue
import secrets
import threading
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from .schemas import FINISHED, CaseRequest, JobDetail, JobSummary, SimulationResult
from .simulator import Cancelled, Simulator


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


@dataclass
class Job:
    id: str
    case: CaseRequest
    simulator: str
    created_at: str = field(default_factory=_now)
    finished_at: str | None = None
    status: str = "queued"
    message: str = "En cola"
    progress: float | None = None
    error: str | None = None
    result: SimulationResult | None = None
    cancel_requested: threading.Event = field(default_factory=threading.Event, repr=False)

    def summary(self) -> JobSummary:
        return JobSummary(
            id=self.id, created_at=self.created_at, finished_at=self.finished_at,
            mode=self.case.mode, structure_type=self.case.structure_type,
            status=self.status, message=self.message, progress=self.progress,
            error=self.error, simulator=self.simulator,
        )

    def detail(self) -> JobDetail:
        return JobDetail(**self.summary().model_dump(), case=self.case, result=self.result)


class JobNotFound(KeyError):
    pass


class JobAlreadyFinished(RuntimeError):
    pass


class JobManager:
    def __init__(self, simulator: Simulator, runs_dir: Path | None = None) -> None:
        self.simulator = simulator
        self.runs_dir = runs_dir
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._queue: queue.Queue[str | None] = queue.Queue()
        self._worker: threading.Thread | None = None
        if runs_dir is not None:
            runs_dir.mkdir(parents=True, exist_ok=True)
            self._load_history()

    # ----- ciclo de vida del hilo -----

    def start(self) -> None:
        if self._worker is None:
            self._worker = threading.Thread(target=self._work, name="simulaciones", daemon=True)
            self._worker.start()

    def stop(self, timeout: float = 5.0) -> None:
        if self._worker is not None:
            self._queue.put(None)  # señal para que el hilo termine
            self._worker.join(timeout)
            self._worker = None

    # ----- lo que usan las rutas -----

    def submit(self, case: CaseRequest) -> Job:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        job = Job(id=f"{stamp}-{case.mode}-{secrets.token_hex(2)}", case=case, simulator=self.simulator.name)
        with self._lock:
            self._jobs[job.id] = job
        self._save(job)
        self._queue.put(job.id)
        return job

    def get(self, job_id: str) -> Job:
        with self._lock:
            if job_id not in self._jobs:
                raise JobNotFound(job_id)
            return self._jobs[job_id]

    def list(self) -> list[Job]:
        with self._lock:
            return sorted(self._jobs.values(), key=lambda j: j.created_at + j.id, reverse=True)

    def cancel(self, job_id: str) -> Job:
        job = self.get(job_id)
        with self._lock:
            if job.status in FINISHED:
                raise JobAlreadyFinished(job_id)
            job.cancel_requested.set()
            if job.status == "queued":
                # Todavía no empezó: se cancela ya; el hilo lo saltará.
                self._finish(job, "cancelled", "Cancelada antes de empezar")
            else:
                job.message = "Cancelando…"
        self._save(job)
        return job

    # ----- el hilo de fondo -----

    def _work(self) -> None:
        while True:
            job_id = self._queue.get()
            if job_id is None:
                return
            job = self._jobs.get(job_id)
            if job is None or job.status in FINISHED:
                continue
            self._run(job)

    def _run(self, job: Job) -> None:
        def progress(stage: str, message: str, value: float | None = None) -> None:
            if job.cancel_requested.is_set():
                raise Cancelled
            with self._lock:
                changed = job.status != stage
                job.status, job.message, job.progress = stage, message, value
            if changed:
                self._save(job)

        try:
            result = self.simulator.run(job.case, progress)
        except Cancelled:
            with self._lock:
                self._finish(job, "cancelled", "Cancelada")
        except ValueError as exc:  # geometría o datos inválidos: un mensaje claro
            with self._lock:
                self._finish(job, "failed", "Falló", error=str(exc))
        except Exception as exc:  # cualquier otra cosa: se guarda el detalle
            traceback.print_exc()
            with self._lock:
                self._finish(job, "failed", "Falló", error=f"{type(exc).__name__}: {exc}")
        else:
            with self._lock:
                job.result = result
                self._finish(job, "done", "Terminada", progress=100)
        self._save(job)

    @staticmethod
    def _finish(job: Job, status: str, message: str, *, error: str | None = None,
                progress: float | None = None) -> None:
        job.status, job.message, job.error, job.progress = status, message, error, progress
        job.finished_at = _now()

    # ----- historial en disco -----

    def _save(self, job: Job) -> None:
        if self.runs_dir is None:
            return
        folder = self.runs_dir / job.id
        folder.mkdir(exist_ok=True)
        with self._lock:
            data = job.detail().model_dump_json(indent=2)
        tmp = folder / "job.json.tmp"
        tmp.write_text(data, encoding="utf-8")
        tmp.replace(folder / "job.json")  # reemplazo atómico: nunca queda un archivo a medias

    def _load_history(self) -> None:
        assert self.runs_dir is not None
        for path in sorted(self.runs_dir.glob("*/job.json")):
            try:
                d = JobDetail.model_validate_json(path.read_text(encoding="utf-8"))
            except ValueError:
                continue  # un archivo dañado no impide arrancar
            job = Job(
                id=d.id, case=d.case, simulator=d.simulator, created_at=d.created_at,
                finished_at=d.finished_at, status=d.status, message=d.message,
                progress=d.progress, error=d.error, result=d.result,
            )
            if job.status not in FINISHED:
                # El servidor se apagó mientras corría: ya no hay nadie trabajando en ella.
                self._finish(job, "failed", "Falló", error="El servidor se reinició antes de terminar.")
                self._jobs[job.id] = job
                self._save(job)
            else:
                self._jobs[job.id] = job
