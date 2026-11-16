"""Pruebas unitarias para `CSTSimulator`, `results_reader` y selección `GIELIS_SIMULATOR=cst`."""
from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np
import pytest

from gielis_api.cst.results_reader import list_sparameter_paths, read_1d_complex_curve
from gielis_api.cst.simulator import CSTSimulator
from gielis_api.main import create_app
from gielis_api.schemas import CaseRequest

CASES = json.loads((Path(__file__).parent / "data" / "front_cases.json").read_text(encoding="utf-8"))


class _FakeCurve:
    def __init__(self, x: np.ndarray, y: np.ndarray) -> None:
        self._x = x
        self._y = y

    def get_xdata(self) -> np.ndarray:
        return self._x

    def get_ydata(self) -> np.ndarray:
        return self._y


class _FakeModel3D:
    def __init__(self) -> None:
        self.history: list[tuple[str, str]] = []
        self.solver_ran = 0

    def add_to_history(self, title: str, vba: str) -> None:
        self.history.append((title, vba))

    def run_solver(self) -> None:
        self.solver_ran += 1


class _FakeProject:
    def __init__(self) -> None:
        self.model3d = _FakeModel3D()
        self.saved_paths: list[str] = []

    def save(self, path: str) -> None:
        self.saved_paths.append(path)
        Path(path).write_text("fake cst project", encoding="utf-8")


class _FakeDesignEnv:
    def __init__(self, project: _FakeProject) -> None:
        self.project = project

    def new_mws(self) -> _FakeProject:
        return self.project


class _FakeResults3D:
    def __init__(
        self,
        tree_items: list[str],
        direct_curves: dict[str, tuple[np.ndarray, np.ndarray]],
        run_id_curves: dict[tuple[str, int], tuple[np.ndarray, np.ndarray]] | None = None,
        run_ids_by_path: dict[str, list[int]] | None = None,
    ) -> None:
        self._tree_items = tree_items
        self._direct_curves = direct_curves
        self._run_id_curves = run_id_curves or {}
        self._run_ids_by_path = run_ids_by_path or {}

    def get_tree_items(self) -> list[str]:
        return list(self._tree_items)

    def get_run_ids(self, path: str) -> list[int]:
        return list(self._run_ids_by_path.get(path, []))

    def get_result_item(self, path: str, run_id: int | None = None) -> _FakeCurve:
        if run_id is None:
            if path in self._direct_curves:
                return _FakeCurve(*self._direct_curves[path])
            raise KeyError(path)
        key = (path, run_id)
        if key in self._run_id_curves:
            return _FakeCurve(*self._run_id_curves[key])
        raise KeyError(key)


class _FakeResultsFile:
    def __init__(self, results_3d: _FakeResults3D) -> None:
        self._results_3d = results_3d

    def get_3d(self) -> _FakeResults3D:
        return self._results_3d


def _synthetic_absorber_curves(include_cross: bool) -> tuple[list[str], dict[str, tuple[np.ndarray, np.ndarray]]]:
    freq = np.linspace(1.0, 8.0, 701)
    # Dos dips marcados en 2.435 GHz y 3.849 GHz (~ -16.9 dB y -10.3 dB)
    dip1 = 0.857 / (1 + ((freq - 2.435) / 0.08) ** 2)
    dip2 = 0.693 / (1 + ((freq - 3.849) / 0.10) ** 2)
    s11_mag = np.clip(1.0 - dip1 - dip2, 0.05, 1.0)
    s11 = s11_mag * np.exp(-1j * 0.4 * freq)

    tree = [
        "1D Results\\Adaptive Meshing\\f=8\\S-Parameters\\Delta\\All S-Parameters",
        "1D Results\\Convergence\\S-Parameters\\All S-Parameters",
        "1D Results\\S-Parameters\\SZmax(1),Zmax(1)",
        "1D Results\\S-Parameters\\SZmin(1),Zmax(1)",
    ]
    curves: dict[str, tuple[np.ndarray, np.ndarray]] = {
        "1D Results\\S-Parameters\\SZmax(1),Zmax(1)": (freq, s11),
    }
    if include_cross:
        tree.append("1D Results\\S-Parameters\\SZmax(2),Zmax(1)")
        s_cross = np.full_like(freq, 0.1, dtype=complex)
        curves["1D Results\\S-Parameters\\SZmax(2),Zmax(1)"] = (freq, s_cross)
    return tree, curves


