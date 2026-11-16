"""Construcción física de modelos Gielis en CST Studio Suite."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from ..geometry import CaseGeometry
from ..schemas import CaseRequest


@dataclass(frozen=True)
class CSTModelNames:
    component: str = "Gielis"
    substrate: str = "Gielis_Substrate"
    ground: str = "Gielis_Ground"
    outer_1: str = "Ring1_Outer"
    inner_1: str = "Ring1_Inner"
    outer_2: str = "Ring2_Outer"
    inner_2: str = "Ring2_Inner"


class CSTModelBuilder:
    """Envía operaciones de modelado al historial del proyecto CST."""

    def __init__(self, project: Any) -> None:
        self.project = project
        self.names = CSTModelNames()

    def _history(self, title: str, vba: str) -> None:
        if not vba.strip():
            raise ValueError("No se puede enviar una instrucción CST vacía.")
        self.project.model3d.add_to_history(title, vba)

    @staticmethod
    def _number(value: float) -> str:
        value = float(value)
        if not np.isfinite(value):
            raise ValueError(f"Coordenada no finita: {value}")
        return f"{value:.12g}"

    def define_units(self) -> None:
        self._history(
            "Gielis: define units",
            """
With Units
    .Geometry "mm"
    .Frequency "GHz"
    .Time "ns"
End With
""",
        )

    def define_background(self) -> None:
        self._history(
            "Gielis: define vacuum background",
            """
With Material
    .Reset
    .Type "Normal"
    .Epsilon "1"
    .Mue "1"
    .TanD "0"
    .Colour "0.6", "0.6", "0.6"
    .ChangeBackgroundMaterial
End With
""",
        )

    def define_normal_material(
        self,
        name: str,
        eps_r: float,
        loss_tangent: float,
        conductivity: float = 0.0,
    ) -> None:
        if eps_r < 1 or loss_tangent < 0 or conductivity < 0:
            raise ValueError("Propiedades de material no válidas.")

        vba = f"""
With Material
    .Reset
    .Name "{name}"
    .Type "Normal"
    .Epsilon "{self._number(eps_r)}"
    .Mue "1"
    .TanD "{self._number(loss_tangent)}"
    .TanDFreq "0.0"
    .TanDGiven "{str(loss_tangent != 0).title()}"
    .TanDModel "ConstTanD"
    .Sigma "{self._number(conductivity)}"
    .TanDM "0"
    .TanDMFreq "0.0"
    .TanDMGiven "False"
    .TanDMModel "ConstTanD"
    .SigmaM "0"
    .Colour "0.65", "0.65", "0.65"
    .Create
End With
"""
        self._history(f"Gielis: material {name}", vba)

    def define_lossy_metal(
        self,
        name: str,
        conductivity: float = 5.8e7,
        mu: float = 1.0,
    ) -> None:
        if not (np.isfinite(conductivity) and conductivity > 0 and np.isfinite(mu) and mu > 0):
            raise ValueError("Propiedades de metal con pérdidas no válidas.")

        vba = f"""
With Material
    .Reset
    .Name "{name}"
    .Folder ""
    .FrqType "all"
    .Type "Lossy metal"
    .MaterialUnit "Frequency", "GHz"
    .MaterialUnit "Geometry", "mm"
    .Mu "{self._number(mu)}"
    .Sigma "{self._number(conductivity)}"
    .Colour "1", "1", "0"
    .Create
End With
"""
        self._history(f"Gielis: material {name}", vba)

    def add_brick(
        self,
        name: str,
        material: str,
        x: tuple[float, float],
        y: tuple[float, float],
        z: tuple[float, float],
    ) -> None:
        if any(b <= a for a, b in (x, y, z)):
            raise ValueError(f"Dimensiones no positivas para {name}.")

        vba = f"""
With Brick
    .Reset
    .Name "{name}"
    .Component "{self.names.component}"
    .Material "{material}"
    .Xrange "{self._number(x[0])}", "{self._number(x[1])}"
    .Yrange "{self._number(y[0])}", "{self._number(y[1])}"
    .Zrange "{self._number(z[0])}", "{self._number(z[1])}"
    .Create
