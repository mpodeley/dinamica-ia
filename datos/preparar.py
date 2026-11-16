#!/usr/bin/env python3
"""Build datos/observaciones.csv: what has been measured, with its source, for calibration and display.

    python3 datos/preparar.py

Time horizons come from METR's public file (fuentes/metr/benchmark_results_1_1.yaml, a copy of
metr.org/assets/benchmark_results_1_1.yaml). The other rows are single published figures, typed here
with the key of their row in fuentes.md. `usa` says whether the row enters the weighting of the
Monte Carlo runs (1) or is only drawn (0).
"""
import csv
import pathlib
from datetime import date

import yaml

HERE = pathlib.Path(__file__).resolve().parent
YAML = HERE.parent / 'fuentes' / 'metr' / 'benchmark_results_1_1.yaml'

# variable, date, value, low, high, source key, note, usa
MANUAL = [
    ('eciRate', date(2025, 9, 1), 14, 12, 17, 'epoch-trends', 'Frontera del ECI desde sep-2024, IC 90%', 1),
    ('slopeRatio', date(2026, 10, 15), 1.9, 1.5, 2.8, 'metr-2026-11', 'Pendiente del AECI de Anthropic desde el 7-oct-2025 sobre la anterior, IC 95%', 1),
    ('accel', date(2026, 10, 15), 1.7, 1.24, 2.6, 'metr-2026-11,q35', 'Aceleración atribuible a la IA: 2× (1.3–3×), ~80% por IA', 1),
    ('eciRate', date(2026, 6, 1), 23.5, 20, 27, 'epoch-trends,metr-2026-11', 'Derivado: 14 pts/año por la aceleración de 1.4× a 1.9×; solo para comparar escenarios', 0),
    ('Y', date(2026, 1, 1), 30, 27, 33, 'epoch-revenue', 'OpenAI + Anthropic, ingresos anualizados', 0),
    ('Y', date(2026, 4, 1), 55, 47, 63, 'epoch-revenue', 'OpenAI + Anthropic, ingresos anualizados', 1),
    ('Y', date(2026, 8, 20), 105, 95, 115, 'epoch-revenue', 'OpenAI + Anthropic, ingresos anualizados', 1),
    ('C', date(2026, 1, 1), 16, 12, 20, 'epoch-compute', 'Cómputo mundial en operación, fin de 2025', 0),
    ('uplift', date(2026, 10, 15), 12, 6, 24, 'metr-2026-11', 'Uplift autorreportado en Anthropic; METR lo llama evidencia floja', 0),
    ('uplift', date(2026, 3, 15), 4, 2, 8, 'rsi2026', 'Uplift autorreportado, system card de Mythos Preview', 0),
]


def year(d):
    return d.year + (d - date(d.year, 1, 1)).days / (366 if d.year % 4 == 0 else 365)


def main():
    data = yaml.safe_load(YAML.read_text())
    rows = []
    for key, r in data['results'].items():
        m = r['metrics']
        if not m.get('is_sota'):
            continue
        h = m['p50_horizon_length']
        d = r['release_date']
        rows.append(('horizon', d, h['estimate'], h['ci_low'], h['ci_high'], 'metr-th11', key, 1 if d >= date(2023, 1, 1) else 0))
    rows += MANUAL
    rows.sort(key=lambda r: (r[0], r[1]))
    with open(HERE / 'observaciones.csv', 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['variable', 'fecha', 't', 'valor', 'bajo', 'alto', 'fuente', 'nota', 'usa'])
        for var, d, val, lo, hi, src, note, use in rows:
            w.writerow([var, d.isoformat(), f'{year(d):.3f}', f'{val:.4g}', f'{lo:.4g}', f'{hi:.4g}', src, note, use])
    print(f'observaciones.csv: {len(rows)} filas ({sum(1 for r in rows if r[0] == "horizon")} horizontes)')


if __name__ == '__main__':
    main()
