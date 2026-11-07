"""
Pruebas de las rutas HTTP con el cliente de prueba de FastAPI.
Necesitan `pip install -e ".[api,test]"`; si FastAPI no está, se saltan.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

from gielis_api.main import create_app  # noqa: E402
from gielis_api.simulator import MockSimulator  # noqa: E402

CASES = json.loads((Path(__file__).parent / "data" / "front_cases.json").read_text(encoding="utf-8"))


@pytest.fixture
def client(tmp_path):
    app = create_app(MockSimulator(step_delay=0, points=201), tmp_path)
    with TestClient(app) as c:  # "with" arranca y detiene el hilo de la cola
        yield c


def wait_done(client, job_id, timeout=10):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        body = client.get(f"/api/simulations/{job_id}").json()
        if body["status"] in ("done", "failed", "cancelled"):
            return body
        time.sleep(0.02)
    raise AssertionError("no terminó")


def test_root_goes_to_docs(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 307
    assert r.headers["location"] == "/docs"


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["simulator"] == "mock"


@pytest.mark.parametrize("name", ["absorber", "transmitter", "sensor"])
def test_full_flow(client, name):
    r = client.post("/api/simulations", json=CASES[name])
    assert r.status_code == 202
    job = r.json()
    assert job["status"] == "queued"

    body = wait_done(client, job["id"])
    assert body["status"] == "done"
    assert body["case"] == CASES[name]
    assert len(body["result"]["frequency_ghz"]) == 201

    history = client.get("/api/simulations").json()
    assert history[0]["id"] == job["id"]
    assert "result" not in history[0]  # el historial no lleva las curvas


def test_invalid_case_is_rejected(client):
    bad = {**CASES["absorber"], "frequency": {"min_ghz": 5, "max_ghz": 2}}
    r = client.post("/api/simulations", json=bad)
    assert r.status_code == 422


def test_unknown_and_finished_jobs(client):
    assert client.get("/api/simulations/no-existe").status_code == 404
    assert client.post("/api/simulations/no-existe/cancel").status_code == 404
    job = client.post("/api/simulations", json=CASES["absorber"]).json()
    wait_done(client, job["id"])
    assert client.post(f"/api/simulations/{job['id']}/cancel").status_code == 409


def test_cors_allows_the_dev_server(client):
    r = client.options(
        "/api/simulations",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
