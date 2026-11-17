"""Simulador real en CST Studio Suite 2025 para `gielis_api`."""
from __future__ import annotations

import json
import secrets
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

import numpy as np

from ..geometry import build_case_geometry
from ..results import absorption, db, find_resonances
from ..schemas import CaseRequest, SimulationResult
from ..simulator import Progress
from .model_builder import CSTModelBuilder
from .results_reader import (
    ABSORBER_COPOL_CANDIDATES,
    ABSORBER_CROSSPOL_CANDIDATES,
    SENSOR_S11_CANDIDATES,
    SENSOR_S21_CANDIDATES,
    TRANSMITTER_S21_CANDIDATES,
    find_first_sparameter,
    list_sparameter_paths,
)


def _default_design_env() -> Any:
    import cst.interface

    return cst.interface.DesignEnvironment()


def _default_results_file(project_path: str) -> Any:
    import cst.results

    return cst.results.ProjectFile(project_path, allow_interactive=True)


def _rounded(values: np.ndarray, digits: int) -> list[float]:
    return [round(float(v), digits) for v in values]


def _check_frequency_grid(freq: np.ndarray, other: np.ndarray, label: str) -> None:
    if len(other) != len(freq) or not np.allclose(other, freq, rtol=1e-8, atol=1e-10):
        raise RuntimeError(f"Las mallas de frecuencia de la curva principal y {label} no coinciden.")


def _available_s_nodes(tree_items: list[str]) -> str:
    available = list_sparameter_paths(tree_items)
    if not available:
        available = [item for item in tree_items if "S-Parameter" in item]
    return "\n".join(available)


