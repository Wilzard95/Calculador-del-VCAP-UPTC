# Calculador del VCAP UPTC

Página interactiva para estimar el **Valor del Crédito Académico de Posgrado** a partir de las 19 preguntas del instrumento MVV v5. Cada respuesta habilita un deslizable dentro de su rango. El nivel y la modalidad seleccionan la base del modelo financiero de 2026.

## Valores base

Valores en pesos colombianos, tomados de la figura 10 del Documento Técnico Acuerdo Financiero.

| Nivel | Presencial | Híbrida | Virtual |
| --- | ---: | ---: | ---: |
| Especialización | $450.000 | $382.500 | $315.000 |
| Maestría | $630.000 | $535.500 | $441.000 |
| Doctorado | $900.000 | $765.000 | $630.000 |

Son bases estimadas de 2026. No se aplica un IAEP de 2027 sin un parámetro aprobado. El ejemplo hipotético del instrumento no se utiliza como base.

## Método

- CP: 20 %, cinco preguntas de igual peso.
- Competencia: 20 %, cinco preguntas de igual peso.
- Estudiantes: 30 %, cuatro preguntas de igual peso.
- Profesores: 30 %, cinco preguntas de igual peso.

`x = 0,20 CP + 0,20 C + 0,30 E + 0,30 P`

`g(x) = 0,80 + 0,10 (x − 1)` para `1 ≤ x ≤ 3`.

`g(x) = 1,00 + 0,75 (x − 3)` para `3 < x ≤ 5`.

`VCAP = VBCI × g(x)`; solo se redondea el resultado final al peso.

| Respuesta | Puntaje permitido | Puntaje inicial |
| --- | --- | ---: |
| Opción 1 | 1,0–1,7 | 1,4 |
| Opción 2 | 1,8–2,4 | 2,1 |
| Opción 3 | 2,5–3,2 | 3,0 |
| Opción 4 | 3,3–3,8 | 3,6 |
| Opción 5 | 3,9–5,0 | 4,5 |

Los rangos proceden de la tabla 3. Los puntajes iniciales son referencias de interfaz, ajustables en pasos de 0,1. El documento también habla de puntajes fijos; la instrucción del solicitante de usar deslizables prevalece para esta implementación. Los espacios de 0,1 entre rangos se conservan tal como están definidos en la tabla.

El cálculo final requiere las 19 respuestas. No se reemplazan respuestas pendientes por supuestos ni se renormalizan los pesos. El caso neutro utiliza 3,0 en todas las preguntas y produce un VCAP igual a la base seleccionada.

## Uso y desarrollo

Es un sitio estático, sin instalación de dependencias ni compilación. Requiere un navegador moderno. Para servirlo localmente con Node.js:

```sh
npm start
```

Abrir `http://127.0.0.1:4173`. Para verificar el modelo:

```sh
npm test
```

Las respuestas se guardan en `localStorage` del navegador; no se envían a un servidor de la aplicación. La evaluación completa puede descargarse como JSON o imprimirse y guardarse como PDF. La tipografía se solicita a Google Fonts y dispone de fuentes locales de respaldo.

Los parámetros y las preguntas están en `data/modelo.json`; la lógica en `engine.mjs`. `scripts/extract-source.py` permite reproducir la extracción de las rúbricas si se dispone del documento local `MVV_v5_UPTC.docx`. El documento Word y los archivos de revisión local están excluidos del repositorio.

## GitHub Pages

Publicación estática desde la raíz de la rama `main` (Settings → Pages → Deploy from a branch → `main` → `/ (root)`). `.nojekyll` permite servir los archivos directamente. No se requieren secretos ni servicios externos para calcular.

La estimación es un soporte técnico para la valoración institucional; la adopción del valor depende de las instancias competentes.
