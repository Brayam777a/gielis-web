from __future__ import annotations

from dataclasses import dataclass
import math
from math import pi
from typing import Literal

import numpy as np
from shapely.geometry import Polygon, MultiPolygon, GeometryCollection
from shapely.validation import explain_validity


Array = np.ndarray


@dataclass(frozen=True)
class GielisParameters:
    a: float
    b: float
    m: float
    n1: float
    n2: float
    n3: float


@dataclass(frozen=True)
class ConcentricParameters:
    size1: float = 1.0
    size2: float = 0.7
    gap_mm: float = 0.10
    rotation_deg: float = 0.0
    dx_mm: float = 0.0
    dy_mm: float = 0.0


@dataclass(frozen=True)
class StructureGeometry:
    c1: Array
    c2: Array
    c3: Array
    c4: Array
    ring1: Polygon | MultiPolygon | GeometryCollection
    ring2: Polygon | MultiPolygon | GeometryCollection
    normal: Polygon | MultiPolygon | GeometryCollection
    complementary: Polygon | MultiPolygon | GeometryCollection


@dataclass(frozen=True)
class SensorCSRRGeometry:
    ring1_slot: Polygon | MultiPolygon | GeometryCollection
    ring2_slot: Polygon | MultiPolygon | GeometryCollection
    bridge1: Polygon
    bridge2: Polygon
    sensor_cutters: Polygon | MultiPolygon | GeometryCollection


class GeometryValidationError(ValueError):
    pass


