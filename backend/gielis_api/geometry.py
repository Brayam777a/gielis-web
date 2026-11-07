"""
Del JSON del caso a los contornos que se dibujan en CST.

Usa `gielis_geometry`, que ya está probado contra la app MATLAB. Hace lo mismo
que el front (`frontend/src/lib/design.ts`): curva → envolvente radial →
contornos C1–C4 → centrado del sensor. El simulador de prueba la usa para sus
resonancias, y el adaptador de CST la usará para construir el modelo.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from gielis_geometry import ConcentricParameters, GielisGeometryService, GielisParameters

from .schemas import CaseRequest

_SERVICE = GielisGeometryService()


@dataclass(frozen=True)
class CaseGeometry:
    envelope: np.ndarray  # contorno base que va a CST (sin repetir el primer punto)
    c1: np.ndarray
    c2: np.ndarray
    c3: np.ndarray
    c4: np.ndarray
    substrate: np.ndarray  # rectángulo W × L centrado en el origen

    @property
    def rings(self) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        return self.c1, self.c2, self.c3, self.c4


def perimeter(contour: np.ndarray) -> float:
    """Largo de un contorno cerrado, en mm."""
    closed = np.vstack((contour, contour[:1]))
    return float(np.sum(np.hypot(*np.diff(closed, axis=0).T)))


def area(contour: np.ndarray) -> float:
    """Área de un polígono (fórmula del zapato), en mm²."""
    x, y = contour[:, 0], contour[:, 1]
    return float(abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2)


def build_case_geometry(case: CaseRequest) -> CaseGeometry:
    """
    Lanza `GeometryValidationError` (un ValueError) si la figura no se puede
    construir; el trabajo queda como "falló" con ese mensaje.
    """
    g = case.gielis
    _, _, x, y = _SERVICE.generate_curve(GielisParameters(g.a, g.b, g.m, g.n1, g.n2, g.n3))
    envelope, _ = _SERVICE.radial_outer_envelope(x, y)
    envelope = envelope[:-1]

    c = case.concentric
    is_sensor = case.mode == "sensor"
    params = ConcentricParameters(
        size1=c.size1,
        size2=c.size2,
        gap_mm=c.gap_mm,
        rotation_deg=c.rotation_deg,
        # En el sensor, dx y dy se aplican DESPUÉS de centrar (como la app).
        dx_mm=0.0 if is_sensor else c.dx_mm,
        dy_mm=0.0 if is_sensor else c.dy_mm,
    )
    rings = _SERVICE.build_concentric(envelope, params)
    if is_sensor:
        tx, ty = _SERVICE.sensor_centering_translation(list(rings), c.dx_mm, c.dy_mm)
        rings = tuple(_SERVICE.translate_contour(r, tx, ty) for r in rings)

    w, l = case.substrate.width_mm, case.substrate.length_mm
    substrate = np.array([[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2]])
    return CaseGeometry(envelope, *rings, substrate=substrate)
