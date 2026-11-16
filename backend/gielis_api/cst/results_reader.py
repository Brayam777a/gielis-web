"""Lectura de curvas 1D desde el árbol de resultados `cst.results`."""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import numpy as np

ABSORBER_COPOL_CANDIDATES: tuple[str, ...] = (
    "SZmax(1),Zmax(1)",
    "SZmax(1)Zmax(1)",
    "SZmax,Zmax",
    "S1,1",
    "S11",
)
ABSORBER_CROSSPOL_CANDIDATES: tuple[str, ...] = (
    "SZmax(2),Zmax(1)",
    "SZmax(2)Zmax(1)",
)

_S_PREFIXES = ("1D Results\\S-Parameters\\", "1D Results/S-Parameters/")
_EXCLUDED_SEGMENTS = ("Adaptive Meshing", "Convergence")


def _short_name(tree_path: str) -> str:
    return tree_path.replace("/", "\\").rsplit("\\", 1)[-1]


def list_sparameter_paths(tree_items: Sequence[str]) -> list[str]:
    """Devuelve rutas directas de parámetros S, excluyendo malla adaptativa y convergencia."""
    paths: list[str] = []
    for raw in tree_items:
        item = str(raw)
        if not item.startswith(_S_PREFIXES):
            continue
        if any(seg in item for seg in _EXCLUDED_SEGMENTS):
            continue
        paths.append(item)
    return paths


def _extract_xy(item: Any) -> tuple[np.ndarray, np.ndarray] | None:
    if item is None:
        return None
    x = np.asarray(item.get_xdata(), dtype=float).reshape(-1)
    y = np.asarray(item.get_ydata(), dtype=complex).reshape(-1)
    if len(x) == 0 or len(x) != len(y):
        return None
    if not (np.isfinite(x).all() and np.isfinite(y.real).all() and np.isfinite(y.imag).all()):
        return None
    return x, y


def read_1d_complex_curve(results_3d: Any, tree_path: str) -> tuple[np.ndarray, np.ndarray] | None:
    """Lee una curva 1D compleja; hace fallback por `get_run_ids` si el acceso directo falla."""
    try:
        curve = _extract_xy(results_3d.get_result_item(tree_path))
        if curve is not None:
            return curve
    except Exception:
        pass

    if not hasattr(results_3d, "get_run_ids"):
        return None

    try:
        raw_ids = list(results_3d.get_run_ids(tree_path))
    except Exception:
        raw_ids = []

    run_ids: list[Any] = list(reversed(raw_ids))
    if 0 not in run_ids:
        run_ids.append(0)

    for run_id in run_ids:
        try:
            curve = _extract_xy(results_3d.get_result_item(tree_path, run_id))
            if curve is not None:
                return curve
        except Exception:
            continue

    return None


def find_first_sparameter(
    results_3d: Any,
    candidates: Sequence[str],
    tree_items: Sequence[str] | None = None,
) -> tuple[str, np.ndarray, np.ndarray] | None:
    """Busca el primer parámetro S disponible según el orden de prioridad de `candidates`."""
    s_paths = list_sparameter_paths(tree_items) if tree_items is not None else []
    by_lower: dict[str, str] = {}
    for path in s_paths:
        by_lower.setdefault(_short_name(path).lower(), path)

    for cand in candidates:
        tried: list[str] = []
        matched = by_lower.get(cand.lower())
        if matched is not None:
            tried.append(matched)
        direct = f"1D Results\\S-Parameters\\{cand}"
        if direct not in tried:
            tried.append(direct)

        for path in tried:
            curve = read_1d_complex_curve(results_3d, path)
            if curve is not None:
                return _short_name(path), curve[0], curve[1]

    return None