class CSTSimulator:
    """Ejecuta simulaciones reales en CST Studio Suite implementando `Simulator`."""

    name = "cst"

    def __init__(
        self,
        runs_dir: Path | None = None,
        design_env_factory: Callable[[], Any] | None = None,
        results_file_factory: Callable[[str], Any] | None = None,
    ) -> None:
        self.runs_dir = (
            Path(runs_dir)
            if runs_dir is not None
            else Path(__file__).resolve().parents[2] / "runs"
        )
        self._design_env_factory = design_env_factory or _default_design_env
        self._results_file_factory = results_file_factory or _default_results_file

    def run(self, case: CaseRequest, progress: Progress) -> SimulationResult:
        if case.mode == "absorber" and case.structure_type != "normal":
            raise ValueError(
                "CSTSimulator solo admite estructura 'normal' en modo 'absorber' por ahora."
            )

        progress("building", "Construyendo la geometría Gielis")
        geometry = build_case_geometry(case)

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir = self.runs_dir / f"cst_{stamp}_{case.mode}_{secrets.token_hex(2)}"
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "input.json").write_text(case.model_dump_json(indent=2), encoding="utf-8")

        progress("building", "Construyendo el modelo 3D en CST Studio Suite")
        design = self._design_env_factory()
        project = design.new_mws()
        builder = CSTModelBuilder(project)
        builder.build_case(case, geometry)
        builder.setup_simulation(case)

        cst_file = run_dir / f"Gielis_{case.mode.capitalize()}.cst"
        project.save(str(cst_file))

        progress("simulating", "Ejecutando solver HF Frequency Domain en CST")
        started = time.perf_counter()
        project.model3d.run_solver()
        elapsed_s = time.perf_counter() - started
        project.save(str(cst_file))

        results_3d = self._results_file_factory(str(cst_file)).get_3d()
        tree_items = [str(item) for item in results_3d.get_tree_items()]
        (run_dir / "cst_result_tree.txt").write_text("\n".join(tree_items), encoding="utf-8")

        extracted = self._extract_mode_results(case, results_3d, tree_items, elapsed_s)
        freq = extracted["freq"]
        s11_db = extracted["s11_db"]
        s21_db = extracted["s21_db"]
        abs_curve = extracted["absorption"]

        resonances = find_resonances(case.mode, case.structure_type, freq, s11_db, s21_db, abs_curve)
        progress("simulating", "Resultados CST extraídos", 100)

        metadata = {
            "simulator": "CST Studio Suite 2025",
            "solver": "HF Frequency Domain",
            "mode": case.mode,
            "structure_type": case.structure_type,
            "cst_project": str(cst_file),
            "solver_duration_s": round(elapsed_s, 3),
            "co_polar_channel": extracted["co_polar_channel"],
            "cross_polar_channel": extracted["cross_polar_channel"],
            "s11_channel": extracted["s11_channel"],
            "s21_channel": extracted["s21_channel"],
            "frequency_points": int(len(freq)),
            "frequency_range_ghz": [float(np.min(freq)), float(np.max(freq))],
        }
        (run_dir / "metadata.json").write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        return SimulationResult(
            simulator="cst",
            frequency_ghz=_rounded(freq, 5),
            s11_db=None if s11_db is None else _rounded(s11_db, 3),
            s21_db=None if s21_db is None else _rounded(s21_db, 3),
            absorption=None if abs_curve is None else _rounded(abs_curve, 4),
            resonances=resonances,
            notes=extracted["notes"],
        )

    @staticmethod
    def _extract_mode_results(
        case: CaseRequest,
        results_3d: Any,
        tree_items: list[str],
        elapsed_s: float,
    ) -> dict[str, Any]:
        if case.mode == "absorber":
            co = find_first_sparameter(results_3d, ABSORBER_COPOL_CANDIDATES, tree_items)
            if co is None:
                raise RuntimeError(
                    "CST terminó, pero no devolvió reflexión co-polarizada legible. "
                    "Consulta cst_result_tree.txt. Nodos S encontrados:\n"
                    + _available_s_nodes(tree_items)
                )

            name_co, freq, s11 = co
            cross = find_first_sparameter(results_3d, ABSORBER_CROSSPOL_CANDIDATES, tree_items)
            s_cross = None
            name_cross: str | None = None
            if cross is not None:
                name_cross, freq_cross, s_cross = cross
                _check_frequency_grid(freq, freq_cross, "reflexión cruzada")

            s11_db = db(np.abs(s11))
            r_total = np.abs(s11) ** 2
            if s_cross is not None:
                r_total = r_total + np.abs(s_cross) ** 2
            abs_curve = np.clip(1.0 - r_total, 0.0, 1.0)

            notes = [f"Simulación CST HF Frequency Domain ({elapsed_s:.1f} s); canal co-polar: {name_co}."]
            if name_cross is not None:
                notes.append(f"Incluye canal de reflexión cruzada: {name_cross}.")
            else:
                notes.append(
                    "Reflexión cruzada no disponible en el árbol CST; "
                    "absorción calculada solo con reflexión co-polarizada."
                )
            return {
                "freq": freq,
                "s11_db": s11_db,
                "s21_db": None,
                "absorption": abs_curve,
                "co_polar_channel": name_co,
                "cross_polar_channel": name_cross,
                "s11_channel": name_co,
                "s21_channel": None,
                "notes": notes,
            }

        s21_candidates = TRANSMITTER_S21_CANDIDATES if case.mode == "transmitter" else SENSOR_S21_CANDIDATES
        s11_candidates = ABSORBER_COPOL_CANDIDATES if case.mode == "transmitter" else SENSOR_S11_CANDIDATES

        tx = find_first_sparameter(results_3d, s21_candidates, tree_items)
        if tx is None:
            raise RuntimeError(
                f"CST terminó en modo {case.mode}, pero no devolvió transmisión legible (S21). "
                "Consulta cst_result_tree.txt. Nodos S encontrados:\n"
                + _available_s_nodes(tree_items)
            )
        name_s21, freq, s21 = tx
        s21_db = db(np.abs(s21))

        rx = find_first_sparameter(results_3d, s11_candidates, tree_items)
        s11_db: np.ndarray | None = None
        name_s11: str | None = None
        if rx is not None:
            name_s11, freq_s11, s11 = rx
            _check_frequency_grid(freq, freq_s11, "reflexión S11")
            s11_db = db(np.abs(s11))

        abs_curve = absorption(s11_db, s21_db) if (case.mode == "transmitter" and s11_db is not None) else None
        notes = [f"Simulación CST HF Frequency Domain ({elapsed_s:.1f} s); canal S21: {name_s21}."]
        if name_s11 is not None:
            notes.append(f"Canal de reflexión S11: {name_s11}.")

        return {
            "freq": freq,
            "s11_db": s11_db,
            "s21_db": s21_db,
            "absorption": abs_curve,
            "co_polar_channel": name_s21,
            "cross_polar_channel": None,
            "s11_channel": name_s11,
            "s21_channel": name_s21,
            "notes": notes,
        }