def test_list_sparameter_paths_excludes_adaptive_and_convergence() -> None:
    tree = [
        "1D Results\\Adaptive Meshing\\f=8\\Meshcells",
        "1D Results\\Adaptive Meshing\\f=8\\S-Parameters\\Delta\\All S-Parameters",
        "1D Results\\Convergence\\S-Parameters\\All S-Parameters",
        "1D Results\\S-Parameters\\SZmax(1),Zmax(1)",
        "1D Results\\S-Parameters\\SZmax(2),Zmax(1)",
    ]
    assert list_sparameter_paths(tree) == [
        "1D Results\\S-Parameters\\SZmax(1),Zmax(1)",
        "1D Results\\S-Parameters\\SZmax(2),Zmax(1)",
    ]


def test_read_1d_complex_curve_falls_back_to_run_ids() -> None:
    path = "1D Results\\S-Parameters\\SZmax(1),Zmax(1)"
    freq = np.array([1.0, 2.0, 3.0])
    vals = np.array([0.5 + 0j, 0.2 - 0.1j, 0.8 + 0j])
    results_3d = _FakeResults3D(
        tree_items=[path],
        direct_curves={},
        run_id_curves={(path, 2): (freq, vals)},
        run_ids_by_path={path: [1, 2]},
    )

    curve = read_1d_complex_curve(results_3d, path)
    assert curve is not None
    assert np.allclose(curve[0], freq)
    assert np.allclose(curve[1], vals)


