"""
Regenera golden/golden_cases.json con el código actual.

Úsalo SOLO después de un cambio intencional de la geometría (por ejemplo, la
corrección del ángulo de la envolvente del 06/11/2026) y revisa el diff antes
de hacer commit. Los valores golden prueban que el código no cambie sin querer;
la equivalencia con la app real se prueba con tests/compare_app_export.py.

Uso, desde la carpeta backend con el .venv activado:
    python tools/update_golden.py
    python -m pytest
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

from gielis_geometry import ConcentricParameters, GielisGeometryService, GielisParameters

ROOT = Path(__file__).parents[1]
NAMES = {"absorber": "Absorber mode", "transmitter": "Transmitter mode", "sensor": "Sensor mode"}


def ring_info(coords) -> dict:
    c = np.asarray(coords, dtype=float)[:, :2]
    closed = c if np.allclose(c[0], c[-1]) else np.vstack((c, c[0]))
    poly = GielisGeometryService.polygon_from_contour(c)
    return {
        "area_mm2": float(poly.area),
        "bounds_mm": [float(v) for v in poly.bounds],
        "vertex_count_closed": int(len(closed)),
        # sha256 de las coordenadas redondeadas a 10 decimales (huella para detectar cambios)
        "hash_rounded_10dp": hashlib.sha256(np.round(closed, 10).tobytes()).hexdigest(),
    }


def main() -> None:
    svc = GielisGeometryService()
    out = {
        "schema_version": 1,
        "description": "Golden geometry signatures for GielisMetaCST MATLAB cases.",
        "purpose": "Regression validation of GielisGeometryService before CSTAdapter integration.",
        "cases": {},
    }
    for name, label in NAMES.items():
        cfg = json.loads((ROOT / "examples" / f"{name}_case_params.json").read_text(encoding="utf-8"))
        gp = cfg["gielis_parameters"]
        _, rho, x, y = svc.generate_curve(GielisParameters(**gp))
        base, _ = svc.radial_outer_envelope(x, y)
        cg = cfg["concentric_geometry"]
        cp = ConcentricParameters(
            size1=cg["size_1"], size2=cg["size_2"], gap_mm=cg["gap_mm"],
            rotation_deg=cg["rotation_deg"], dx_mm=cg["dx_mm"], dy_mm=cg["dy_mm"],
        )
        c1, c2, c3, c4 = svc.build_concentric(base[:-1], cp)
        rec = {
            "source_case": label,
            "source_json": f"{name}_case_params.json",
            "gielis_parameters": gp,
            "curve": {
                "sample_count": int(len(rho)),
                "period_multiplier_u": svc.period_multiplier(gp["m"], gp["a"], gp["b"], gp["n2"], gp["n3"]),
                "rho_min": float(np.min(rho)),
                "rho_max": float(np.max(rho)),
            },
            "base_envelope": ring_info(base),
            "concentric": {
                **{k: ring_info(c) for k, c in zip(("c1", "c2", "c3", "c4"), (c1, c2, c3, c4))},
                "gap_mm": float(cg["gap_mm"]),
                "size_1": float(cg["size_1"]),
                "size_2_requested": float(cg["size_2"]),
                "rotation_deg": float(cg["rotation_deg"]),
                "dx_mm": float(cg["dx_mm"]),
                "dy_mm": float(cg["dy_mm"]),
            },
        }
        normal = svc.build_normal_geometry(c1, c2, c3, c4)
        if name in ("absorber", "transmitter"):
            rec["normal"] = {
                "ring1_area_mm2": float(normal.ring1.area),
                "ring2_area_mm2": float(normal.ring2.area),
                "total_area_mm2": float(normal.normal.area),
            }
        if name == "transmitter":
            W, L = cfg["substrate"]["width_mm"], cfg["substrate"]["length_mm"]
            top = np.array([[-W / 2, -L / 2], [W / 2, -L / 2], [W / 2, L / 2], [-W / 2, L / 2]], dtype=float)
            comp = svc.build_complementary_geometry(top, c1, c2, c3, c4)
            rec["complementary"] = {"top_copper_area_mm2": float(W * L), "remaining_area_mm2": float(comp.area)}
        if name == "sensor":
            tx, ty = svc.sensor_centering_translation([c1, c2, c3, c4], 0.0, 0.0)
            s = [svc.translate_contour(c, tx, ty) for c in (c1, c2, c3, c4)]
            sen = svc.build_sensor_csrr(*s, g_mm=cg["gap_mm"])
            allxy = np.vstack(s)
            rec["sensor"] = {
                "centering_translation_mm": [float(tx), float(ty)],
                "centered_bounds_mm": [float(allxy[:, 0].min()), float(allxy[:, 1].min()),
                                       float(allxy[:, 0].max()), float(allxy[:, 1].max())],
                "ring1_slot_area_mm2": float(sen.ring1_slot.area),
                "ring2_slot_area_mm2": float(sen.ring2_slot.area),
                "bridge1_area_mm2": float(sen.bridge1.area),
                "bridge2_area_mm2": float(sen.bridge2.area),
                "bridge1_bounds_mm": [float(v) for v in sen.bridge1.bounds],
                "bridge2_bounds_mm": [float(v) for v in sen.bridge2.bounds],
                "sensor_cutters_area_mm2": float(sen.sensor_cutters.area),
            }
        out["cases"][name] = rec

    path = ROOT / "golden" / "golden_cases.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Actualizado {path}")


if __name__ == "__main__":
    main()
