"""
Quién hace la simulación.

El servidor no sabe si detrás hay CST o no: solo llama a `simulator.run(case,
progress)`. Hoy existe `MockSimulator`, que construye la geometría de verdad y
devuelve curvas de PRUEBA. Cuando el adaptador de CST esté listo, será otra
clase con el mismo método `run`, y nada más del servidor ni del front cambia.
"""
from __future__ import annotations

import time
from typing import Callable, Protocol

import numpy as np

from .geometry import build_case_geometry, perimeter
from .results import absorption, db, find_resonances
from .schemas import CaseRequest, SimulationResult

# Velocidad de la luz en mm·GHz (c = 299 792 458 m/s).
C_MM_GHZ = 299.792458


class Cancelled(Exception):
    """El usuario pidió cancelar; el simulador deja de trabajar."""


class Progress(Protocol):
    def __call__(self, stage: str, message: str, progress: float | None = None) -> None:
        """Informa en qué va. Lanza `Cancelled` si el usuario canceló."""


class Simulator(Protocol):
    name: str

    def run(self, case: CaseRequest, progress: Progress) -> SimulationResult: ...


class MockSimulator:
    """
    Simulador de PRUEBA: las curvas NO son de CST.

    La geometría sí es real (la misma que irá a CST). Las resonancias se
    estiman con una fórmula de anillo resonante, f ≈ c / (P·√εef), donde P es
    el perímetro del anillo y εef = (εr + 1)/2 (con 2·P en los anillos abiertos
    del sensor). Sirve para que el front tenga
    curvas con la forma correcta mientras no hay CST; no para sacar
    conclusiones.
    """

    name = "mock"

    def __init__(self, step_delay: float = 0.25, points: int = 1001,
                 sleep: Callable[[float], None] = time.sleep) -> None:
        self.step_delay = step_delay
        self.points = points
        self._sleep = sleep

    def run(self, case: CaseRequest, progress: Progress) -> SimulationResult:
        progress("building", "Construyendo la geometría")
        geometry = build_case_geometry(case)
        self._sleep(self.step_delay * 4)

        steps = 20
        for k in range(steps):
            progress("simulating", "Simulando (datos de prueba)", 100 * k / steps)
            self._sleep(self.step_delay)
        progress("simulating", "Simulando (datos de prueba)", 100)

        f = np.linspace(case.frequency.min_ghz, case.frequency.max_ghz, self.points)
        eps_eff = (case.substrate.eps_r + 1) / 2
        # Un pico por anillo: el exterior (C1) resuena más abajo que el interior (C3).
        # Un anillo cerrado resuena cuando su perímetro es una longitud de onda;
        # los del sensor están abiertos por un puente y resuenan a media onda.
        waves = 2 if case.mode == "sensor" else 1
        f1 = C_MM_GHZ / (waves * perimeter(geometry.c1) * np.sqrt(eps_eff))
        f2 = C_MM_GHZ / (waves * perimeter(geometry.c3) * np.sqrt(eps_eff))
        l1, l2 = _lorentz(f, f1, 25), _lorentz(f, f2, 30)

        s21_db = None
        if case.mode == "absorber":
            s11 = np.clip(1 - 0.88 * l1 - 0.7 * l2, 0.01, 1)
            s11_db = db(s11)
        else:
            if case.mode == "transmitter" and case.structure_type == "complementary":
                s21 = 0.03 + 0.96 * np.maximum(l1, l2)  # bandas que pasan
            else:  # transmisor normal y sensor: bandas rechazadas
                depth = 0.995 if case.mode == "transmitter" else 0.9
                s21 = np.clip(1 - depth * l1 - depth * l2, 0.002, 1)
            # Conservación de energía: |S11|² + |S21|² + pérdidas = 1, con un
            # piso de reflexión de −25 dB lejos de las resonancias.
            loss = 0.05 * (l1 + l2)
            s11_sq = np.maximum(1 - s21**2 - loss, 10 ** (-25 / 10))
            s21 = np.sqrt(np.clip(1 - s11_sq - loss, 0, 1))
            s11_db, s21_db = db(np.sqrt(s11_sq)), db(s21)

        a = None if case.mode == "sensor" else absorption(s11_db, s21_db)
        return SimulationResult(
            simulator="mock",
            frequency_ghz=_rounded(f, 5),
            s11_db=_rounded(s11_db, 3),
            s21_db=None if s21_db is None else _rounded(s21_db, 3),
            absorption=None if a is None else _rounded(a, 4),
            resonances=find_resonances(case.mode, case.structure_type, f, s11_db, s21_db, a),
            notes=[
                "Datos de PRUEBA: la geometría es real, pero las curvas son una "
                "estimación, no una simulación de CST.",
            ],
        )


def _lorentz(f: np.ndarray, f0: float, q: float) -> np.ndarray:
    return 1 / (1 + (2 * q * (f - f0) / f0) ** 2)


def _rounded(values: np.ndarray, digits: int) -> list[float]:
    return [round(float(v), digits) for v in values]
