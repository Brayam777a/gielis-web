"""
Pruebas del servidor sin FastAPI: el caso, la geometría, el simulador de
prueba, las resonancias y la cola. Corren con `python -m pytest`.

`data/front_cases.json` son los JSON de los 3 casos del artículo tal como los
arma el front, así que también prueban que el front y el servidor hablan el
mismo idioma.
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("pydantic")  # viene con FastAPI: pip install -e ".[api,test]"
from pydantic import ValidationError  # noqa: E402

from gielis_api.geometry import area, build_case_geometry, perimeter
from gielis_api.jobs import JobAlreadyFinished, JobManager
from gielis_api.results import absorption, find_resonances, local_extrema
from gielis_api.schemas import CaseRequest, SimulationResult
from gielis_api.simulator import Cancelled, MockSimulator

ROOT = Path(__file__).parents[1]
FRONT_CASES = json.loads((Path(__file__).parent / "data" / "front_cases.json").read_text(encoding="utf-8"))
GOLDEN = json.loads((ROOT / "golden" / "golden_cases.json").read_text(encoding="utf-8"))["cases"]


def case(name: str, **changes) -> CaseRequest:
    data = json.loads(json.dumps(FRONT_CASES[name]))
    for path, value in changes.items():
        *parents, last = path.split("__")
        target = data
        for p in parents:
            target = target[p]
        target[last] = value
    return CaseRequest.model_validate(data)


def no_progress(stage, message, value=None):
    pass


# ---------- el JSON del caso ----------

@pytest.mark.parametrize("name", ["absorber", "transmitter", "sensor"])
def test_front_cases_are_valid(name):
    assert case(name).mode == name


def test_case_rejects_bad_values():
    with pytest.raises(ValidationError):
        case("absorber", frequency__max_ghz=0.5)  # máximo menor que el mínimo
    with pytest.raises(ValidationError):
        case("absorber", gielis__n1=0)
    with pytest.raises(ValidationError):
        case("sensor", structure_type="normal")
    with pytest.raises(ValidationError):
        CaseRequest.model_validate({**FRONT_CASES["absorber"], "campo_inventado": 1})


# ---------- geometría: la misma que las pruebas golden ----------

@pytest.mark.parametrize("name", ["absorber", "transmitter", "sensor"])
def test_geometry_matches_golden(name):
    g = build_case_geometry(case(name))
    golden = GOLDEN[name]["concentric"]
    for key, contour in zip(("c1", "c2", "c3", "c4"), g.rings):
        assert area(contour) == pytest.approx(golden[key]["area_mm2"], rel=1e-9)
    assert area(g.envelope) == pytest.approx(GOLDEN[name]["base_envelope"]["area_mm2"], rel=1e-9)


def test_sensor_geometry_is_centered_then_moved():
    g = build_case_geometry(case("sensor"))
    xy = np.vstack(g.rings)
    assert (xy[:, 0].min() + xy[:, 0].max()) / 2 == pytest.approx(0, abs=1e-9)
    assert (xy[:, 1].min() + xy[:, 1].max()) / 2 == pytest.approx(0, abs=1e-9)

    moved = build_case_geometry(case("sensor", concentric__dx_mm=1.5))
    assert moved.c1[:, 0].min() == pytest.approx(g.c1[:, 0].min() + 1.5)


def test_perimeter_of_a_square():
    square = np.array([[0, 0], [2, 0], [2, 2], [0, 2]], dtype=float)
    assert perimeter(square) == pytest.approx(8)
    assert area(square) == pytest.approx(4)


# ---------- resonancias y absorción ----------

def test_absorption_formula():
    # |S11| = 0.1 (−20 dB) sin transmisión → A = 1 − 0.01 = 0.99
    assert absorption(np.array([-20.0]), None)[0] == pytest.approx(0.99)
    # Con S21 también a −20 dB → A = 1 − 0.01 − 0.01
    assert absorption(np.array([-20.0]), np.array([-20.0]))[0] == pytest.approx(0.98)


def test_local_extrema():
    v = np.array([0, -1, -5, -1, 0, -2, -8, -2, 0])
    assert list(local_extrema(v, "min")) == [2, 6]
    assert list(local_extrema(-v, "max")) == [2, 6]


def test_resonances_use_the_threshold_of_each_mode():
    f = np.linspace(1, 3, 5)
    s11 = np.array([0, -4, 0, -20, 0], dtype=float)  # el primer mínimo no llega a −6 dB
    found = find_resonances("absorber", "normal", f, s11, None, absorption(s11, None))
    assert [r.frequency_ghz for r in found] == [2.5]
    assert found[0].absorption_pct == pytest.approx(99.0)


# ---------- simulador de prueba ----------

@pytest.mark.parametrize("name", ["absorber", "transmitter", "sensor"])
def test_mock_simulator_gives_complete_curves(name):
    c = case(name)
    result = MockSimulator(step_delay=0, points=401).run(c, no_progress)
    assert isinstance(result, SimulationResult)
    assert result.simulator == "mock"
    assert len(result.frequency_ghz) == 401
    assert result.frequency_ghz[0] == c.frequency.min_ghz
    assert result.frequency_ghz[-1] == c.frequency.max_ghz
    assert (result.s21_db is None) == (name == "absorber")
    assert (result.absorption is None) == (name == "sensor")
    assert result.resonances, "debe haber al menos una resonancia dentro del barrido"
    assert any("PRUEBA" in n for n in result.notes)


@pytest.mark.parametrize("name, article_ghz", [("absorber", 2.435), ("sensor", 4.171)])
def test_mock_resonates_near_the_article(name, article_ghz):
    # No es CST, pero la estimación debe caer cerca del artículo (±15 %).
    result = MockSimulator(step_delay=0).run(case(name), no_progress)
    assert result.resonances[0].frequency_ghz == pytest.approx(article_ghz, rel=0.15)


def test_mock_simulator_stops_when_cancelled():
    calls = []

    def progress(stage, message, value=None):
        calls.append(stage)
        if stage == "simulating":
            raise Cancelled

    with pytest.raises(Cancelled):
        MockSimulator(step_delay=0).run(case("absorber"), progress)
    assert calls == ["building", "simulating"]


# ---------- cola ----------

def wait_until_finished(jobs: JobManager, job_id: str, timeout: float = 10) -> str:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        status = jobs.get(job_id).status
        if status in ("done", "failed", "cancelled"):
            return status
        time.sleep(0.01)
    raise AssertionError(f"{job_id} no terminó a tiempo")


def test_queue_runs_a_case_and_saves_it(tmp_path):
    jobs = JobManager(MockSimulator(step_delay=0, points=101), tmp_path)
    jobs.start()
    try:
        job = jobs.submit(case("absorber"))
        assert wait_until_finished(jobs, job.id) == "done"
        assert jobs.get(job.id).result is not None
        assert (tmp_path / job.id / "job.json").exists()
    finally:
        jobs.stop()

    # Al arrancar de nuevo, el historial se lee de la carpeta.
    again = JobManager(MockSimulator(step_delay=0), tmp_path)
    assert again.get(job.id).status == "done"
    assert again.get(job.id).result.frequency_ghz[0] == 1


def test_invalid_geometry_fails_with_a_message(tmp_path):
    jobs = JobManager(MockSimulator(step_delay=0), tmp_path)
    jobs.start()
    try:
        job = jobs.submit(case("absorber", concentric__gap_mm=50))  # gap enorme
        assert wait_until_finished(jobs, job.id) == "failed"
        assert jobs.get(job.id).error
    finally:
        jobs.stop()


class BlockingSimulator:
    """Se queda en 'simulating' hasta que la prueba lo suelte."""

    name = "mock"

    def __init__(self):
        self.started = threading.Event()
        self.release = threading.Event()

    def run(self, c, progress):
        progress("simulating", "Simulando", 0)
        self.started.set()
        while not self.release.wait(0.01):
            progress("simulating", "Simulando", 50)
        return MockSimulator(step_delay=0, points=11).run(c, no_progress)


def test_cancel_running_and_queued_jobs(tmp_path):
    sim = BlockingSimulator()
    jobs = JobManager(sim, tmp_path)
    jobs.start()
    try:
        first = jobs.submit(case("absorber"))
        second = jobs.submit(case("transmitter"))
        assert sim.started.wait(5)
        # La segunda espera en la cola: una simulación a la vez.
        assert jobs.get(second.id).status == "queued"

        assert jobs.cancel(second.id).status == "cancelled"
        jobs.cancel(first.id)
        assert wait_until_finished(jobs, first.id) == "cancelled"
        with pytest.raises(JobAlreadyFinished):
            jobs.cancel(first.id)
    finally:
        sim.release.set()
        jobs.stop()


def test_unfinished_job_is_marked_failed_after_restart(tmp_path):
    jobs = JobManager(MockSimulator(step_delay=0), tmp_path)  # sin start(): queda en cola
    job = jobs.submit(case("absorber"))
    again = JobManager(MockSimulator(step_delay=0), tmp_path)
    assert again.get(job.id).status == "failed"
    assert "reinició" in again.get(job.id).error
