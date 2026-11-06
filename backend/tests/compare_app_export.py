"""
Compara la geometría de Python con la que exportó la app MATLAB real
(matlab/export_from_app.m).

Uso:
    python tests/compare_app_export.py absorber_app.json --case absorber
    python tests/compare_app_export.py sensor_app.json --case sensor

Se comparan áreas y la distancia de Hausdorff entre contornos (la máxima
separación entre las dos curvas, en mm). No se comparan vértice a vértice
porque MATLAB polyshape y Shapely pueden empezar el contorno en otro punto.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from shapely.geometry import LineString

from gielis_geometry import ConcentricParameters, GielisGeometryService, GielisParameters

EXAMPLES = Path(__file__).parents[1] / "examples"


def ring(points) -> LineString:
    p = np.asarray(points, dtype=float)[:, :2]
    if np.linalg.norm(p[0] - p[-1]) > 1e-9:
        p = np.vstack((p, p[0]))
    return LineString(p)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("app_json")
    ap.add_argument("--case", required=True, choices=["absorber", "transmitter", "sensor"])
    ap.add_argument("--hausdorff-tol-mm", type=float, default=1e-3)
    ap.add_argument("--area-rel-tol", type=float, default=1e-4)
    args = ap.parse_args()

    app = json.loads(Path(args.app_json).read_text(encoding="utf-8"))
    cfg = json.loads((EXAMPLES / f"{args.case}_case_params.json").read_text(encoding="utf-8"))
    svc = GielisGeometryService()

    gp = cfg["gielis_parameters"]
    for k, v in gp.items():
        if not np.isclose(float(app["gielis"][k]), float(v)):
            print(f"AVISO: en la app {k}={app['gielis'][k]}, en el JSON {k}={v}. ¿Escribiste bien los parámetros?")

    _, _, x, y = svc.generate_curve(GielisParameters(**gp))
    base, _ = svc.radial_outer_envelope(x, y)
    cg = cfg["concentric_geometry"]
    cp = ConcentricParameters(
        size1=cg["size_1"], size2=cg["size_2"], gap_mm=cg["gap_mm"],
        rotation_deg=cg["rotation_deg"],
        dx_mm=0.0 if args.case == "sensor" else cg["dx_mm"],
        dy_mm=0.0 if args.case == "sensor" else cg["dy_mm"],
    )
    cs = list(svc.build_concentric(base[:-1], cp))
    if args.case == "sensor":
        # La app centra el sensor y luego aplica dx/dy (totalDx = -cx + dx).
        tx, ty = svc.sensor_centering_translation(cs, cg["dx_mm"], cg["dy_mm"])
        cs = [svc.translate_contour(c, tx, ty) for c in cs]

    failures = []
    print(f"[{args.case}]")
    for key, c in zip(("C1", "C2", "C3", "C4"), cs):
        h = ring(c).hausdorff_distance(ring(app[key]))
        py_area = svc.polygon_from_contour(c).area
        ml_area = float(app[f"{key}_area_mm2"])
        rel = abs(py_area - ml_area) / max(abs(ml_area), 1e-15)
        ok = h <= args.hausdorff_tol_mm and rel <= args.area_rel_tol
        print(f"  {key}: Hausdorff={h:.2e} mm, área Python={py_area:.6f} app={ml_area:.6f} (rel Δ={rel:.2e}) {'OK' if ok else 'FALLA'}")
        if not ok:
            failures.append(key)

    if failures:
        raise SystemExit(f"RESULTADO: FALLA en {', '.join(failures)}")
    print("RESULTADO: Python coincide con la app")


if __name__ == "__main__":
    main()
