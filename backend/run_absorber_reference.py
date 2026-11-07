"""
Ejecuta en CST 2025 el caso absorbente de referencia del repositorio.
Crea un proyecto nuevo, ejecuta HF Frequency Domain y exporta resultados.

IMPORTANTE:
- Usa el caso publicado: FR-4 tanδ=0.02, gap=1.6 mm, size1=1.5, size2=1.0,
  frecuencia 1-8 GHz. No reutiliza el modelo de prueba anterior con tanδ=0.027.
- La absorción total solo se calcula si CST entrega también la reflexión cruzada
  del segundo modo Floquet. Si no aparece, exporta absorción co-polarizada
  y deja la absorción total vacía (no inventa que la polarización cruzada es cero).
"""
from __future__ import annotations

import csv
import json
import sys
import time
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND))

import numpy as np
import cst.interface
import cst.results

from gielis_api.schemas import CaseRequest
from gielis_api.geometry import build_case_geometry
from gielis_api.cst.model_builder import CSTModelBuilder


def log(message: str) -> None:
    print(message, flush=True)


def get_result(results_3d, candidates: list[str]):
    for name in candidates:
        path = f"1D Results\\S-Parameters\\{name}"
        try:
            item = results_3d.get_result_item(path)
            x = np.asarray(item.get_xdata(), dtype=float).reshape(-1)
            y = np.asarray(item.get_ydata(), dtype=complex).reshape(-1)
            if len(x) and len(x) == len(y):
                return name, x, y
        except Exception:
            pass
    return None


