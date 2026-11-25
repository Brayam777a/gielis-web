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
import shutil
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


class _TimedOut(Exception):
    pass


class JobManager:
    def __init__(
        self,
        simulator: Simulator,
        runs_dir: Path | None = None,
        *,
        max_runs: int | None = None,
        job_timeout_s: float | None = None,
    ) -> None:
        self.simulator = simulator
        self.runs_dir = runs_dir
        self.max_runs = max_runs if max_runs is not None and max_runs > 0 else None
        self.job_timeout_s = job_timeout_s if job_timeout_s is not None and job_timeout_s > 0 else None
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

    def queue_depth(self) -> int:
        with self._lock:
            return sum(1 for j in self._jobs.values() if j.status not in FINISHED)

    def cancel(self, job_id: str) -> Job:
        job = self.get(job_id)
        was_running = False
        with self._lock:
            if job.status in FINISHED:
                raise JobAlreadyFinished(job_id)
            job.cancel_requested.set()
            if job.status == "queued":
                # Todavía no empezó: se cancela ya; el hilo lo saltará.
                self._finish(job, "cancelled", "Cancelada antes de empezar")
            else:
                job.message = "Cancelando…"
                was_running = True
        if was_running:
            self._abort_simulator()
        self._save(job)
        if job.status in FINISHED:
            self._prune_old_runs()
        return job

    # ----- el hilo de fondo -----

    def _abort_simulator(self) -> None:
        abort = getattr(self.simulator, "abort_active", None)
        if callable(abort):
            try:
                abort()
            except Exception:
                pass

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
        timed_out = threading.Event()
        timer: threading.Timer | None = None
        if self.job_timeout_s is not None:
            def _on_timeout() -> None:
                timed_out.set()
                job.cancel_requested.set()
                self._abort_simulator()

            timer = threading.Timer(self.job_timeout_s, _on_timeout)
            timer.daemon = True
            timer.start()

        def progress(stage: str, message: str, value: float | None = None) -> None:
            if timed_out.is_set():
                raise _TimedOut
            if job.cancel_requested.is_set():
                raise Cancelled
            with self._lock:
                changed = job.status != stage
                job.status, job.message, job.progress = stage, message, value
            if changed:
                self._save(job)

        try:
            result = self.simulator.run(job.case, progress)
        except _TimedOut:
            with self._lock:
                self._finish(job, "failed", "Falló", error=f"Tiempo límite excedido ({self.job_timeout_s:g} s).")
        except Cancelled:
            with self._lock:
                if timed_out.is_set() and self.job_timeout_s is not None:
                    self._finish(job, "failed", "Falló", error=f"Tiempo límite excedido ({self.job_timeout_s:g} s).")
                else:
                    self._finish(job, "cancelled", "Cancelada")
        except ValueError as exc:  # geometría o datos inválidos: un mensaje claro
            with self._lock:
                self._finish(job, "failed", "Falló", error=str(exc))
        except Exception as exc:  # cualquier otra cosa: se guarda el detalle
            if timed_out.is_set() and self.job_timeout_s is not None:
                with self._lock:
                    self._finish(job, "failed", "Falló", error=f"Tiempo límite excedido ({self.job_timeout_s:g} s).")
            else:
                traceback.print_exc()
                with self._lock:
                    self._finish(job, "failed", "Falló", error=f"{type(exc).__name__}: {exc}")
        else:
            with self._lock:
                if timed_out.is_set() and self.job_timeout_s is not None:
                    self._finish(job, "failed", "Falló", error=f"Tiempo límite excedido ({self.job_timeout_s:g} s).")
                elif job.cancel_requested.is_set():
                    self._finish(job, "cancelled", "Cancelada")
                else:
                    job.result = result
                    self._finish(job, "done", "Terminada", progress=100)
        finally:
            if timer is not None:
                timer.cancel()
        self._save(job)
        self._prune_old_runs()

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
        self._prune_old_runs()

    def _prune_old_runs(self) -> None:
        if self.max_runs is None:
            return
        with self._lock:
            finished = [
                (idx, job)
                for idx, job in enumerate(self._jobs.values())
                if job.status in FINISHED
            ]
            excess = len(finished) - self.max_runs
            if excess <= 0:
                removed_ids: list[str] = []
            else:
                oldest = sorted(finished, key=lambda pair: (pair[1].finished_at or pair[1].created_at, pair[0]))
                removed_ids = [job.id for _, job in oldest[:excess]]
                for job_id in removed_ids:
                    self._jobs.pop(job_id, None)
        if self.runs_dir is None:
            return
        for job_id in removed_ids:
            shutil.rmtree(self.runs_dir / job_id, ignore_errors=True)
        cst_dirs = sorted(
            (p for p in self.runs_dir.iterdir() if p.is_dir() and p.name.startswith("cst_")),
            key=lambda p: p.stat().st_mtime,
        )
        for old_cst in cst_dirs[: max(0, len(cst_dirs) - self.max_runs)]:
            shutil.rmtree(old_cst, ignore_errors=True)
