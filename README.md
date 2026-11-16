# dinamica-ia

Modelo de dinámica de sistemas para comparar escenarios de IA (AI 2027, AI Futures, AI 2040: Plan A,
el modelo simple de METR, la economía de la automejora, tecnología normal, cuello de cómputo) con las
mismas ecuaciones, ubicar dónde estamos y emitir predicciones contrastables.

El entregable es `out/dinamica-ia.html`: un solo archivo, se abre desde el disco sin red.

## Cómo se actualiza

```bash
python3 datos/preparar.py              # observaciones.csv desde el YAML de METR y las cifras tipeadas
node analisis/calibrar.mjs             # ajusta los parámetros libres de cada escenario a su fuente
node analisis/montecarlo.mjs --n 20000 # corridas ponderadas → analisis/mc.json (unos 3 minutos)
node analisis/montecarlo.mjs --n 8000 --hasta 2026.0   # retroprueba → analisis/retro.json
node predicciones/emitir.mjs 2027-02   # congela una emisión nueva (no reescribe las anteriores)
node predicciones/puntuar.mjs          # puntúa contra predicciones/observado.csv
node pagina/build.mjs                  # arma out/dinamica-ia.html
node --test tests/                     # estructura, condiciones extremas, reproducción de Kwa
```

Para resolver una predicción: agregar una fila a `predicciones/observado.csv`
(`variable,fecha,valor,fuente`, con la fecha como `2027-02`), correr `puntuar.mjs` y `build.mjs`.

## Dónde está cada cosa

- `modelo/motor.js`: el modelo entero, declarado como listas (`PARAMS`, `STOCKS`, `AUX`, `LOOPS`,
  `MILESTONES`). La tabla de ecuaciones y los tests salen de esas listas; las flechas del diagrama
  se eligen a mano y `tests/diagrama.test.mjs` verifica cada una contra las ecuaciones.
- `modelo/escenarios.json`: un diccionario de parámetros por escenario, con los blancos que debe
  reproducir (`blancos`) y los parámetros que se ajustan (`libres`).
- `modelo/priors.json`: rangos previos del Monte Carlo.
- `datos/observaciones.csv`: lo medido, con fuente; `usa` = 1 si pondera las corridas.
- `fuentes.md`: una fila por fuente y cómo se leyó. `fuentes/` es la caché local de originales
  (fuera de git).
- `pagina/`: fuente de la página, gráficos, diagrama y `build.mjs`. `pagina/kit/` es una copia de
  `identity/kit` (tokens y fuentes).

Código de terceros usado para contrastar, clonado en `~/Projects/terceros/`: `aifm-public`,
`ai-takeoff-model`, `Accelerated_AI_Progress`.

## Decisiones que conviene conocer

- La medición de METR entra dos veces, como cosas distintas: el cociente de pendientes antes y
  después del 7 de octubre de 2025 (1.9×) y la aceleración atribuible a la IA (1.7×).
- El nivel y la pendiente de la curva de horizontes se ajustan en cada corrida; de esa serie solo
  pondera la curvatura.
- El peso de cada escenario usa solo lo que dice sobre 2026 (aceleración atribuible y ritmo del
  ECI), porque su pasado no es parte de lo que afirma.
- Todos los escenarios pasan por los ingresos medidos en 2026 (`difMomentum` se ajusta en cada
  uno). Sus valores base de la capa económica son las medianas ponderadas del Monte Carlo.
- El cociente de pendientes de un escenario usa como base el ritmo medido en 2024–2025; el de una
  corrida del Monte Carlo usa su propia historia integrada hacia atrás.
- La capa de seguridad y gobernanza es ilustrativa y no entra al registro de predicciones.