End With
"""
        self._history(f"Gielis: create brick {name}", vba)

    def add_polygon(
        self,
        name: str,
        points: np.ndarray,
        z_min: float,
        thickness: float,
        material: str,
    ) -> None:
        points = np.asarray(points, dtype=float)

        if points.ndim != 2 or points.shape[1] != 2 or len(points) < 3:
            raise ValueError(f"Polígono {name}: se requieren al menos 3 puntos XY.")

        if not np.isfinite(points).all():
            raise ValueError(f"Polígono {name}: contiene coordenadas no finitas.")

        if thickness <= 0:
            raise ValueError("El espesor de extrusión debe ser positivo.")

        commands = [
            "With Extrude",
            "    .Reset",
            f'    .Name "{name}"',
            f'    .Component "{self.names.component}"',
            f'    .Material "{material}"',
            '    .Mode "pointlist"',
            f'    .Height "{self._number(thickness)}"',
            '    .Twist "0"',
            '    .Taper "0"',
            f'    .Origin "0", "0", "{self._number(z_min)}"',
            '    .Uvector "1", "0", "0"',
            '    .Vvector "0", "1", "0"',
            f'    .Point "{self._number(points[0, 0])}", "{self._number(points[0, 1])}"',
        ]

        for x, y in points[1:]:
            commands.append(
                f'    .LineTo "{self._number(x)}", "{self._number(y)}"'
            )

        commands.extend(["    .Create", "End With"])

        self._history(
            f"Gielis: extrude polygon {name}",
            "\n".join(commands),
        )

    def subtract(self, outer: str, inner: str) -> None:
        self._history(
            f"Gielis: subtract {inner} from {outer}",
            f'Solid.Subtract "{self.names.component}:{outer}", '
            f'"{self.names.component}:{inner}"',
        )

    def build_absorber(
        self,
        case: CaseRequest,
        geometry: CaseGeometry,
    ) -> None:
        """Construye sustrato, tierra y dos resonadores anulares."""

        if case.mode != "absorber":
            raise ValueError("Este constructor inicial solo admite absorber.")

        if case.structure_type != "normal":
            raise ValueError("El absorbente requiere estructura normal.")

        substrate = case.substrate
        metal = case.metal
        names = self.names

        self.define_units()
        self.define_background()

        self.define_normal_material(
            name="Gielis_Dielectric",
            eps_r=substrate.eps_r,
            loss_tangent=substrate.loss_tangent,
        )

        if metal.material.strip().upper() == "PEC":
            conductor_material = "PEC"
        else:
            # Cobre recocido como Lossy metal (impedancia superficial, σ = 5.8e7 S/m).
            self.define_lossy_metal(
                name="Gielis_Copper",
                conductivity=5.8e7,
            )
            conductor_material = "Gielis_Copper"

        half_w = substrate.width_mm / 2
        half_l = substrate.length_mm / 2
        h = substrate.thickness_mm
        t = metal.thickness_mm

        self.add_brick(
            name=names.substrate,
            material="Gielis_Dielectric",
            x=(-half_w, half_w),
            y=(-half_l, half_l),
            z=(0.0, h),
        )

        self.add_brick(
            name=names.ground,
            material=conductor_material,
            x=(-half_w, half_w),
            y=(-half_l, half_l),
            z=(-t, 0.0),
        )

        self.add_polygon(
            names.outer_1, geometry.c1, h, t, conductor_material
        )
        self.add_polygon(
            names.inner_1, geometry.c2, h, t, conductor_material
        )
        self.subtract(names.outer_1, names.inner_1)

        self.add_polygon(
            names.outer_2, geometry.c3, h, t, conductor_material
        )
        self.add_polygon(
            names.inner_2, geometry.c4, h, t, conductor_material
        )
        self.subtract(names.outer_2, names.inner_2)

    def define_solver_and_frequency(self, min_ghz: float, max_ghz: float) -> None:
        if not (np.isfinite(min_ghz) and np.isfinite(max_ghz) and 0 < min_ghz < max_ghz):
            raise ValueError("Rango de frecuencia inválido.")

        self._history("change solver type", 'ChangeSolverType "HF Frequency Domain"')
        self._history(
            "SetFrequency",
            f'Solver.FrequencyRange "{self._number(min_ghz)}", "{self._number(max_ghz)}"',
        )

    def define_absorber_boundaries(self) -> None:
        vba = "\n".join([
            "With Boundary",
            '    .Xmin "unit cell"',
            '    .Xmax "unit cell"',
            '    .Ymin "unit cell"',
            '    .Ymax "unit cell"',
            '    .Zmin "expanded open"',
            '    .Zmax "expanded open"',
            "End With",
        ])
        self._history("define boundaries", vba)

    def define_floquet_modes(self, n_modes: int = 2) -> None:
        if int(n_modes) < 1 or int(n_modes) != n_modes:
            raise ValueError("El número de modos Floquet debe ser un entero positivo.")

        n = int(n_modes)
        vba = "\n".join([
            "With FloquetPort",
            "    .Reset",
            '    .SetDialogTheta "0"',
            '    .SetDialogPhi "0"',
            '    .SetPolarizationIndependentOfScanAnglePhi "0.0", "False"',
            '    .SetSortCode "+beta/pw"',
            '    .SetCustomizedListFlag "False"',
            '    .Port "Zmin"',
            f'    .SetNumberOfModesConsidered "{n}"',
            '    .SetDistanceToReferencePlane "0.0"',
            '    .SetUseCircularPolarization "False"',
            '    .Port "Zmax"',
            f'    .SetNumberOfModesConsidered "{n}"',
            '    .SetDistanceToReferencePlane "0.0"',
            '    .SetUseCircularPolarization "False"',
            "End With",
        ])
        self._history("define Floquet Port boundaries", vba)

    def add_field_monitor(self, field_type: str, freq_ghz: float) -> None:
        if field_type not in ("Efield", "Hfield"):
            raise ValueError(f"Tipo de monitor no soportado: {field_type!r}.")
        if not (np.isfinite(freq_ghz) and freq_ghz > 0):
            raise ValueError("La frecuencia del monitor debe ser positiva.")

        freq_str = self._number(freq_ghz)
        prefix = "e-field" if field_type == "Efield" else "h-field"
        name = f"{prefix} (f={freq_str})"
        vba = "\n".join([
            "With Monitor",
            "    .Reset",
            f'    .Name "{name}"',
            '    .Dimension "Volume"',
            '    .Domain "Frequency"',
            f'    .FieldType "{field_type}"',
            f'    .Frequency "{freq_str}"',
            '    .UseSubVolume "False"',
            "    .Create",
            "End With",
        ])
        self._history(f"define field monitor: {name}", vba)

    def setup_absorber_simulation(self, case: CaseRequest) -> None:
        """Configura solver HF Frequency Domain, fronteras unit cell, Floquet y monitores."""
        self.define_solver_and_frequency(case.frequency.min_ghz, case.frequency.max_ghz)
        self.define_absorber_boundaries()
        self.define_floquet_modes(2)
        if case.field_monitors is not None:
            self.add_field_monitor("Efield", case.field_monitors.freq_ghz)
            if case.field_monitors.fields == "EH":
                self.add_field_monitor("Hfield", case.field_monitors.freq_ghz)
