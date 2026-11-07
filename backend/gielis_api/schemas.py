"""
Forma de los datos que entran y salen del servidor.

`CaseRequest` es el mismo "JSON del caso" que arma el front (sección 4.5 de
docs/DOCUMENTACION.md). Pydantic lo valida al llegar: si falta un campo o un
valor no tiene sentido, FastAPI responde 422 con el detalle y el caso no entra
a la cola.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Mode = Literal["absorber", "transmitter", "sensor"]
StructureType = Literal["normal", "complementary"]
JobStatus = Literal["queued", "building", "simulating", "done", "failed", "cancelled"]

# Estados en los que el trabajo ya no va a cambiar.
FINISHED: frozenset[str] = frozenset({"done", "failed", "cancelled"})


class _Strict(BaseModel):
    # Un campo con un nombre mal escrito es un error, no algo que se ignora.
    model_config = ConfigDict(extra="forbid")


class Gielis(_Strict):
    a: float
    b: float
    m: float
    n1: float
    n2: float
    n3: float

    @model_validator(mode="after")
    def _non_zero(self) -> "Gielis":
        if self.a == 0 or self.b == 0 or self.n1 == 0:
            raise ValueError("a, b y n1 no pueden ser 0.")
        return self


class Concentric(_Strict):
    gap_mm: float = Field(gt=0)
    size1: float = Field(gt=0.05)
    size2: float = Field(gt=0.05)
    rotation_deg: float = 0.0
    dx_mm: float = 0.0
    dy_mm: float = 0.0


class Substrate(_Strict):
    material: str
    width_mm: float = Field(gt=0)
    length_mm: float = Field(gt=0)
    thickness_mm: float = Field(gt=0)
    eps_r: float = Field(ge=1)
    loss_tangent: float = Field(ge=0)


class Metal(_Strict):
    material: str
    thickness_mm: float = Field(gt=0)


class TransmissionLine(_Strict):
    width_mm: float = Field(gt=0)


class Frequency(_Strict):
    min_ghz: float = Field(gt=0)
    max_ghz: float = Field(gt=0)

    @model_validator(mode="after")
    def _ordered(self) -> "Frequency":
        if self.max_ghz <= self.min_ghz:
            raise ValueError("La frecuencia máxima debe ser mayor que la mínima.")
        return self


class FieldMonitors(_Strict):
    fields: Literal["E", "EH"]
    freq_ghz: float = Field(gt=0)


class CaseRequest(_Strict):
    schema_version: Literal["1.0"]
    mode: Mode
    structure_type: StructureType
    gielis: Gielis
    concentric: Concentric
    substrate: Substrate
    metal: Metal
    transmission_line: TransmissionLine | None = None
    frequency: Frequency
    field_monitors: FieldMonitors | None = None

    @model_validator(mode="after")
    def _consistent(self) -> "CaseRequest":
        if self.mode == "sensor":
            if self.structure_type != "complementary":
                raise ValueError("En modo sensor la estructura es complementaria.")
            if self.transmission_line is None:
                raise ValueError("El modo sensor necesita el ancho de la línea microstrip.")
        if self.field_monitors and not (
            self.frequency.min_ghz <= self.field_monitors.freq_ghz <= self.frequency.max_ghz
        ):
            raise ValueError("La frecuencia del monitor debe estar dentro del barrido.")
        return self


class Resonance(BaseModel):
    """Un mínimo (o máximo) de una curva: la frecuencia y cuánto vale ahí."""

    frequency_ghz: float
    parameter: Literal["S11", "S21"]
    kind: Literal["min", "max"]
    value_db: float
    absorption_pct: float | None = None


class SimulationResult(BaseModel):
    simulator: Literal["mock", "cst"]
    frequency_ghz: list[float]
    s11_db: list[float] | None
    s21_db: list[float] | None
    # Absorción entre 0 y 1; None en el sensor, donde no se calcula.
    absorption: list[float] | None
    resonances: list[Resonance]
    notes: list[str] = []


class JobSummary(BaseModel):
    """Lo que se muestra en el historial (sin las curvas, para que pese poco)."""

    id: str
    created_at: str
    finished_at: str | None
    mode: Mode
    structure_type: StructureType
    status: JobStatus
    message: str
    progress: float | None
    error: str | None
    simulator: str


class JobDetail(JobSummary):
    case: CaseRequest
    result: SimulationResult | None
