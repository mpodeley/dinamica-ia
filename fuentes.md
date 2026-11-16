# Fuentes

Una fila por fuente. Ningún parámetro ni cifra entra al modelo o a la página sin su clave acá.
`cotejo` dice cómo se leyó: **original** (texto de la fuente bajado a `fuentes/` y leído en esta
máquina), **secundario** (resumen de un subagente o cita dentro de otra fuente, sin cotejar contra el
original), **propio** (juicio de este trabajo, sin fuente externa).

| clave | fuente | url | qué se tomó | cotejo |
|---|---|---|---|---|
| metr-2026-11 | METR, Independent Assessment of AI R&D Acceleration at Anthropic (5 de noviembre de 2026) | https://metr.org/blog/2026-11-05-anthropic-ai-rd-acceleration-assessment/ | Pendiente del AECI 1.9× [IC 95% 1.5–2.8] desde el quiebre del 7 de octubre de 2025; juicio de 2× (1.3–3×) con cerca de 80% atribuible a la IA; uplift autorreportado de 12×; lectura alternativa de 1.4×; evidencia tachada | original |
| metr-th11 | METR, Time Horizon 1.1, archivo de resultados | https://metr.org/assets/benchmark_results_1_1.yaml | Horizonte al 50% por modelo y fecha; duplicación cada 129 días desde 2023 | original |
| rsi2026 | Cunningham y otros, The Economics of Recursive Self-Improvement (13 de julio de 2026) | https://elasticity.institute/rsi-paper.pdf | Condición de aceleración autosostenida; umbral de 15% por punto de ECI contra 9% estimado; 6.5 de elasticidad de capacidad a cómputo; uplift de 4× | original |
| kwa2026 | Kwa (METR), A simpler AI timelines model (10 de febrero de 2026) | https://github.com/tkwa/ai-takeoff-model | Ecuaciones, rangos de parámetros y trayectorias de cómputo y plantel | original |
| q35 | AI Futures Project, Q3.5 timelines update (10 de noviembre de 2026) | https://blog.aifutures.org/p/q35-timelines-update-looks-like-the | Investigador sobrehumano en 2027; medianas de agosto de 2027 y septiembre de 2028; 1.7× atribuible a la IA; sustitución entre tareas de −2 a −0.5 | original |
| ai2040 | AI Futures Project, AI 2040: Plan A, suplemento de despegue (9 de julio de 2026) | https://www.ai-2040.com/supplements/takeoff-forecast | Automatización de la programación en enero de 2030 sin acuerdo; pausa de marzo a septiembre de 2029; multiplicador de criterio 5.28× | original |
| aifm | AI Futures Project, AI Futures Model, código | https://github.com/AI-Futures-Project/aifm-public | Estructura: sustitución entre tareas, criterio de investigación, techo de automatización | secundario |
| ai2027 | Kokotajlo y otros, AI 2027 (abril de 2025) | https://ai-2027.com | Hitos fechados y multiplicadores de 5×, 25×, 250× y 2000× | secundario |
| ai2027-compute | AI 2027, compute forecast | https://ai-2027.com/research/compute-forecast | Crecimiento del cómputo 2.25×/año, mejora de chips 1.35×/año, cómputo para alineación | secundario |
| ai2027-security | AI 2027, security forecast | https://ai-2027.com/research/security-forecast | Rezago del segundo actor de unos seis meses | secundario |
| epoch-trends | Epoch AI, Trends | https://epoch.ai/trends | ECI de frontera 14 puntos/año (IC 90% 12–17); cómputo vendido 2.5×/año; obra de un centro de datos 2.1 años; rendimiento por dólar 1.49×/año | original |
| epoch-compute | Epoch AI, Frontier labs don't use most AI compute (20 de mayo de 2026) | https://epoch.ai/gradient-updates/frontier-labs-dont-use-most-ai-compute | 20 millones de H100e vendidos y 12–16 millones en operación a fin de 2025; 1.7 millones de H100e de OpenAI | original |
| epoch-revenue | Epoch AI, An update on AI's most important number (27 de agosto de 2026) | https://epoch.ai/gradient-updates/an-update-on-ais-most-important-number | Ingresos anualizados de OpenAI y Anthropic: 30, 55 y 105 mil millones de dólares | original |
| ho2024 | Ho y otros (2024), progreso algorítmico | https://arxiv.org/abs/2403.05812 | Eficiencia algorítmica 3×/año, citada en rsi2026 | secundario |
| whitfill2025 | Whitfill y Wu, Will Compute Bottlenecks Prevent an Intelligence Explosion? (2025) | https://arxiv.org/abs/2507.23181 | Rango de sustitución entre cómputo y trabajo | secundario |
| davidson2025 | Davidson y Houlden, How quick and big would a software intelligence explosion be? (2025) | https://www.forethought.org/research/how-quick-and-big-would-a-software-intelligence-explosion-be | Distancia al límite del software | secundario |
| normal-tech | Narayanan y Kapoor, AI as Normal Technology (2025) | https://knightcolumbia.org/content/ai-as-normal-technology | Tesis de difusión lenta; sin modelo numérico | secundario |
| propio | Juicio de este trabajo | | Parámetros sin medición publicada; rangos en modelo/priors.json | propio |
