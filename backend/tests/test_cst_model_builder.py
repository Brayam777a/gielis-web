"""Pruebas unitarias para `gielis_api.cst.model_builder` sin requerir CST instalado."""
from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np
import pytest

from gielis_api.cst import CSTModelBuilder
from gielis_api.geometry import build_case_geometry
from gielis_api.schemas import CaseRequest

CASES = json.loads((Path(__file__).parent / "data" / "front_cases.json").read_text(encoding="utf-8"))


class _FakeModel3D:
    def __init__(self) -> None:
        self.history: list[tuple[str, str]] = []

    def add_to_history(self, title: str, vba: str) -> None:
        self.history.append((title, vba))


class _FakeProject:
    def __init__(self) -> None:
        self.model3d = _FakeModel3D()


def _absorber_case(
    loss_tangent: float = 0.02,
    structure_type: str = "normal",
    metal: str = "Copper (annealed)",
    field_monitors: dict | None = None,
) -> CaseRequest:
    payload = copy.deepcopy(CASES["absorber"])
    payload["substrate"]["loss_tangent"] = loss_tangent
    payload["structure_type"] = structure_type
    payload["metal"]["material"] = metal
    payload["field_monitors"] = field_monitors
    return CaseRequest.model_validate(payload)


def test_build_absorber_reference_records_expected_history_in_order() -> None:
    case = _absorber_case(loss_tangent=0.02)
    geometry = build_case_geometry(case)
    project = _FakeProject()

    CSTModelBuilder(project).build_absorber(case, geometry)

    expected_titles = [
        "Gielis: define units",
        "Gielis: define vacuum background",
        "Gielis: material Gielis_Dielectric",
        "Gielis: material Gielis_Copper",
        "Gielis: create brick Gielis_Substrate",
        "Gielis: create brick Gielis_Ground",
        "Gielis: extrude polygon Ring1_Outer",
        "Gielis: extrude polygon Ring1_Inner",
        "Gielis: subtract Ring1_Inner from Ring1_Outer",
        "Gielis: extrude polygon Ring2_Outer",
        "Gielis: extrude polygon Ring2_Inner",
        "Gielis: subtract Ring2_Inner from Ring2_Outer",
    ]
    assert [title for title, _ in project.model3d.history] == expected_titles

    vba_by_title = dict(project.model3d.history)

    units_vba = vba_by_title["Gielis: define units"]
    assert '.Geometry "mm"' in units_vba
    assert '.Frequency "GHz"' in units_vba
    assert '.Time "ns"' in units_vba

    dielectric_vba = vba_by_title["Gielis: material Gielis_Dielectric"]
    assert '.Epsilon "4.3"' in dielectric_vba
    assert '.TanD "0.02"' in dielectric_vba
    assert '.TanDGiven "True"' in dielectric_vba

    copper_vba = vba_by_title["Gielis: material Gielis_Copper"]
    assert '.Type "Lossy metal"' in copper_vba
    assert '.Type "Normal"' not in copper_vba
    assert '.Mu "1"' in copper_vba
    assert '.Sigma "58000000"' in copper_vba

    substrate_vba = vba_by_title["Gielis: create brick Gielis_Substrate"]
    assert '.Zrange "0", "1.6"' in substrate_vba

    ground_vba = vba_by_title["Gielis: create brick Gielis_Ground"]
    assert '.Zrange "-0.035", "0"' in ground_vba

    assert (
        vba_by_title["Gielis: subtract Ring1_Inner from Ring1_Outer"]
        == 'Solid.Subtract "Gielis:Ring1_Outer", "Gielis:Ring1_Inner"'
    )
    assert (
        vba_by_title["Gielis: subtract Ring2_Inner from Ring2_Outer"]
        == 'Solid.Subtract "Gielis:Ring2_Outer", "Gielis:Ring2_Inner"'
    )


@pytest.mark.parametrize("loss_tangent", [0.02, 0.027])
def test_build_absorber_propagates_loss_tangent(loss_tangent: float) -> None:
    case = _absorber_case(loss_tangent=loss_tangent)
    geometry = build_case_geometry(case)
    project = _FakeProject()

    CSTModelBuilder(project).build_absorber(case, geometry)

    vba_by_title = dict(project.model3d.history)
    dielectric_vba = vba_by_title["Gielis: material Gielis_Dielectric"]
    assert f'.TanD "{loss_tangent}"' in dielectric_vba
    assert '.TanDGiven "True"' in dielectric_vba


@pytest.mark.parametrize("case_key", ["transmitter", "sensor"])
def test_build_absorber_rejects_non_absorber_modes(case_key: str) -> None:
    case = CaseRequest.model_validate(CASES[case_key])
    geometry = build_case_geometry(case)
    builder = CSTModelBuilder(_FakeProject())

    with pytest.raises(ValueError, match="absorber"):
        builder.build_absorber(case, geometry)


