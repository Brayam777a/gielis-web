import numpy as np

from gielis_geometry import GielisGeometryService


def test_normal_structure_is_two_ring_slots():
    svc = GielisGeometryService()
    base = np.array(
        [[3, 0], [0, 3], [-3, 0], [0, -3]],
        dtype=float,
    )
    c1 = base
    c2 = base * 0.8
    c3 = base * 0.6
    c4 = base * 0.4

    s = svc.build_normal_geometry(c1, c2, c3, c4)

    assert s.ring1.area > 0
    assert s.ring2.area > 0
    assert np.isclose(s.normal.area, s.ring1.area + s.ring2.area)


def test_complementary_is_remaining_top_copper():
    svc = GielisGeometryService()
    base = np.array(
        [[3, 0], [0, 3], [-3, 0], [0, -3]],
        dtype=float,
    )
    c1, c2, c3, c4 = base, base * .8, base * .6, base * .4
    s = svc.build_normal_geometry(c1, c2, c3, c4)
    top = np.array(
        [[5, 0], [0, 5], [-5, 0], [0, -5]],
        dtype=float,
    )
    expected = svc.build_complementary_geometry(top, c1, c2, c3, c4)

    # The service uses the same Boolean construction as MATLAB:
    # full top copper minus the two annular slots.
    top_poly = svc.polygon_from_contour(top)
    ring1 = svc.polygon_from_contour(c1).difference(svc.polygon_from_contour(c2))
    ring2 = svc.polygon_from_contour(c3).difference(svc.polygon_from_contour(c4))
    reference = top_poly.difference(ring1).difference(ring2)
    assert np.isclose(expected.area, reference.area, rtol=1e-12, atol=1e-12)


def test_sensor_bridges_are_oriented_top_and_bottom():
    svc = GielisGeometryService()
    base = np.array(
        [[4, 0], [0, 4], [-4, 0], [0, -4]],
        dtype=float,
    )
    c1, c2, c3, c4 = base, base * .8, base * .55, base * .35
    sensor = svc.build_sensor_csrr(c1, c2, c3, c4, g_mm=.2)

    minx1, miny1, maxx1, maxy1 = sensor.bridge1.bounds
    minx2, miny2, maxx2, maxy2 = sensor.bridge2.bounds

    assert maxy1 > 0
    assert miny2 < 0
    assert sensor.bridge1.area > 0
    assert sensor.bridge2.area > 0
    assert sensor.sensor_cutters.area > 0


def test_sensor_substrate_validation():
    svc = GielisGeometryService()
    contours = [np.array([[1, 0], [0, 1], [-1, 0], [0, -1]], dtype=float)]
    svc.validate_sensor_inside_substrate(contours, width_mm=3, length_mm=3)

    try:
        svc.validate_sensor_inside_substrate(contours, width_mm=1.5, length_mm=3)
    except ValueError:
        pass
    else:
        raise AssertionError("Expected substrate containment validation to fail.")