def main() -> int:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = BACKEND / "runs" / f"{stamp}_absorber_reference"
    run_dir.mkdir(parents=True, exist_ok=False)
    cst_file = run_dir / "Gielis_Absorber_Reference.cst"

    # Parámetros exactos de examples/absorber_case_params.json del repositorio.
    case = CaseRequest.model_validate({
        "schema_version": "1.0",
        "mode": "absorber",
        "structure_type": "normal",
        "gielis": {"a": 4, "b": 3.6, "m": 8, "n1": 1.1, "n2": 1.7, "n3": 1.7},
        "concentric": {
            "gap_mm": 1.6, "size1": 1.5, "size2": 1.0,
            "rotation_deg": 0, "dx_mm": 0, "dy_mm": 0
        },
        "substrate": {
            "material": "FR-4 (lossy)", "width_mm": 30, "length_mm": 30,
            "thickness_mm": 1.6, "eps_r": 4.3, "loss_tangent": 0.02
        },
        "metal": {"material": "Copper (annealed)", "thickness_mm": 0.035},
        "transmission_line": None,
        "frequency": {"min_ghz": 1, "max_ghz": 8},
        "field_monitors": []
    })

    # Guardas explícitas: impiden ejecutar accidentalmente el caso de prueba 1-10 GHz.
    assert case.mode == "absorber" and case.structure_type == "normal"
    assert case.frequency.min_ghz == 1 and case.frequency.max_ghz == 8
    assert case.substrate.eps_r == 4.3 and case.substrate.loss_tangent == 0.02
    assert case.concentric.gap_mm == 1.6
    assert case.concentric.size1 == 1.5 and case.concentric.size2 == 1.0

    (run_dir / "case_used.json").write_text(
        case.model_dump_json(indent=2), encoding="utf-8"
    )

    log("Caso de referencia cargado: FR-4 tanδ=0.02; 1-8 GHz; gap=1.6 mm.")
    geometry = build_case_geometry(case)

    log("Abriendo CST y construyendo el modelo...")
    design = cst.interface.DesignEnvironment()
    project = design.new_mws()
    CSTModelBuilder(project).build_absorber(case, geometry)

    # Configuración de simulación traducida de CST_MicrowaveStudio.m:
    # setSolver('frequency'), setFreq(1, 8), setBoundaryCondition(...) y
    # defineFloquetModes(2). Las caras Z son open add space (VBA: expanded open).
    setup_history = [
        ("change solver type", 'ChangeSolverType "HF Frequency Domain"'),
        ("SetFrequency", 'Solver.FrequencyRange "1.000000", "8.000000"'),
        ("define boundaries", '\n'.join([
            "With Boundary", '.Xmin "unit cell"', '.Xmax "unit cell"',
            '.Ymin "unit cell"', '.Ymax "unit cell"',
            '.Zmin "expanded open"', '.Zmax "expanded open"', "End With"
        ])),
        ("define Floquet Port boundaries", '\n'.join([
            "With FloquetPort", ".Reset", '.SetDialogTheta "0"', '.SetDialogPhi "0"',
            '.SetPolarizationIndependentOfScanAnglePhi "0.0", "False"',
            '.SetSortCode "+beta/pw"', '.SetCustomizedListFlag "False"',
            '.Port "Zmin"', '.SetNumberOfModesConsidered "2"',
            '.SetDistanceToReferencePlane "0.0"', '.SetUseCircularPolarization "False"',
            '.Port "Zmax"', '.SetNumberOfModesConsidered "2"',
            '.SetDistanceToReferencePlane "0.0"', '.SetUseCircularPolarization "False"',
            "End With"
        ])),
    ]
    for caption, vba in setup_history:
        project.model3d.add_to_history(caption, vba)

    project.save(str(cst_file))
    log(f"Proyecto y setup electromagnético guardados: {cst_file}")

    log("Iniciando solver HF Frequency Domain. CST ejecutará la simulación real...")
    started = time.time()
    project.model3d.run_solver()
    project.save(str(cst_file))
    log(f"Solver finalizado en {(time.time() - started) / 60:.1f} min.")

    log("Extrayendo resultados 1D de CST...")
    result_3d = cst.results.ProjectFile(str(cst_file), allow_interactive=True).get_3d()
    tree_items = list(result_3d.get_tree_items())
    (run_dir / "cst_result_tree.txt").write_text(
        "\n".join(str(item) for item in tree_items), encoding="utf-8"
    )

    co = get_result(result_3d, [
        "SZmax(1),Zmax(1)", "SZmax(1)Zmax(1)", "SZmax,Zmax", "S1,1"
    ])
    if co is None:
        available = [str(item) for item in tree_items if "S-Parameters" in str(item)]
        raise RuntimeError(
            "CST terminó, pero no se encontró la reflexión co-polarizada de Zmax. "
            "Consulta cst_result_tree.txt. Resultados S disponibles:\n" +
            "\n".join(available)
        )

    cross = get_result(result_3d, [
        "SZmax(2),Zmax(1)", "SZmax(2)Zmax(1)"
    ])

    name_co, freq, s11 = co
    cross_values = None
    if cross is not None:
        name_cross, freq_cross, cross_values = cross
        if len(freq_cross) != len(freq) or not np.allclose(freq_cross, freq, rtol=1e-8, atol=1e-10):
            raise RuntimeError("Las mallas de frecuencia de S11 y reflexión cruzada no coinciden.")
    else:
        name_cross = None

    s11_db = 20 * np.log10(np.maximum(np.abs(s11), np.finfo(float).tiny))
    absorption_copol = (1.0 - np.abs(s11) ** 2) * 100.0
    absorption_total = None
    if cross_values is not None:
        absorption_total = (1.0 - np.abs(s11) ** 2 - np.abs(cross_values) ** 2) * 100.0
        absorption_total = np.clip(absorption_total, 0.0, 100.0)

    csv_path = run_dir / "sparameters_absorption.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "frequency_GHz", "S11_real", "S11_imag", "S11_abs", "S11_dB",
            "cross_reflection_real", "cross_reflection_imag",
            "absorption_copol_percent", "absorption_total_percent"
        ])
        for i, f in enumerate(freq):
            cv = cross_values[i] if cross_values is not None else None
            writer.writerow([
                f, s11[i].real, s11[i].imag, abs(s11[i]), s11_db[i],
                cv.real if cv is not None else "",
                cv.imag if cv is not None else "",
                absorption_copol[i],
                absorption_total[i] if absorption_total is not None else "",
            ])

    result = {
        "status": "completed",
        "simulator": "CST Studio Suite 2025",
        "solver": "HF Frequency Domain",
        "case": "absorber reference",
        "frequency_range_GHz": [float(freq.min()), float(freq.max())],
        "frequency_points": int(len(freq)),
        "co_polar_reflection_term": name_co,
        "cross_polar_reflection_term": name_cross,
        "absorption_total_available": absorption_total is not None,
        "csv": str(csv_path),
        "cst_project": str(cst_file),
        "reference_peaks_from_manuscript_not_simulation": [
            {"frequency_GHz": 2.435, "S11_dB": -16.87, "absorption_percent": 97.9},
            {"frequency_GHz": 3.849, "S11_dB": -10.26, "absorption_percent": 90.6},
        ],
    }
    (run_dir / "simulation_summary.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    log(f"CSV exportado: {csv_path}")
    log(f"S11 term: {name_co}")
    log(f"Reflexión cruzada: {name_cross or 'no disponible'}")
    if absorption_total is None:
        log("ATENCIÓN: solo se exportó absorción co-polarizada; no se afirma absorción total.")
    else:
        log("Absorción total calculada incluyendo la reflexión cruzada.")
    log(f"Carpeta de resultados: {run_dir}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        log(f"ERROR: {type(exc).__name__}: {exc}")
        raise
