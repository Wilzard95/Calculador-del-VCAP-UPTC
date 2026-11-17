"""Extrae las 19 rúbricas del instrumento local sin publicar el documento Word."""
import json
import re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
GROUPS = [
    ("CP", "Características del programa", 20, "Condiciones académicas, recursos especializados y población objetivo.",
     ["Infraestructura y recursos", "Costos de la disciplina", "Mercado potencial", "Capacidad económica", "Dinámica del sector"]),
    ("C", "Competencia de mercado", 20, "Oferta comparable, precios y diferenciación del programa.",
     ["Oferta comparable", "Precio de los competidores", "Atributos diferenciales", "Presión de precios", "Evolución de la oferta"]),
    ("E", "Estudiantes", 30, "Demanda, matrícula y apertura de cohortes del programa.",
     ["Tendencia de la matrícula", "Demanda por cupo", "Meta de matrícula", "Apertura de cohortes"]),
    ("P", "Profesores", 30, "Disponibilidad, especialización y costos de la estructura docente.",
     ["Carga cubierta por planta", "Disponibilidad de perfiles", "Costo docente comparado", "Docencia especializada", "Docencia externa"]),
]

with ZipFile(ROOT / "MVV_v5_UPTC.docx") as archive:
    document = ET.fromstring(archive.read("word/document.xml"))

questions = {}
for table in document.findall(".//w:tbl", NS):
    for row in table.findall("w:tr", NS):
        cells = [" ".join(t.text or "" for t in c.findall(".//w:t", NS)) for c in row.findall("w:tc", NS)]
        if not cells or not re.match(r"^(CP|C|E|P)\d\.", cells[0]):
            continue
        code, text = cells[0].split(".", 1)
        options = re.split(r"\(Op[1-5]\)\s*", cells[1])[1:]
        assert len(options) == 5, code
        questions[code] = {
            "id": code,
            "text": re.sub(r"\s+", " ", text).strip(),
            "options": [re.sub(r"\s+", " ", v).strip() for v in options],
            "source": re.sub(r"\s+", " ", cells[2]).strip(),
        }

model = {
    "version": "1.0.0",
    "baseYear": 2026,
    "currency": "COP",
    "sources": {
        "rubric": "MVV_v5_UPTC.docx · tablas 2 y 3 y numerales 3.1 a 3.4",
        "base": "Documento Técnico Acuerdo Financiero · figura 10 · base estimada 2026",
        "interpretation": "Rangos de la tabla 3, con selección de puntaje en pasos de 0,1 por instrucción del solicitante. Esta instrucción prevalece sobre las referencias contradictorias a puntajes fijos del documento.",
    },
    "levels": [
        {"id": "especializacion", "label": "Especialización", "bases": {"presencial": 450000, "hibrida": 382500, "virtual": 315000}},
        {"id": "maestria", "label": "Maestría", "bases": {"presencial": 630000, "hibrida": 535500, "virtual": 441000}},
        {"id": "doctorado", "label": "Doctorado", "bases": {"presencial": 900000, "hibrida": 765000, "virtual": 630000}},
    ],
    "modalities": [
        {"id": "presencial", "label": "Presencial"},
        {"id": "hibrida", "label": "Híbrida"},
        {"id": "virtual", "label": "Virtual"},
    ],
    "ranges": [
        {"min": 1, "max": 1.7, "initial": 1.4},
        {"min": 1.8, "max": 2.4, "initial": 2.1},
        {"min": 2.5, "max": 3.2, "initial": 3},
        {"min": 3.3, "max": 3.8, "initial": 3.6},
        {"min": 3.9, "max": 5, "initial": 4.5},
    ],
    "groups": [],
}
for code, label, weight, description, titles in GROUPS:
    items = [dict(questions[f"{code}{i+1}"], title=title) for i, title in enumerate(titles)]
    model["groups"].append({"id": code, "label": label, "weight": weight, "description": description, "questions": items})
assert len(questions) == 19
(ROOT / "data").mkdir(exist_ok=True)
(ROOT / "data/modelo.json").write_text(json.dumps(model, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("19 preguntas y 9 valores base extraídos y documentados.")