def test_build_absorber_rejects_complementary_structure() -> None:
    case = _absorber_case(structure_type="complementary")
    geometry = build_case_geometry(case)
    builder = CSTModelBuilder(_FakeProject())

    with pytest.raises(ValueError, match="normal"):
        builder.build_absorber(case, geometry)


def test_defensive_validations() -> None:
    builder = CSTModelBuilder(_FakeProject())

    with pytest.raises(ValueError, match="Dimensiones no positivas"):
        builder.add_brick("BadBrick", "Gielis_Dielectric", (1.0, 1.0), (-1.0, 1.0), (0.0, 1.0))

    with pytest.raises(ValueError, match="no finitas"):
        builder.add_polygon(
            "NanPoly",
            np.array([[0.0, 0.0], [1.0, np.nan], [0.0, 1.0]]),
            0.0,
            0.035,
            "Gielis_Copper",
        )

    with pytest.raises(ValueError, match="no finitas"):
        builder.add_polygon(
            "InfPoly",
            np.array([[0.0, 0.0], [np.inf, 0.0], [0.0, 1.0]]),
            0.0,
            0.035,
            "Gielis_Copper",
        )

    with pytest.raises(ValueError, match="Propiedades de material no válidas"):
        builder.define_normal_material("BadEps", eps_r=0.5, loss_tangent=0.02)

    with pytest.raises(ValueError, match="Propiedades de material no válidas"):
        builder.define_normal_material("BadTanD", eps_r=4.3, loss_tangent=-0.01)

    with pytest.raises(ValueError, match="Propiedades de material no válidas"):
        builder.define_normal_material("BadSigma", eps_r=1.0, loss_tangent=0.0, conductivity=-1.0)

    with pytest.raises(ValueError, match="Propiedades de metal con pérdidas no válidas"):
        builder.define_lossy_metal("BadLossy", conductivity=0.0)


def test_build_absorber_with_pec_skips_copper_material() -> None:
    case = _absorber_case(metal="PEC")
    geometry = build_case_geometry(case)
    project = _FakeProject()

    CSTModelBuilder(project).build_absorber(case, geometry)

    titles = [title for title, _ in project.model3d.history]
    assert "Gielis: material Gielis_Copper" not in titles
    vba_by_title = dict(project.model3d.history)
    assert '.Material "PEC"' in vba_by_title["Gielis: create brick Gielis_Ground"]
    assert '.Material "PEC"' in vba_by_title["Gielis: extrude polygon Ring1_Outer"]
    assert '.Material "PEC"' in vba_by_title["Gielis: extrude polygon Ring2_Outer"]


@pytest.mark.parametrize(
    ("monitors", "expected_monitor_titles"),
    [
        (None, []),
        ({"fields": "E", "freq_ghz": 2.435}, ["define field monitor: e-field (f=2.435)"]),
        (
            {"fields": "EH", "freq_ghz": 2.435},
            [
                "define field monitor: e-field (f=2.435)",
                "define field monitor: h-field (f=2.435)",
            ],
        ),
    ],
)
def test_setup_absorber_simulation_configures_solver_boundaries_floquet_and_monitors(
    monitors: dict | None,
    expected_monitor_titles: list[str],
) -> None:
    case = _absorber_case(field_monitors=monitors)
    project = _FakeProject()

    CSTModelBuilder(project).setup_absorber_simulation(case)

    titles = [title for title, _ in project.model3d.history]
    assert titles[:4] == [
        "change solver type",
        "SetFrequency",
        "define boundaries",
        "define Floquet Port boundaries",
    ]
    assert titles[4:] == expected_monitor_titles

    vba_by_title = dict(project.model3d.history)
    assert vba_by_title["change solver type"] == 'ChangeSolverType "HF Frequency Domain"'
    assert vba_by_title["SetFrequency"] == 'Solver.FrequencyRange "1", "8"'
    assert '.Xmin "unit cell"' in vba_by_title["define boundaries"]
    assert '.Zmax "expanded open"' in vba_by_title["define boundaries"]
    assert '.Port "Zmin"' in vba_by_title["define Floquet Port boundaries"]
    assert '.Port "Zmax"' in vba_by_title["define Floquet Port boundaries"]
    assert '.SetNumberOfModesConsidered "2"' in vba_by_title["define Floquet Port boundaries"]

    if monitors is not None:
        e_vba = vba_by_title["define field monitor: e-field (f=2.435)"]
        assert '.FieldType "Efield"' in e_vba
        assert '.Frequency "2.435"' in e_vba
    if monitors is not None and monitors["fields"] == "EH":
        h_vba = vba_by_title["define field monitor: h-field (f=2.435)"]
        assert '.FieldType "Hfield"' in h_vba
        assert '.Frequency "2.435"' in h_vba
