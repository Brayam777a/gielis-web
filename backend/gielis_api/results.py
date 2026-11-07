"""
Cálculos sobre los parámetros S: absorción y resonancias.

Sirven igual para las curvas de prueba y para las que devuelva CST, así que
no dependen del simulador.
"""
from __future__ import annotations

import numpy as np

from .schemas import Mode, Resonance


def db(magnitude: np.ndarray) -> np.ndarray:
    """|S| lineal → dB (20·log10). Se pone un piso para no calcular log(0)."""
    return 20 * np.log10(np.maximum(magnitude, 1e-6))


def from_db(values_db: np.ndarray) -> np.ndarray:
    return 10 ** (np.asarray(values_db, dtype=float) / 20)


def absorption(s11_db: np.ndarray, s21_db: np.ndarray | None) -> np.ndarray:
    """
    A = 1 − |S11|² − |S21|².
    En el absorbente hay plano de tierra y no pasa nada al otro lado, así que
    S21 = 0 y queda A = 1 − |S11|².
    """
    a = 1 - from_db(s11_db) ** 2
    if s21_db is not None:
        a = a - from_db(s21_db) ** 2
    return np.clip(a, 0.0, 1.0)


def local_extrema(values: np.ndarray, kind: str) -> np.ndarray:
    """Índices de los mínimos (o máximos) locales de una curva."""
    v = np.asarray(values, dtype=float)
    if kind == "max":
        v = -v
    inner = np.flatnonzero((v[1:-1] < v[:-2]) & (v[1:-1] <= v[2:])) + 1
    return inner


def find_resonances(
    mode: Mode,
    structure_type: str,
    frequency_ghz: np.ndarray,
    s11_db: np.ndarray | None,
    s21_db: np.ndarray | None,
    absorption_values: np.ndarray | None,
) -> list[Resonance]:
    """
    Qué se busca, según lo que reporta el artículo para cada modo:
      - absorbente: mínimos de S11 por debajo de −6 dB (absorción > 75 %);
      - transmisor normal: mínimos de S21 por debajo de −10 dB (banda rechazada);
      - transmisor complementario: máximos de S21 por encima de −3 dB (banda que pasa);
      - sensor: mínimos de S21 por debajo de −3 dB (la frecuencia de resonancia).
    """
    if mode == "absorber":
        parameter, values, kind, limit = "S11", s11_db, "min", -6.0
    elif mode == "transmitter" and structure_type == "complementary":
        parameter, values, kind, limit = "S21", s21_db, "max", -3.0
    elif mode == "transmitter":
        parameter, values, kind, limit = "S21", s21_db, "min", -10.0
    else:
        parameter, values, kind, limit = "S21", s21_db, "min", -3.0
    if values is None:
        return []

    values = np.asarray(values, dtype=float)
    found: list[Resonance] = []
    for i in local_extrema(values, kind):
        if (kind == "min" and values[i] > limit) or (kind == "max" and values[i] < limit):
            continue
        found.append(
            Resonance(
                frequency_ghz=round(float(frequency_ghz[i]), 4),
                parameter=parameter,
                kind=kind,
                value_db=round(float(values[i]), 2),
                absorption_pct=None if absorption_values is None else round(100 * float(absorption_values[i]), 1),
            )
        )
    return found
