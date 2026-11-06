import numpy as np
import pytest

from gielis_geometry import GielisGeometryService, GielisParameters


def test_gielis_curve_has_exact_sample_count_and_is_finite():
    svc = GielisGeometryService()
    p = GielisParameters(a=1.0, b=1.0, m=4.0, n1=2.0, n2=2.0, n3=2.0)
    theta, rho, x, y = svc.generate_curve(p)

    assert len(theta) == 8000
    assert len(rho) == len(x) == len(y) == 8000
    assert np.isfinite(rho).all()
    assert np.isfinite(x).all()
    assert np.isfinite(y).all()


@pytest.mark.parametrize(
    "m,a,b,n2,n3,expected",
    [
        (4.0, 1.0, 1.0, 2.0, 2.0, 2),
        (3.0, 1.0, 1.0, 2.0, 2.0, 2),
        (1.5, 1.0, 1.0, 2.0, 2.0, 4),
        (3.0, 2.0, 1.0, 2.0, 2.0, 4),
    ],
)
def test_period_multiplier(m, a, b, n2, n3, expected):
    assert GielisGeometryService.period_multiplier(m, a, b, n2, n3) == expected


def test_gielis_formula_matches_direct_numpy_reference():
    svc = GielisGeometryService(n_curve_points=8000)
    p = GielisParameters(a=1.2, b=0.8, m=3.0, n1=2.0, n2=2.5, n3=1.7)
    theta, rho, x, y = svc.generate_curve(p)

    theta_ref = np.linspace(0.0, 4.0 * np.pi, 8000)
    rho_ref = (
        np.abs(np.cos(p.m * theta_ref / 4.0) / p.a) ** p.n2
        + np.abs(np.sin(p.m * theta_ref / 4.0) / p.b) ** p.n3
    ) ** (-1.0 / p.n1)
    x_ref = rho_ref * np.cos(theta_ref)
    y_ref = rho_ref * np.sin(theta_ref)

    np.testing.assert_allclose(theta, theta_ref, rtol=0, atol=0)
    np.testing.assert_allclose(rho, rho_ref, rtol=2e-14, atol=2e-14)
    np.testing.assert_allclose(x, x_ref, rtol=2e-14, atol=2e-14)
    np.testing.assert_allclose(y, y_ref, rtol=2e-14, atol=2e-14)


def test_radial_envelope_is_720_vertices_and_closed():
    svc = GielisGeometryService()
    p = GielisParameters(1.2, 0.8, 3.0, 2.0, 2.5, 1.7)
    _, _, x, y = svc.generate_curve(p)
    contour, poly = svc.radial_outer_envelope(x, y)

    assert contour.shape[1] == 2
    assert len(contour) == 721
    np.testing.assert_allclose(contour[0], contour[-1], atol=1e-12)
    assert poly.is_valid
    assert poly.area > 0


@pytest.mark.parametrize(
    "m,expected",
    [
        (8.0, (8, 1)),
        (3.4, (17, 5)),
        (2.5, (5, 2)),
        (1 / 3, (1, 3)),
        # MATLAB rat(3.14159) = 355/113; Fraction.limit_denominator() gave 314159/100000.
        (3.14159, (355, 113)),
    ],
)
def test_matlab_rat_matches_matlab(m, expected):
    assert GielisGeometryService.matlab_rat(m) == expected


def test_period_multiplier_uses_matlab_rat_for_long_decimals():
    # n = 355 (odd), a != b -> u = 4*d = 4*113 = 452, as in MATLAB.
    assert GielisGeometryService.period_multiplier(3.14159, 2.0, 1.0, 2.0, 2.0) == 452


def test_radial_envelope_uses_bin_centers_like_matlab():
    # GielisMetaCST.mlapp: phiGrid = 0.5*(edges(1:end-1) + edges(2:end)).
    # With 720 bins the first vertex must sit at half a bin: pi/720 rad.
    svc = GielisGeometryService()
    p = GielisParameters(a=1.0, b=1.0, m=4.0, n1=2.0, n2=2.0, n3=2.0)
    _, _, x, y = svc.generate_curve(p)
    ring, _ = svc.radial_outer_envelope(x, y)
    first_angle = np.arctan2(ring[0, 1], ring[0, 0])
    assert np.isclose(first_angle, np.pi / 720, atol=1e-12)
