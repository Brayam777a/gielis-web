"""Comprobador de entorno y requisitos para Gielis Web.

Uso:
    python backend/check_env.py
    python backend/check_env.py --json
"""
from __future__ import annotations

import argparse
import importlib
import importlib.metadata
import importlib.util
import json
import os
import socket
import sys
from pathlib import Path
from typing import Any

DEFAULT_CST_LIBS = Path(r"C:\Program Files (x86)\CST Studio Suite 2025\AMD64\python_cst_libraries")
REQUIRED_PACKAGES = ("numpy", "shapely", "fastapi", "uvicorn", "pydantic")


def _package_version(name: str) -> str | None:
    if importlib.util.find_spec(name) is None:
        return None
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return "instalado"


def _check_cst(cst_libs: Path) -> tuple[str, str, bool]:
    """Comprueba si las librerías Python de CST están disponibles."""
    added = False
    path_str = str(cst_libs)
    if cst_libs.is_dir() and path_str not in sys.path:
        sys.path.insert(0, path_str)
        added = True
    try:
        has_pkg = importlib.util.find_spec("cst") is not None
        has_iface = has_pkg and importlib.util.find_spec("cst.interface") is not None
        has_results = has_pkg and importlib.util.find_spec("cst.results") is not None
        if has_iface and has_results:
            importlib.import_module("cst.interface")
            importlib.import_module("cst.results")
            location = path_str if cst_libs.is_dir() else "PYTHONPATH"
            return "ok", f"CST Python disponible ({location})", True
    except Exception as exc:
        return "warn", f"Librerías CST encontradas pero falló al importar: {exc}", False
    finally:
        if added and path_str in sys.path:
            sys.path.remove(path_str)

    if cst_libs.is_dir():
        return "warn", f"Carpeta CST existe ({cst_libs}), pero faltan cst.interface / cst.results.", False
    return "warn", f"CST 2025 no detectado en {cst_libs}; usa modo mock o pasa PYTHONPATH.", False


def _port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.15)
        return sock.connect_ex((host, port)) == 0


def inspect_environment(
    repo_root: Path | None = None,
    cst_libs: Path | None = None,
    port: int = 8000,
) -> dict[str, Any]:
    root = repo_root or Path(__file__).resolve().parents[1]
    cst_path = cst_libs or Path(os.environ.get("GIELIS_CST_LIBS") or DEFAULT_CST_LIBS)

    checks: list[dict[str, str]] = []

    py_ver = sys.version_info
    py_ok = py_ver >= (3, 10)
    checks.append({
        "name": "python",
        "status": "ok" if py_ok else "fail",
        "detail": f"Python {py_ver.major}.{py_ver.minor}.{py_ver.micro} ({sys.executable})",
    })

    for pkg in REQUIRED_PACKAGES:
        ver = _package_version(pkg)
        checks.append({
            "name": f"pkg:{pkg}",
            "status": "ok" if ver else "fail",
            "detail": f"{pkg} {ver}" if ver else f"Falta el paquete '{pkg}' (pip install -e '.[api,test]')",
        })

    dist_index = root / "frontend" / "dist" / "index.html"
    checks.append({
        "name": "frontend_dist",
        "status": "ok" if dist_index.is_file() else "warn",
        "detail": (
            f"Bundle listo en {dist_index}"
            if dist_index.is_file()
            else "Falta frontend/dist/index.html; ejecuta 'npm --prefix frontend run build' para servir /app/"
        ),
    })

    cst_status, cst_detail, cst_ready = _check_cst(cst_path)
    checks.append({
        "name": "cst_2025",
        "status": cst_status,
        "detail": cst_detail,
    })

    busy = _port_in_use(port)
    checks.append({
        "name": f"port_{port}",
        "status": "warn" if busy else "ok",
        "detail": f"Puerto {port} ocupado (ya hay un servidor activo)" if busy else f"Puerto {port} libre",
    })

    required_ok = all(c["status"] != "fail" for c in checks)
    return {
        "ok": required_ok,
        "recommended_mode": "cst" if cst_ready else "mock",
        "cst_ready": cst_ready,
        "checks": checks,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verifica dependencias y estado de Gielis Web.")
    parser.add_argument("--json", action="store_true", help="Imprime el diagnóstico en JSON.")
    parser.add_argument("--cst-path", type=Path, default=None, help="Ruta a python_cst_libraries.")
    parser.add_argument("--port", type=int, default=8000, help="Puerto TCP a comprobar (por defecto 8000).")
    args = parser.parse_args(argv)

    report = inspect_environment(cst_libs=args.cst_path, port=args.port)
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=True))
    else:
        labels = {"ok": "[OK]  ", "warn": "[AVISO]", "fail": "[ERROR]"}
        print("Diagnostico de Gielis Web")
        print("-" * 60)
        for item in report["checks"]:
            print(f"{labels[item['status']]} {item['name']:<15} {item['detail']}")
        print("-" * 60)
        print(f"Modo recomendado: {report['recommended_mode']}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
