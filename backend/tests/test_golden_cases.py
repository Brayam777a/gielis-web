
import json
from pathlib import Path

import numpy as np

from gielis_geometry import (
    GielisGeometryService,
    GielisParameters,
    ConcentricParameters,
)


ROOT = Path(__file__).parents[1]
GOLDEN = json.loads((ROOT / "golden" / "golden_cases.json").read_text(encoding="utf-8"))
EXAMPLES = ROOT / "examples"
CASE_FILES = {
    name: EXAMPLES / f"{name}_case_params.json"
    for name in ("absorber", "transmitter", "sensor")
}


def test_golden_cases_have_all_three_modes():
    assert set(GOLDEN["cases"]) == {"absorber", "transmitter", "sensor"}


def test_golden_geometry_regression():
    svc = GielisGeometryService()

    for name, record in GOLDEN["cases"].items():
        source = json.loads(CASE_FILES[name].read_text(encoding="utf-8"))
        gp = source["gielis_parameters"]
        _, rho, x, y = svc.generate_curve(GielisParameters(**gp))

        assert len(rho) == 8000
        assert record["curve"]["period_multiplier_u"] == svc.period_multiplier(
            gp["m"], gp["a"], gp["b"], gp["n2"], gp["n3"]
        )

        contour, base_poly = svc.radial_outer_envelope(x, y)
        assert np.isclose(base_poly.area, record["base_envelope"]["area_mm2"], rtol=1e-10, atol=1e-10)

        cg = source["concentric_geometry"]
        cp = ConcentricParameters(
            size1=cg["size_1"],
            size2=cg["size_2"],
            gap_mm=cg["gap_mm"],
            rotation_deg=cg["rotation_deg"],
            dx_mm=cg["dx_mm"],
            dy_mm=cg["dy_mm"],
        )
        c1, c2, c3, c4 = svc.build_concentric(contour[:-1], cp)

        for key, c in zip(("c1", "c2", "c3", "c4"), (c1, c2, c3, c4)):
            poly = svc.polygon_from_contour(c)
            expected = record["concentric"][key]
            assert np.isclose(poly.area, expected["area_mm2"], rtol=1e-10, atol=1e-10)

        if name == "absorber":
            s = svc.build_normal_geometry(c1, c2, c3, c4)
            assert np.isclose(s.ring1.area, record["normal"]["ring1_area_mm2"], rtol=1e-10)
            assert np.isclose(s.ring2.area, record["normal"]["ring2_area_mm2"], rtol=1e-10)
            assert np.isclose(s.normal.area, record["normal"]["total_area_mm2"], rtol=1e-10)

        elif name == "transmitter":
            top = np.array([
                [-source["substrate"]["width_mm"]/2, -source["substrate"]["length_mm"]/2],
                [ source["substrate"]["width_mm"]/2, -source["substrate"]["length_mm"]/2],
                [ source["substrate"]["width_mm"]/2,  source["substrate"]["length_mm"]/2],
                [-source["substrate"]["width_mm"]/2,  source["substrate"]["length_mm"]/2],
            ], dtype=float)
            s = svc.build_normal_geometry(c1, c2, c3, c4)
            comp = svc.build_complementary_geometry(top, c1, c2, c3, c4)
            assert np.isclose(s.normal.area, record["normal"]["total_area_mm2"], rtol=1e-10)
            assert np.isclose(comp.area, record["complementary"]["remaining_area_mm2"], rtol=1e-10)

        elif name == "sensor":
            tx, ty = svc.sensor_centering_translation([c1, c2, c3, c4], 0.0, 0.0)
            c1s = svc.translate_contour(c1, tx, ty)
            c2s = svc.translate_contour(c2, tx, ty)
            c3s = svc.translate_contour(c3, tx, ty)
            c4s = svc.translate_contour(c4, tx, ty)
            sensor = svc.build_sensor_csrr(c1s, c2s, c3s, c4s, g_mm=cg["gap_mm"])

            expected = record["sensor"]
            assert np.allclose([tx, ty], expected["centering_translation_mm"], rtol=0, atol=1e-10)
            assert np.isclose(sensor.ring1_slot.area, expected["ring1_slot_area_mm2"], rtol=1e-10)
            assert np.isclose(sensor.ring2_slot.area, expected["ring2_slot_area_mm2"], rtol=1e-10)
            assert np.isclose(sensor.bridge1.area, expected["bridge1_area_mm2"], rtol=1e-10)
            assert np.isclose(sensor.bridge2.area, expected["bridge2_area_mm2"], rtol=1e-10)
            assert np.isclose(sensor.sensor_cutters.area, expected["sensor_cutters_area_mm2"], rtol=1e-10)
