import numpy as np

from gielis_geometry import (
    ConcentricParameters,
    GielisGeometryService,
    GielisParameters,
)


def test_concentric_scales_follow_physical_gap():
    svc = GielisGeometryService()
    g = GielisParameters(1.0, 1.0, 4.0, 2.0, 2.0, 2.0)
    _, base_poly = svc.generate_cst_contour(g)
    base = np.asarray(base_poly.exterior.coords)[:-1]

    params = ConcentricParameters(
        size1=1.0, size2=0.7, gap_mm=0.10, rotation_deg=0, dx_mm=0, dy_mm=0
    )
    c1, c2, c3, c4 = svc.build_concentric(base, params)

    rbase = np.max(np.hypot(base[:, 0], base[:, 1]))
    assert np.isclose(
        np.max(np.hypot(c1[:, 0], c1[:, 1]))
        - np.max(np.hypot(c2[:, 0], c2[:, 1])),
        0.10,
        atol=1e-10,
    )
    assert np.isclose(
        np.max(np.hypot(c3[:, 0], c3[:, 1]))
        - np.max(np.hypot(c4[:, 0], c4[:, 1])),
        0.10,
        atol=1e-10,
    )


def test_rotation_and_translation_are_applied_to_all_contours():
    svc = GielisGeometryService()
    base = np.array([[2, 0], [0, 1], [-2, 0], [0, -1]], dtype=float)
    p = ConcentricParameters(size1=1, size2=0.7, gap_mm=0.1, rotation_deg=90, dx_mm=3, dy_mm=-2)
    c1, *_ = svc.build_concentric(base, p)

    expected = np.array([[3, 0], [2, -2], [3, -4], [4, -2]], dtype=float)
    np.testing.assert_allclose(c1, expected, atol=1e-12)


def test_concentric_order_is_nested():
    svc = GielisGeometryService()
    base = np.array([[2, 0], [0, 2], [-2, 0], [0, -2]], dtype=float)
    c1, c2, c3, c4 = svc.build_concentric(
        base, ConcentricParameters(size1=1.0, size2=0.7, gap_mm=0.1)
    )
    areas = [
        svc.polygon_from_contour(c).area
        for c in (c1, c2, c3, c4)
    ]
    assert areas[0] > areas[1] > areas[2] > areas[3]