class GielisGeometryService:
    """
    Reimplementation of the geometry logic extracted from GielisMetaCST.mlapp.

    Important source semantics:
      * The Gielis curve is generated with 8000 samples.
      * CST does not receive that raw curve. It receives a radial outer envelope
        using 720 angular bins and a circular moving-average window of 5.
      * The concentric-ring controls use a physical gap in mm.
      * Sensor geometry is complementary and contains two CSRR slots plus
        local split bridges.
    """

    def __init__(self, *, n_curve_points: int = 8000,
                 envelope_angles: int = 720,
                 envelope_smoothing: int = 5) -> None:
        self.n_curve_points = int(n_curve_points)
        self.envelope_angles = int(envelope_angles)
        self.envelope_smoothing = int(envelope_smoothing)

    # ------------------------------------------------------------------
    # Gielis
    # ------------------------------------------------------------------

    @staticmethod
    def matlab_rat(x: float, tol: float | None = None) -> tuple[int, int]:
        """
        Port of MATLAB rat() for a scalar: continued-fraction expansion using
        round(), with MATLAB's default tolerance 1e-6*|x|. Returns (n, d), d > 0.

        fractions.Fraction.limit_denominator() is NOT equivalent: for
        m = 3.14159 it returns 314159/100000, while MATLAB returns 355/113.
        """
        x = float(x)
        if not math.isfinite(x):
            raise GeometryValidationError("m must be a finite number.")
        if tol is None:
            tol = 1e-6 * abs(x)
        if x == 0:
            return 0, 1
        def mround(v: float) -> int:
            # MATLAB round(): halves go away from zero (Python's round() goes to even).
            return int(math.copysign(math.floor(abs(v) + 0.5), v))

        lastn, lastd = 1, 0
        n, d = mround(x), 1
        frac = x - mround(x)
        while abs(x - n / d) >= tol:
            flip = 1.0 / frac
            step = mround(flip)
            frac = flip - step
            n, lastn = n * step + lastn, n
            d, lastd = d * step + lastd, d
        if d < 0:
            n, d = -n, -d
        return int(n), int(d)

    @staticmethod
    def period_multiplier(m: float, a: float, b: float, n2: float, n3: float) -> int:
        """
        MATLAB:
            [n,d] = rat(m);
            if mod(n,2)==0 || (a==b && n2==n3), u=2*d; else u=4*d; end
        """
        n, d = GielisGeometryService.matlab_rat(m)
        return 2 * d if (n % 2 == 0 or (a == b and n2 == n3)) else 4 * d

    def generate_curve(self, params: GielisParameters) -> tuple[Array, Array, Array, Array]:
        p = params
        if p.a == 0 or p.b == 0 or p.n1 == 0:
            raise GeometryValidationError("a, b and n1 must be non-zero.")

        u = self.period_multiplier(p.m, p.a, p.b, p.n2, p.n3)
        theta = np.linspace(0.0, u * pi, self.n_curve_points)

        rho = (
            np.abs(np.cos(p.m * theta / 4.0) / p.a) ** p.n2
            + np.abs(np.sin(p.m * theta / 4.0) / p.b) ** p.n3
        ) ** (-1.0 / p.n1)

        if not np.all(np.isfinite(rho)):
            raise GeometryValidationError("The Gielis radius contains non-finite values.")

        x = rho * np.cos(theta)
        y = rho * np.sin(theta)
        return theta, rho, x, y

    # ------------------------------------------------------------------
    # MATLAB-compatible radial outer envelope
    # ------------------------------------------------------------------

    @staticmethod
    def _circular_interp_missing(rmax: Array) -> Array:
        n = len(rmax)
        valid = np.flatnonzero(~np.isnan(rmax))
        if len(valid) < 3:
            raise GeometryValidationError("At least three populated angular bins are required.")

        # MATLAB:
        # idxExt = [idxValid-nAng; idxValid; idxValid+nAng]
        # interp1(..., 'linear')
        idx_ext = np.concatenate((valid - n, valid, valid + n)).astype(float)
        r_ext = np.concatenate((rmax[valid], rmax[valid], rmax[valid]))
        idx_all = np.arange(n, dtype=float)

        filled = np.interp(idx_all, idx_ext, r_ext, left=np.nan, right=np.nan)
        if np.any(np.isnan(filled)):
            # MATLAB fallback is nearest + extrapolation. This path should only
            # be reached for pathological distributions; fill by circular
            # nearest valid sample.
            for i in np.flatnonzero(np.isnan(filled)):
                dist = np.minimum(np.abs(valid - i), n - np.abs(valid - i))
                filled[i] = rmax[valid[np.argmin(dist)]]
        return filled

    @staticmethod
    def _circular_mean_filter(values: Array, window: int) -> Array:
        if window <= 1:
            return values.copy()
        pad = window // 2
        padded = np.concatenate((values[-pad:], values, values[:pad]))
        kernel = np.ones(window, dtype=float) / window
        conv = np.convolve(padded, kernel, mode="same")
        return conv[pad:pad + len(values)]

    def radial_outer_envelope(
        self,
        x: Array,
        y: Array,
        *,
        n_angles: int | None = None,
        smooth_window: int | None = None,
    ) -> tuple[Array, Polygon]:
        x = np.asarray(x, dtype=float).reshape(-1)
        y = np.asarray(y, dtype=float).reshape(-1)

        valid = np.isfinite(x) & np.isfinite(y)
        x, y = x[valid], y[valid]
        if len(x) < 3:
            raise GeometryValidationError("At least three finite curve points are required.")

        n_ang = self.envelope_angles if n_angles is None else max(90, round(n_angles))
        smooth = self.envelope_smoothing if smooth_window is None else max(1, round(smooth_window))
        if smooth % 2 == 0:
            smooth += 1

        phi = np.mod(np.arctan2(y, x), 2.0 * pi)
        r = np.hypot(x, y)

        # Equivalent to MATLAB histcounts(phi, linspace(0,2*pi,nAng+1)).
        edges = np.linspace(0.0, 2.0 * pi, n_ang + 1)
        bin_idx = np.searchsorted(edges, phi, side="right") - 1
        bin_idx[phi == 2.0 * pi] = n_ang - 1
        in_bin = (bin_idx >= 0) & (bin_idx < n_ang) & np.isfinite(r)

        rmax = np.full(n_ang, np.nan, dtype=float)
        for k in np.unique(bin_idx[in_bin]):
            rmax[k] = np.max(r[in_bin & (bin_idx == k)])

        r_filled = self._circular_interp_missing(rmax)
        r_smooth = self._circular_mean_filter(r_filled, smooth)

        # MATLAB (getRadialOuterEnvelope) places each vertex at the CENTER of
        # its angular bin: phiGrid = 0.5*(edges(1:end-1) + edges(2:end)).
        # Using the bin start instead rotates the whole contour by half a bin
        # (0.25 deg with 720 bins); areas stay the same but coordinates do not.
        theta = 0.5 * (edges[:-1] + edges[1:])
        xe = r_smooth * np.cos(theta)
        ye = r_smooth * np.sin(theta)

        coords = np.column_stack((xe, ye))
        coords = np.vstack((coords, coords[0]))

        poly = Polygon(coords)
        if not poly.is_valid:
            # MATLAB polyshape(..., Simplify=true) repairs many common
            # self-intersections. buffer(0) is the conservative Shapely
            # equivalent used only as a validity normalization.
            poly = poly.buffer(0)

        if poly.is_empty or poly.area <= 0:
            raise GeometryValidationError("A valid radial envelope could not be generated.")

        # MATLAB extracts a single boundary; for CST we choose the largest
        # polygon if a pathological multi-part result occurs.
        if isinstance(poly, MultiPolygon):
            poly = max(poly.geoms, key=lambda g: g.area)

        ring = np.asarray(poly.exterior.coords, dtype=float)
        return ring, poly

    def generate_cst_contour(self, params: GielisParameters) -> tuple[Array, Polygon]:
        _, _, x, y = self.generate_curve(params)
        return self.radial_outer_envelope(x, y)

    # ------------------------------------------------------------------
    # Basic contour operations
    # ------------------------------------------------------------------

    @staticmethod
    def prepare_cst_polygon(contour: Array) -> Array:
        c = np.asarray(contour, dtype=float)
        if c.ndim != 2 or c.shape[1] < 2:
            raise GeometryValidationError("Contour must be an Nx2 array.")
        c = c[:, :2]
        c = c[np.isfinite(c).all(axis=1)]
        if len(c) < 3:
            raise GeometryValidationError("Contour must contain at least three points.")

        d = np.linalg.norm(np.diff(c, axis=0), axis=1)
        c = c[np.r_[True, d > 1e-9]]
        if len(c) < 3:
            raise GeometryValidationError("Contour collapsed after duplicate removal.")

        if np.linalg.norm(c[0] - c[-1]) < 1e-9:
            c = c[:-1]
        if len(c) < 3:
            raise GeometryValidationError("Contour must contain at least three unique points.")
        return c

    @staticmethod
    def scale_contour(contour: Array, scale: float) -> Array:
        return np.asarray(contour, dtype=float) * float(scale)

    @staticmethod
    def rotate_contour(contour: Array, angle_deg: float) -> Array:
        theta = np.deg2rad(float(angle_deg))
        c, s = np.cos(theta), np.sin(theta)
        r = np.array([[c, -s], [s, c]])
        return np.asarray(contour, dtype=float) @ r.T

    @staticmethod
    def translate_contour(contour: Array, dx: float, dy: float) -> Array:
        return np.asarray(contour, dtype=float) + np.array([dx, dy], dtype=float)

    @staticmethod
    def smooth_closed_contour(contour: Array, smooth_window: int, n_iter: int = 1) -> Array:
        c = np.asarray(contour, dtype=float)[:, :2]
        c = c[np.isfinite(c).all(axis=1)]
        if len(c) < 3:
            raise GeometryValidationError("Contour must contain at least three points.")
        if np.linalg.norm(c[0] - c[-1]) < 1e-9:
            c = c[:-1]

        window = max(3, round(smooth_window))
        if window % 2 == 0:
            window += 1
        pad = window // 2
        kernel = np.ones(window) / window
        x, y = c[:, 0].copy(), c[:, 1].copy()

        for _ in range(max(0, int(n_iter))):
            xp = np.concatenate((x[-pad:], x, x[:pad]))
            yp = np.concatenate((y[-pad:], y, y[:pad]))
            x = np.convolve(xp, kernel, mode="valid")
            y = np.convolve(yp, kernel, mode="valid")

        return np.vstack((np.column_stack((x, y)), [x[0], y[0]]))

    # ------------------------------------------------------------------
    # Concentric contours
    # ------------------------------------------------------------------

    def build_concentric(
        self,
        base_contour: Array,
        params: ConcentricParameters,
        *,
        auto_adjust: bool = True,
    ) -> tuple[Array, Array, Array, Array]:
        base = self.prepare_cst_polygon(base_contour)
        rbase = float(np.max(np.hypot(base[:, 0], base[:, 1])))
        if not np.isfinite(rbase) or rbase <= 0:
            raise GeometryValidationError("Base contour has an invalid reference radius.")

        size1 = float(params.size1)
        size2 = float(params.size2)
        g = float(params.gap_mm)
        min_scale = 0.05
        offset_factor = 0.10
        step_size = 0.10

        if size1 <= min_scale:
            size1 = 1.0
        if size2 <= min_scale:
            size2 = 0.7
        if g <= 0:
            g = 0.10

        scale1_outer = size1
        scale1_inner = size1 - g / rbase
        if scale1_inner <= min_scale:
            raise GeometryValidationError("g is too large for Ring 1.")

        inter_ring_offset = offset_factor * g
        max_scale2_outer = scale1_inner - inter_ring_offset / rbase
        min_scale2_outer = min_scale + g / rbase

        if max_scale2_outer <= min_scale2_outer:
            if not auto_adjust:
                raise GeometryValidationError("Ring 2 cannot fit without touching Ring 1.")
            g_max = (size1 - 2 * min_scale) * rbase / (2 + offset_factor)
            g = 0.98 * g_max
            inter_ring_offset = offset_factor * g
            scale1_inner = size1 - g / rbase
            max_scale2_outer = scale1_inner - inter_ring_offset / rbase
            min_scale2_outer = min_scale + g / rbase

        if size2 < min_scale2_outer:
            size2 = np.ceil(min_scale2_outer / step_size) * step_size
            if size2 > max_scale2_outer:
                size2 = min_scale2_outer

        if size2 > max_scale2_outer:
            size2 = np.floor(max_scale2_outer / step_size) * step_size
            if size2 < min_scale2_outer:
                size2 = max_scale2_outer

        scale2_outer = size2
        scale2_inner = size2 - g / rbase

        if scale2_inner <= min_scale:
            size2 = min_scale2_outer
            scale2_outer = size2
            scale2_inner = size2 - g / rbase

        c1 = self.scale_contour(base, scale1_outer)
        c2 = self.scale_contour(base, scale1_inner)
        c3 = self.scale_contour(base, scale2_outer)
        c4 = self.scale_contour(base, scale2_inner)

        angle = params.rotation_deg
        c1 = self.rotate_contour(c1, angle)
        c2 = self.rotate_contour(c2, angle)
        c3 = self.rotate_contour(c3, angle)
        c4 = self.rotate_contour(c4, angle)

        # Source uses dx/dy after the optional Sensor centering operation.
        c1 = self.translate_contour(c1, params.dx_mm, params.dy_mm)
        c2 = self.translate_contour(c2, params.dx_mm, params.dy_mm)
        c3 = self.translate_contour(c3, params.dx_mm, params.dy_mm)
        c4 = self.translate_contour(c4, params.dx_mm, params.dy_mm)

        return c1, c2, c3, c4

    # ------------------------------------------------------------------
    # Normal / Complementary
    # ------------------------------------------------------------------

    @staticmethod
    def polygon_from_contour(contour: Array) -> Polygon:
        c = GielisGeometryService.prepare_cst_polygon(contour)
        p = Polygon(np.vstack((c, c[0])))
        if not p.is_valid:
            p = p.buffer(0)
        if p.is_empty or p.area <= 0:
            raise GeometryValidationError(f"Invalid contour polygon: {explain_validity(p)}")
        return p

    def build_normal_geometry(self, c1: Array, c2: Array, c3: Array, c4: Array) -> StructureGeometry:
        p1, p2, p3, p4 = map(self.polygon_from_contour, (c1, c2, c3, c4))
        ring1 = p1.difference(p2)
        ring2 = p3.difference(p4)
        normal = ring1.union(ring2)
        return StructureGeometry(
            c1, c2, c3, c4,
            ring1, ring2, normal,
            GeometryCollection(),
        )

    def build_complementary_geometry(
        self,
        top_copper: Array,
        c1: Array,
        c2: Array,
        c3: Array,
        c4: Array,
    ) -> Polygon | MultiPolygon | GeometryCollection:
        """
        MATLAB Complementary structure:
            full top copper
              - (C1 - C2)
              - (C3 - C4)

        The top copper polygon is deliberately supplied by the caller because
        it is the substrate-sized rectangle in the application.
        """
        top = self.polygon_from_contour(top_copper)
        p1, p2, p3, p4 = map(self.polygon_from_contour, (c1, c2, c3, c4))
        ring1 = p1.difference(p2)
        ring2 = p3.difference(p4)
        return top.difference(ring1).difference(ring2)

    # ------------------------------------------------------------------
    # Sensor CSRR
    # ------------------------------------------------------------------

    @staticmethod
    def _nearest_angle(theta: Array, target: float) -> int:
        diff = np.arctan2(np.sin(theta - target), np.cos(theta - target))
        return int(np.argmin(np.abs(diff)))

    def _split_bridge(
        self,
        outer: Array,
        inner: Array,
        *,
        target_angle: float,
        g: float,
    ) -> Polygon:
        pout = self.prepare_cst_polygon(outer)
        pin = self.prepare_cst_polygon(inner)

        cx = 0.5 * (np.min(pout[:, 0]) + np.max(pout[:, 0]))
        cy = 0.5 * (np.min(pout[:, 1]) + np.max(pout[:, 1]))

        theta_out = np.arctan2(pout[:, 1] - cy, pout[:, 0] - cx)
        idx_out = self._nearest_angle(theta_out, target_angle)
        p_outer = pout[idx_out]

        theta_target = np.arctan2(p_outer[1] - cy, p_outer[0] - cx)
        theta_in = np.arctan2(pin[:, 1] - cy, pin[:, 0] - cx)
        idx_in = self._nearest_angle(theta_in, theta_target)
        p_inner = pin[idx_in]

        radial = p_outer - p_inner
        radial_length = float(np.linalg.norm(radial))
        if radial_length <= 1e-9:
            raise GeometryValidationError("Invalid split radial length.")

        n = radial / radial_length
        t = np.array([-n[1], n[0]])

        offset = max(0.02, min(0.10 * radial_length, 0.12 * g))
        length = radial_length + 2 * offset
        width = max(0.08, max(0.35 * g, 0.35 * radial_length))
        width = min(width, 0.85 * radial_length)

        center = 0.5 * (p_outer + p_inner)
        bridge = np.array([
            center + 0.5 * width * t + 0.5 * length * n,
            center - 0.5 * width * t + 0.5 * length * n,
            center - 0.5 * width * t - 0.5 * length * n,
            center + 0.5 * width * t - 0.5 * length * n,
            center + 0.5 * width * t + 0.5 * length * n,
        ])
        return Polygon(bridge)

    def build_sensor_csrr(
        self,
        c1: Array,
        c2: Array,
        c3: Array,
        c4: Array,
        *,
        g_mm: float,
    ) -> SensorCSRRGeometry:
        p1, p2, p3, p4 = map(self.polygon_from_contour, (c1, c2, c3, c4))
        ring1 = p1.difference(p2)
        ring2 = p3.difference(p4)

        bridge1 = self._split_bridge(c1, c2, target_angle=pi / 2, g=g_mm)
        bridge2 = self._split_bridge(c3, c4, target_angle=-pi / 2, g=g_mm)

        slot1 = ring1.difference(bridge1)
        slot2 = ring2.difference(bridge2)
        cutters = slot1.union(slot2)

        return SensorCSRRGeometry(
            ring1_slot=slot1,
            ring2_slot=slot2,
            bridge1=bridge1,
            bridge2=bridge2,
            sensor_cutters=cutters,
        )

    # ------------------------------------------------------------------
    # Sensor placement helper
    # ------------------------------------------------------------------

    @staticmethod
    def sensor_centering_translation(
        contours: list[Array],
        dx: float,
        dy: float,
    ) -> tuple[float, float]:
        all_xy = np.vstack([np.asarray(c)[:, :2] for c in contours])
        cx = 0.5 * (np.min(all_xy[:, 0]) + np.max(all_xy[:, 0]))
        cy = 0.5 * (np.min(all_xy[:, 1]) + np.max(all_xy[:, 1]))
        return -cx + dx, -cy + dy

    @staticmethod
    def validate_sensor_inside_substrate(
        contours: list[Array],
        width_mm: float,
        length_mm: float,
        margin_mm: float = 0.10,
    ) -> None:
        all_xy = np.vstack([np.asarray(c)[:, :2] for c in contours])
        if (
            np.min(all_xy[:, 0]) < -width_mm / 2 + margin_mm
            or np.max(all_xy[:, 0]) > width_mm / 2 - margin_mm
            or np.min(all_xy[:, 1]) < -length_mm / 2 + margin_mm
            or np.max(all_xy[:, 1]) > length_mm / 2 - margin_mm
        ):
            raise GeometryValidationError("Gielis-CSRR is outside the substrate.")
