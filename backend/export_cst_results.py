r"""
Exporta resultados 1D ya existentes de un proyecto CST a CSV.
NO construye geometría y NO ejecuta el solver.

Uso:
  .venv\Scripts\python.exe export_cst_results.py
  .venv\Scripts\python.exe export_cst_results.py "ruta\proyecto.cst"
"""
from __future__ import annotations

import csv
import json
import sys
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import numpy as np
import cst.results

from gielis_api.cst.results_reader import list_sparameter_paths, read_1d_complex_curve


DEFAULT_PROJECT = Path(
    r"C:\Gielis\gielis-web-main-current\gielis-web-main\backend\runs"
    r"\20261107_185821_absorber_reference\Gielis_Absorber_Reference.cst"
)


def main() -> int:
    project_file = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PROJECT
    if not project_file.is_file():
        raise FileNotFoundError(f"No existe el proyecto CST: {project_file}")

    out_dir = project_file.parent / "exported_results"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Proyecto: {project_file}", flush=True)
    print("Abriendo resultados guardados en CST...", flush=True)
    project = cst.results.ProjectFile(str(project_file), allow_interactive=True).get_3d()

    tree = [str(x) for x in project.get_tree_items()]
    (out_dir / "cst_result_tree.txt").write_text("\n".join(tree), encoding="utf-8")

    s_paths = list_sparameter_paths(tree)
    if not s_paths:
        print("No hay nodos S-Parameters en el árbol de resultados de este proyecto.")
        print(f"Árbol completo guardado en: {out_dir / 'cst_result_tree.txt'}")
        return 2

    exported = []
    for index, path in enumerate(s_paths, 1):
        try:
            curve = read_1d_complex_curve(project, path)
            if curve is None:
                print(f"OMITIDO (datos vacíos/no legibles): {path}")
                continue
            freq, values = curve

            safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in path)
            csv_file = out_dir / f"{index:02d}_{safe_name}.csv"
            magnitude = np.abs(values)
            with csv_file.open("w", newline="", encoding="utf-8-sig") as f:
                writer = csv.writer(f)
                writer.writerow([
                    "frequency_GHz", "real", "imag", "magnitude",
                    "magnitude_dB", "phase_deg"
                ])
                for fr, val, mag in zip(freq, values, magnitude):
                    writer.writerow([
                        float(fr), float(val.real), float(val.imag), float(mag),
                        float(20 * np.log10(max(mag, np.finfo(float).tiny))),
                        float(np.angle(val, deg=True))
                    ])

            exported.append({
                "tree_path": path,
                "csv": str(csv_file),
                "points": int(len(freq)),
                "frequency_min": float(np.min(freq)),
                "frequency_max": float(np.max(freq)),
            })
            print(f"EXPORTADO: {path} ({len(freq)} puntos)", flush=True)
        except Exception as exc:
            print(f"NO SE PUDO LEER: {path} -> {type(exc).__name__}: {exc}", flush=True)

    summary = {
        "project": str(project_file),
        "exported_at": datetime.now().isoformat(timespec="seconds"),
        "tree_items": tree,
        "s_parameter_items_found": s_paths,
        "exported": exported,
        "status": "exported" if exported else "no_readable_s_parameter_data",
    }
    (out_dir / "export_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"\nExportados: {len(exported)} de {len(s_paths)} resultados S.")
    print(f"Carpeta: {out_dir}")
    if not exported:
        print("No se han creado curvas: el proyecto no contiene resultados S legibles.")
        return 3
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {type(error).__name__}: {error}", flush=True)
        raise
