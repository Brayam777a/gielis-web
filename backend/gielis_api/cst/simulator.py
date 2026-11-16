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
from ..results import db, find_resonances
from ..schemas import CaseRequest, SimulationResult
from ..simulator import Progress
from .model_builder import CSTModelBuilder
from .results_reader import (
    ABSORBER_COPOL_CANDIDATES,
    ABSORBER_CROSSPOL_CANDIDATES,
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
        if case.mode != "absorber":
            raise ValueError(
                f"CSTSimulator solo implementa el modo 'absorber' por ahora (recibido: {case.mode!r})."
            )
        if case.structure_type != "normal":
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
        builder.build_absorber(case, geometry)
        builder.setup_absorber_simulation(case)

        cst_file = run_dir / "Gielis_Absorber.cst"
        project.save(str(cst_file))

        progress("simulating", "Ejecutando solver HF Frequency Domain en CST")
        started = time.perf_counter()
        project.model3d.run_solver()
        elapsed_s = time.perf_counter() - started
        project.save(str(cst_file))

        results_3d = self._results_file_factory(str(cst_file)).get_3d()
        tree_items = [str(item) for item in results_3d.get_tree_items()]
        (run_dir / "cst_result_tree.txt").write_text("\n".join(tree_items), encoding="utf-8")

        co = find_first_sparameter(results_3d, ABSORBER_COPOL_CANDIDATES, tree_items)
        if co is None:
            available = list_sparameter_paths(tree_items)
            if not available:
                available = [item for item in tree_items if "S-Parameter" in item]
            raise RuntimeError(
                "CST terminó, pero no devolvió reflexión co-polarizada legible. "
                "Consulta cst_result_tree.txt. Nodos S encontrados:\n"
                + "\n".join(available)
            )

        name_co, freq, s11 = co
        cross = find_first_sparameter(results_3d, ABSORBER_CROSSPOL_CANDIDATES, tree_items)
        s_cross = None
        name_cross: str | None = None
        if cross is not None:
            name_cross, freq_cross, s_cross = cross
            if len(freq_cross) != len(freq) or not np.allclose(freq_cross, freq, rtol=1e-8, atol=1e-10):
                raise RuntimeError("Las mallas de frecuencia de S11 y reflexión cruzada no coinciden.")

        s11_db = db(np.abs(s11))
        r_total = np.abs(s11) ** 2
        if s_cross is not None:
            r_total = r_total + np.abs(s_cross) ** 2
        abs_curve = np.clip(1.0 - r_total, 0.0, 1.0)

        resonances = find_resonances(case.mode, case.structure_type, freq, s11_db, None, abs_curve)
        progress("simulating", "Resultados CST extraídos", 100)

        metadata = {
            "simulator": "CST Studio Suite 2025",
            "solver": "HF Frequency Domain",
            "cst_project": str(cst_file),
            "solver_duration_s": round(elapsed_s, 3),
            "co_polar_channel": name_co,
            "cross_polar_channel": name_cross,
            "frequency_points": int(len(freq)),
            "frequency_range_ghz": [float(np.min(freq)), float(np.max(freq))],
        }
        (run_dir / "metadata.json").write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        notes = [f"Simulación CST HF Frequency Domain ({elapsed_s:.1f} s); canal co-polar: {name_co}."]
        if name_cross is not None:
            notes.append(f"Incluye canal de reflexión cruzada: {name_cross}.")
        else:
            notes.append(
                "Reflexión cruzada no disponible en el árbol CST; "
                "absorción calculada solo con reflexión co-polarizada."
            )

        return SimulationResult(
            simulator="cst",
            frequency_ghz=_rounded(freq, 5),
            s11_db=_rounded(s11_db, 3),
            s21_db=None,
            absorption=_rounded(abs_curve, 4),
            resonances=resonances,
            notes=notes,
        )
