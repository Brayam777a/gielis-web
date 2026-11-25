"""Pruebas unitarias para backend/check_env.py."""
from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import check_env  # noqa: E402


def test_inspect_environment_without_cst_recommends_mock(tmp_path: Path) -> None:
    report = check_env.inspect_environment(
        repo_root=tmp_path,
        cst_libs=tmp_path / "no_cst_here",
        port=59991,
    )
    assert report["ok"] is True
    assert report["cst_ready"] is False
    assert report["recommended_mode"] == "mock"
    by_name = {item["name"]: item for item in report["checks"]}
    assert by_name["python"]["status"] == "ok"
    assert by_name["frontend_dist"]["status"] == "warn"


def test_inspect_environment_detects_built_frontend_dist(tmp_path: Path) -> None:
    dist_index = tmp_path / "frontend" / "dist" / "index.html"
    dist_index.parent.mkdir(parents=True)
    dist_index.write_text("<html></html>", encoding="utf-8")

    report = check_env.inspect_environment(
        repo_root=tmp_path,
        cst_libs=tmp_path / "no_cst_here",
        port=59992,
    )
    by_name = {item["name"]: item for item in report["checks"]}
    assert by_name["frontend_dist"]["status"] == "ok"


def test_cli_json_outputs_valid_report(capsys, tmp_path: Path) -> None:
    rc = check_env.main(["--json", "--cst-path", str(tmp_path / "missing"), "--port", "59993"])
    assert rc == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True
    assert payload["recommended_mode"] in ("mock", "cst")
    assert isinstance(payload["checks"], list)