@pytest.mark.parametrize("include_cross", [False, True])
def test_cst_simulator_run_absorber_end_to_end_with_fakes(tmp_path: Path, include_cross: bool) -> None:
    payload = copy.deepcopy(CASES["absorber"])
    payload["field_monitors"] = {"fields": "E", "freq_ghz": 2.435}
    case = CaseRequest.model_validate(payload)

    project = _FakeProject()
    tree, curves = _synthetic_absorber_curves(include_cross=include_cross)
    results_3d = _FakeResults3D(tree_items=tree, direct_curves=curves)
    events: list[tuple[str, str, float | None]] = []

    sim = CSTSimulator(
        runs_dir=tmp_path,
        design_env_factory=lambda: _FakeDesignEnv(project),
        results_file_factory=lambda _: _FakeResultsFile(results_3d),
    )

    result = sim.run(case, lambda stage, msg, p=None: events.append((stage, msg, p)))

    assert project.model3d.solver_ran == 1
    assert len(project.saved_paths) == 2
    assert project.saved_paths[0] == project.saved_paths[1]

    run_dirs = [p for p in tmp_path.iterdir() if p.is_dir()]
    assert len(run_dirs) == 1
    run_dir = run_dirs[0]
    assert (run_dir / "input.json").is_file()
    assert (run_dir / "cst_result_tree.txt").is_file()
    assert (run_dir / "metadata.json").is_file()
    assert (run_dir / "Gielis_Absorber.cst").is_file()

    metadata = json.loads((run_dir / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["co_polar_channel"] == "SZmax(1),Zmax(1)"
    assert metadata["cross_polar_channel"] == ("SZmax(2),Zmax(1)" if include_cross else None)

    assert result.simulator == "cst"
    assert result.s21_db is None
    assert result.s11_db is not None
    assert result.absorption is not None
    assert len(result.frequency_ghz) == 701

    idx_2435 = int(np.argmin(np.abs(np.asarray(result.frequency_ghz) - 2.435)))
    expected_r = float(np.abs(curves["1D Results\\S-Parameters\\SZmax(1),Zmax(1)"][1][idx_2435]) ** 2)
    if include_cross:
        expected_r += 0.1**2
    assert result.absorption[idx_2435] == pytest.approx(round(1.0 - expected_r, 4), abs=1e-4)

    res_freqs = [r.frequency_ghz for r in result.resonances]
    assert any(abs(f - 2.435) < 0.02 for f in res_freqs)
    assert any(abs(f - 3.849) < 0.02 for f in res_freqs)
    assert any(stage == "building" for stage, _, _ in events)
    assert any(stage == "simulating" for stage, _, _ in events)


def test_create_app_with_cst_env_var_reports_cst_health(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    fastapi = pytest.importorskip("fastapi")
    _ = fastapi
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    monkeypatch.setenv("GIELIS_SIMULATOR", "cst")
    app = create_app(runs_dir=tmp_path)
    with TestClient(app) as client:
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["simulator"] == "cst"


def test_cst_simulator_run_sensor_end_to_end_with_fakes(tmp_path: Path) -> None:
    case = CaseRequest.model_validate(CASES["sensor"])
    freq = np.linspace(1.0, 8.0, 701)
    dip = 0.85 / (1 + ((freq - 4.171) / 0.08) ** 2)
    s21 = np.clip(1.0 - dip, 0.05, 1.0) * np.exp(-1j * 0.3 * freq)
    s11 = np.full_like(freq, 0.15, dtype=complex)

    tree = [
        "1D Results\\S-Parameters\\S1,1",
        "1D Results\\S-Parameters\\S2,1",
    ]
    curves = {
        "1D Results\\S-Parameters\\S1,1": (freq, s11),
        "1D Results\\S-Parameters\\S2,1": (freq, s21),
    }

    project = _FakeProject()
    results_3d = _FakeResults3D(tree_items=tree, direct_curves=curves)
    sim = CSTSimulator(
        runs_dir=tmp_path,
        design_env_factory=lambda: _FakeDesignEnv(project),
        results_file_factory=lambda _: _FakeResultsFile(results_3d),
    )

    result = sim.run(case, lambda stage, msg, p=None: None)

    run_dirs = [p for p in tmp_path.iterdir() if p.is_dir()]
    assert len(run_dirs) == 1
    assert (run_dirs[0] / "Gielis_Sensor.cst").is_file()

    assert result.simulator == "cst"
    assert result.absorption is None
    assert result.s21_db is not None
    assert result.s11_db is not None
    assert any(r.parameter == "S21" and r.kind == "min" and abs(r.frequency_ghz - 4.171) < 0.02 for r in result.resonances)


@pytest.mark.parametrize("structure_type", ["normal", "complementary"])
def test_cst_simulator_run_transmitter_end_to_end_with_fakes(tmp_path: Path, structure_type: str) -> None:
    payload = copy.deepcopy(CASES["transmitter"])
    payload["structure_type"] = structure_type
    case = CaseRequest.model_validate(payload)
    freq = np.linspace(1.0, 8.0, 701)
    if structure_type == "normal":
        dip = 0.98 / (1 + ((freq - 3.114) / 0.08) ** 2)
        s21 = np.clip(1.0 - dip, 0.01, 1.0) * np.exp(-1j * 0.2 * freq)
    else:
        passband = 0.96 / (1 + ((freq - 4.745) / 0.12) ** 2)
        s21 = np.clip(0.03 + passband, 0.03, 0.99) * np.exp(-1j * 0.2 * freq)
    s11 = np.sqrt(np.clip(1.0 - np.abs(s21) ** 2 - 0.02, 0.001, 1.0)) + 0j

    tree = [
        "1D Results\\S-Parameters\\SZmax(1),Zmax(1)",
        "1D Results\\S-Parameters\\SZmin(1),Zmax(1)",
    ]
    curves = {
        "1D Results\\S-Parameters\\SZmax(1),Zmax(1)": (freq, s11),
        "1D Results\\S-Parameters\\SZmin(1),Zmax(1)": (freq, s21),
    }

    project = _FakeProject()
    results_3d = _FakeResults3D(tree_items=tree, direct_curves=curves)
    sim = CSTSimulator(
        runs_dir=tmp_path,
        design_env_factory=lambda: _FakeDesignEnv(project),
        results_file_factory=lambda _: _FakeResultsFile(results_3d),
    )

    result = sim.run(case, lambda stage, msg, p=None: None)

    run_dirs = [p for p in tmp_path.iterdir() if p.is_dir()]
    assert len(run_dirs) == 1
    assert (run_dirs[0] / "Gielis_Transmitter.cst").is_file()

    assert result.simulator == "cst"
    assert result.s21_db is not None
    assert result.s11_db is not None
    assert result.absorption is not None
    if structure_type == "normal":
        assert any(r.kind == "min" and abs(r.frequency_ghz - 3.114) < 0.02 for r in result.resonances)
    else:
        assert any(r.kind == "max" and abs(r.frequency_ghz - 4.745) < 0.02 for r in result.resonances)
