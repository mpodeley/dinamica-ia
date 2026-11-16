/* motor.js — system dynamics engine for AI-trajectory scenarios. No dependencies.

   One model; every published scenario is a dictionary of parameter overrides (escenarios.json).
   The model is declared as data: PARAMS, STOCKS (with their flows) and AUX (ordered auxiliaries).
   The diagram, the equation table and the structural tests are all derived from these lists.

   Time is in decimal years. States are normalized at T_REF = 2026.0 (software efficiency S = 1,
   research labor L = 1). The forward run starts at T_REF with every sector; `history` integrates the
   technical core backwards to show the fit against data before 2026.

   Runs in Node (`require`) and in the browser (global `Motor`). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Motor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const T_REF = 2026.0;
  const GS_CAP = 200;   // 1/year; software growth beyond this is treated as instantaneous
  const LN10 = Math.LN10;
  const log10 = Math.log10;
  const sig = x => 1 / (1 + Math.exp(-x));
  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
  const softplus = (x, k) => (x / k > 30 ? x : k * Math.log1p(Math.exp(x / k)));

  /* ---------------------------------------------------------------- parameters */

  // id: [default, unit, sector, Spanish label, source key in fuentes.md]
  const PARAMS = {
    // technical core
    gS0: [4, '×/año', 'nucleo', 'Crecimiento de la eficiencia de software en 2026', 'ho2024,kwa2026'],
    f0: [0.4, 'fracción', 'nucleo', 'Fracción de la I+D automatizada en 2026', 'kwa2026'],
    width: [1.2, 'OOM', 'nucleo', 'Ancho de la curva de automatización', 'kwa2026'],
    fmax: [1, 'fracción', 'nucleo', 'Techo de la automatización', 'kwa2026,aifm'],
    rhoTasks: [-2, 'adim.', 'nucleo', 'Sustitución entre tareas de I+D (ρ; −50 = ninguna)', 'aifm,q35'],
    aiLabor0: [30, '×humano', 'nucleo', 'Trabajo de IA disponible por tarea en 2026', 'propio'],
    laborShare: [0.25, 'fracción', 'nucleo', 'Peso del trabajo frente al cómputo en la I+D', 'kwa2026'],
    sigma: [1, 'adim.', 'nucleo', 'Sustitución entre cómputo y trabajo (σ)', 'whitfill2025'],
    lambda: [0.9, 'adim.', 'nucleo', 'Rendimientos del esfuerzo de I+D (λ)', 'kwa2026'],
    beta: [0.65, 'adim.', 'nucleo', 'Dificultad creciente de las ideas (β)', 'kwa2026'],
    ceiling: [8, 'OOM', 'nucleo', 'Distancia al límite del software', 'davidson2025'],
    taste: [1, '×/OOM', 'nucleo', 'Criterio de investigación sobrehumano (factor por OOM)', 'aifm'],
    tasteOffset: [2, 'OOM', 'nucleo', 'Dónde empieza el criterio sobrehumano', 'aifm'],
    chi: [1, 'adim.', 'nucleo', 'Elasticidad del cómputo de frontera al stock mundial', 'propio'],
    gCHist: [2.6, '×/año', 'nucleo', 'Crecimiento del cómputo antes de 2026', 'epoch-trends,kwa2026'],
    laborRates: [[[2026, 2], [2029, 2], [2029.01, 1.1]], '×/año', 'nucleo', 'Crecimiento del plantel de investigación', 'kwa2026'],
    computeExo: [null, '×/año', 'nucleo', 'Cómputo exógeno (reemplaza la capa física)', 'kwa2026'],
    // observables
    H0: [450, 'min', 'observables', 'Horizonte temporal al 50% en 2026', 'metr-th11'],
    dH: [0.38, 'OOM', 'observables', 'Cómputo efectivo por duplicación del horizonte', 'metr-th11'],
    hSuper: [1, '×', 'observables', 'Acortamiento de cada duplicación del horizonte', 'aifm'],
    eciSlope: [15, 'pts/OOM', 'observables', 'Puntos ECI por orden de magnitud', 'rsi2026'],
    // physical bottlenecks
    C0: [16, 'M H100e', 'fisico', 'Cómputo instalado en el mundo en 2026', 'epoch-compute'],
    F0: [18, 'M H100e/año', 'fisico', 'Producción de chips en 2026', 'epoch-compute,epoch-trends'],
    gFab: [1.8, '×/año', 'fisico', 'Expansión máxima de fábricas y empaquetado', 'propio'],
    tauFab: [1.5, 'años', 'fisico', 'Demora de ajuste de la capacidad fabril', 'propio'],
    gChip: [1.35, '×/año', 'fisico', 'Mejora de los chips (H100e por unidad)', 'ai2027-compute'],
    price0: [22, 'mil M USD/M H100e', 'fisico', 'Costo instalado del cómputo en 2026', 'propio'],
    gPrice: [1.35, '×/año', 'fisico', 'Caída del costo por H100e', 'epoch-trends'],
    e0: [1.12, 'GW/M H100e', 'fisico', 'Potencia por unidad de cómputo en 2026', 'epoch-compute'],
    gEnergy: [1.25, '×/año', 'fisico', 'Mejora de la eficiencia energética', 'propio'],
    slackP0: [1.3, '×', 'fisico', 'Holgura de potencia en 2026', 'propio'],
    gP0: [2.3, '×/año', 'fisico', 'Crecimiento reciente de la potencia para IA', 'propio'],
    gPmax: [2.3, '×/año', 'fisico', 'Expansión máxima de la potencia', 'propio'],
    tauP: [2.1, 'años', 'fisico', 'Tiempo de obra de un centro de datos', 'epoch-trends'],
    polFriction: [0.1, 'fracción', 'fisico', 'Proyectos frenados por oposición local', 'propio'],
    delta: [0.12, '1/año', 'fisico', 'Retiro de cómputo', 'propio'],
    tauInst: [0.25, 'años', 'fisico', 'Demora entre entrega e instalación', 'epoch-compute'],
    // economy and employment
    ecoGap: [2.2, 'OOM', 'economia', 'Rezago de la capacidad amplia frente a la de I+D', 'rsi2026'],
    ecoWidth: [1.8, 'OOM', 'economia', 'Ancho de la curva de tareas automatizables', 'propio'],
    tauDif: [4.8, 'años', 'economia', 'Demora de difusión en la economía', 'normal-tech'],
    difMomentum: [4.8, '×', 'economia', 'Adopción ya en marcha en 2026', 'propio'],
    Y0: [30, 'mil M USD/año', 'economia', 'Ingresos de los laboratorios en 2026', 'epoch-revenue'],
    marketFull: [5100, 'mil M USD/año', 'economia', 'Ingresos con despliegue total', 'propio'],
    gY0: [4, '×/año', 'economia', 'Crecimiento de ingresos percibido en 2026', 'epoch-revenue'],
    I0: [400, 'mil M USD/año', 'economia', 'Inversión en cómputo en 2026', 'propio'],
    planH: [2, 'años', 'economia', 'Horizonte de las expectativas de inversión', 'propio'],
    tauPerc: [1, 'años', 'economia', 'Demora en percibir el crecimiento', 'propio'],
    tauI: [0.5, 'años', 'economia', 'Demora de ajuste de la inversión', 'propio'],
    Imax: [11000, 'mil M USD/año', 'economia', 'Techo de inversión (10% del producto mundial)', 'propio'],
    // safety and governance (illustrative layer)
    sBase: [0.05, 'fracción', 'gobernanza', 'Esfuerzo de I+D dedicado a seguridad', 'ai2027-compute'],
    rhoRace: [0.5, 'fracción', 'gobernanza', 'Recorte de seguridad por presión de carrera', 'propio'],
    omega: [0.5, 'fracción', 'gobernanza', 'Ritmo de la seguridad frente a la capacidad', 'propio'],
    epsSafety: [0.3, 'fracción', 'gobernanza', 'Cuánto acelera la IA a la seguridad', 'propio'],
    alphaS: [0.5, 'adim.', 'gobernanza', 'Rendimiento del esfuerzo de seguridad', 'propio'],
    kInc: [0.1, '1/año', 'gobernanza', 'Incidentes por unidad de brecha', 'propio'],
    tauH: [2, 'años', 'gobernanza', 'Memoria de la preocupación pública', 'propio'],
    hThreshold: [0.5, 'fracción', 'gobernanza', 'Preocupación que dispara regulación', 'propio'],
    tauReg: [1.5, 'años', 'gobernanza', 'Demora regulatoria', 'propio'],
    sReg: [0.15, 'fracción', 'gobernanza', 'Seguridad exigida por regulación', 'propio'],
    regBrake: [0.5, 'fracción', 'gobernanza', 'Freno regulatorio a la obra de centros de datos', 'propio'],
    xi: [0.9, 'fracción', 'gobernanza', 'Velocidad del segundo actor frente al líder', 'ai2027-security'],
    tauLeak: [2, 'años', 'gobernanza', 'Tiempo en que se filtra la ventaja', 'ai2027-security'],
    lead0: [0.4, 'años', 'gobernanza', 'Ventaja del líder en 2026', 'ai2027-security'],
    dealT: [null, 'año', 'gobernanza', 'Fecha del acuerdo internacional', 'ai2040'],
    dealPause: [0.5, 'años', 'gobernanza', 'Pausa inicial del acuerdo', 'ai2040'],
    dealSafety: [0.3, 'fracción', 'gobernanza', 'Seguridad exigida por el acuerdo', 'ai2040'],
    dealBrake: [0.5, 'fracción', 'gobernanza', 'Ritmo de I+D de capacidad bajo el acuerdo', 'ai2040'],
    dealCompute: [1.25, '×/año', 'gobernanza', 'Tope al crecimiento del cómputo bajo el acuerdo', 'ai2040'],
  };

  const defaults = () => {
    const P = {};
    for (const k in PARAMS) P[k] = PARAMS[k][0];
    return P;
  };

  /* ---------------------------------------------------------------- helpers */

  // Instantaneous log growth rate from a table of [year, annual factor], linear between breakpoints.
  function rate(table, t) {
    if (t <= table[0][0]) return Math.log(table[0][1]);
    for (let i = 1; i < table.length; i++) {
      if (t <= table[i][0]) {
        const [t0, a0] = table[i - 1], [t1, a1] = table[i];
        return Math.log(a0 + (a1 - a0) * (t - t0) / (t1 - t0));
      }
    }
    return Math.log(table[table.length - 1][1]);
  }

  // Task aggregator: humans spread over the (1 − f) tasks AI cannot do, AI labor over the rest.
  function tasks(f, L, ai, rho) {
    if (f <= 0) return L;
    if (rho < -30) return Math.min(L / (1 - f), ai / f);
    return Math.pow(Math.pow(1 - f, 1 - rho) * Math.pow(L, rho) + Math.pow(f, 1 - rho) * Math.pow(ai, rho), 1 / rho);
  }

  function ces(share, x, y, sigma) {
    if (Math.abs(sigma - 1) < 1e-6) return Math.pow(x, share) * Math.pow(y, 1 - share);
    const r = (sigma - 1) / sigma;
    return Math.pow(share * Math.pow(x, r) + (1 - share) * Math.pow(y, r), 1 / r);
  }

  const automation = (p, v) => clamp(v.fmax * sig((p - v.p50) / v.width), 0, 0.9999);
  const tasteMult = (p, v) => Math.pow(v.taste, softplus(p - v.p50 - v.tasteOffset, 0.3));

  // Research effort relative to 2026 given capability p, automated fraction f and taste multiplier T.
  function effortAt(v, p, f, T) {
    const N = tasks(f, v.Lrel, v.aiLabor0 * Math.pow(10, p), v.rhoTasks) / v.N0;
    return ces(v.laborShare, N, Math.pow(10, v.chi * v.lgC), v.sigma) * T / v.T0;
  }

  // The same at another software level lnS, with compute and labor as in v (used to perturb S).
  function effort(v, lnS, withAI) {
    const p = v.chi * v.lgC + lnS / LN10;
    return withAI ? effortAt(v, p, automation(p, v), tasteMult(p, v)) : effortAt(v, p, 0, 1);
  }

  // Doublings of the time horizon after p OOM of effective compute.
  function doublings(p, v) {
    if (v.hSuper === 1) return p / v.dH;
    const x = 1 - p * (1 - v.hSuper) / v.dH;
    return x <= 0 ? Infinity : Math.log(x) / Math.log(v.hSuper);
  }

  /* ---------------------------------------------------------------- model declaration */

  // Stocks: [id, unit, sector, Spanish label, initial value, net flow]
  const STOCKS = [
    ['lnS', 'ln(×2026)', 'nucleo', 'Eficiencia de software', v => 0, v => v.gS],
    ['lnC', 'ln(M H100e)', 'fisico', 'Cómputo instalado', v => Math.log(v.C0), v => v.gC],
    ['lnL', 'ln(×2026)', 'nucleo', 'Investigadores', v => 0, v => rate(v.laborRates, v.t)],
    ['lnW', 'ln(M H100e/año)', 'fisico', 'Capacidad fabril', v => Math.log(v.F0), v => v.gW],
    ['Pw', 'GW', 'fisico', 'Potencia en operación', v => v.C0 * v.e0 * v.slackP0, v => v.pDone],
    ['Pb', 'GW', 'fisico', 'Potencia en obra', v => v.C0 * v.e0 * v.slackP0 * Math.log(v.gP0) * v.tauP, v => v.pStart - v.pDone],
    ['D1', 'fracción', 'economia', 'Adopción: pilotos', v => Math.min(v.Y0 / v.marketFull * v.difMomentum ** 2, 0.9 * sig(-(v.p50 + v.ecoGap) / v.ecoWidth)), v => 3 * (v.aEco - v.D1) / v.tauDif],
    ['D2', 'fracción', 'economia', 'Adopción: integración', v => v.Y0 / v.marketFull * v.difMomentum, v => 3 * (v.D1 - v.D2) / v.tauDif],
    ['D3', 'fracción', 'economia', 'Trabajo cognitivo desplegado en IA', v => v.Y0 / v.marketFull, v => 3 * (v.D2 - v.D3) / v.tauDif],
    ['gY', '1/año', 'economia', 'Crecimiento de ingresos percibido', v => Math.log(v.gY0), v => (v.gYnow - v.gY) / v.tauPerc],
    ['lnI', 'ln(mil M USD/año)', 'economia', 'Inversión en cómputo', v => Math.log(v.I0), v => Math.log(v.Iwant / Math.exp(v.lnI)) / v.tauI],
    ['gCp', '1/año', 'fisico', 'Crecimiento de cómputo percibido', v => Math.log(v.gCHist), v => v.gC - v.gCp],
    ['q', 'OOM', 'gobernanza', 'Conocimiento de seguridad', v => 0, v => v.dq],
    ['Hc', 'fracción', 'gobernanza', 'Preocupación pública', v => 0.1, v => v.incidents * (1 - v.Hc) - v.Hc / v.tauH],
    ['Gr', 'fracción', 'gobernanza', 'Regulación vigente', v => 0, v => (sig((v.Hc - v.hThreshold) / 0.08) - v.Gr) / v.tauReg],
    ['Lam', 'OOM', 'gobernanza', 'Ventaja del líder', v => v.lead0 * v.dp0, v => v.dp * (1 - v.xi) - v.Lam / v.tauLeak],
    ['vp', 'OOM/año', 'gobernanza', 'Ritmo de avance percibido', v => v.dp0, v => (v.dp - v.vp) / 0.25],
  ];

  // Auxiliaries, in evaluation order: [id, unit, sector, Spanish label, equation]
  const AUX = [
    // governance switches come first: they modulate the core
    ['deal', '0/1', 'gobernanza', 'Acuerdo vigente', v => (v.dealT !== null && v.t >= v.dealT ? 1 : 0)],
    ['leadMonths', 'meses', 'gobernanza', 'Ventaja del líder en meses', v => 12 * v.Lam / Math.max(v.vp, 0.05)],
    ['race', 'fracción', 'gobernanza', 'Presión de carrera', v => (v.deal ? 0 : 1 / (1 + (v.leadMonths / 6) ** 2))],
    ['safety', 'fracción', 'gobernanza', 'Esfuerzo en seguridad', v => clamp(v.sBase * (1 - v.rhoRace * v.race) + v.sReg * v.Gr + v.deal * v.dealSafety, 0, 0.6)],
    ['policy', '×', 'gobernanza', 'Freno de política a la I+D de capacidad', v => (v.deal ? (v.t < v.dealT + v.dealPause ? 0.05 : v.dealBrake) : 1)],
    // physical bottlenecks
    ['C', 'M H100e', 'fisico', 'Cómputo instalado', v => Math.exp(v.lnC)],
    ['lgC', 'OOM', 'fisico', 'Cómputo relativo a 2026', v => (v.lnC - Math.log(v.C0)) / LN10],
    ['F', 'M H100e/año', 'fisico', 'Producción posible de chips', v => Math.exp(v.lnW) * Math.pow(v.gChip, v.t - T_REF)],
    ['demand', 'M H100e/año', 'fisico', 'Demanda financiada de chips', v => Math.exp(v.lnI) / (v.price0 * Math.pow(v.gPrice, T_REF - v.t))],
    ['chips', 'M H100e/año', 'fisico', 'Chips entregados', v => Math.min(v.demand, v.F)],
    ['ePer', 'GW/M H100e', 'fisico', 'Potencia por unidad de cómputo', v => v.e0 * Math.pow(v.gEnergy, T_REF - v.t)],
    ['Cmax', 'M H100e', 'fisico', 'Cómputo que la potencia admite', v => v.Pw / v.ePer],
    ['install', 'M H100e/año', 'fisico', 'Cómputo instalado por año', v => Math.min(v.chips, Math.max(0, v.Cmax - v.C) / v.tauInst + v.delta * v.C)],
    ['limit', 'código', 'fisico', 'Qué limita el cómputo (0 demanda, 1 fábricas, 2 energía)', v => (v.install < v.chips * 0.999 ? 2 : v.F < v.demand ? 1 : 0)],
    ['gC', '1/año', 'fisico', 'Crecimiento del cómputo', v => {
      const g = v.computeExo ? rate(v.computeExo, v.t) : v.install / v.C - v.delta;
      return v.deal ? Math.min(g, Math.log(v.dealCompute)) : g;
    }],
    ['gW', '1/año', 'fisico', 'Expansión fabril', v => clamp((v.demand / v.F - 1) / v.tauFab, -0.2, Math.log(v.gFab))],
    ['pWant', 'GW', 'fisico', 'Potencia deseada al terminar la obra', v => v.ePer * Math.pow(v.gEnergy, -v.tauP) * v.C * Math.exp(Math.max(v.gCp, 0) * v.tauP) * v.slackP0],
    ['pStart', 'GW/año', 'fisico', 'Obras iniciadas', v => clamp((v.pWant - v.Pw - v.Pb) / 0.5, 0, Math.log(v.gPmax) * (1 - v.polFriction) * (1 - v.regBrake * v.Gr) * (v.Pw + v.Pb))],
    ['pDone', 'GW/año', 'fisico', 'Obras terminadas', v => v.Pb / v.tauP],
    // technical core
    ['Lrel', '×2026', 'nucleo', 'Investigadores', v => Math.exp(v.lnL)],
    ['p', 'OOM', 'nucleo', 'Capacidad (cómputo efectivo sobre 2026)', v => v.chi * v.lgC + v.lnS / LN10],
    ['f', 'fracción', 'nucleo', 'Fracción de la I+D automatizada', v => automation(v.p, v)],
    ['T', '×', 'nucleo', 'Criterio de investigación de la IA', v => tasteMult(v.p, v)],
    ['R', '×2026', 'nucleo', 'Esfuerzo de I+D', v => effortAt(v, v.p, v.f, v.T)],
    ['Rcf', '×2026', 'nucleo', 'Esfuerzo de I+D sin IA', v => effortAt(v, v.p, 0, 1)],
    ['mult', '×', 'nucleo', 'Multiplicador de progreso de la I+D', v => Math.pow(v.R / v.Rcf, v.lambda)],
    ['room', 'fracción', 'nucleo', 'Margen hasta el límite del software', v => Math.max(0, 1 - Math.max(0, v.lnS / LN10) / v.ceiling)],
    ['gS', '1/año', 'nucleo', 'Crecimiento de la eficiencia de software', v => (v.room <= 0 ? 0 : Math.min(GS_CAP, v.k * Math.pow(v.R, v.lambda) * Math.exp(-v.beta * v.lnS) * v.room * v.policy * (1 - v.safety) / (1 - v.sRef)))],
    ['dp', 'OOM/año', 'nucleo', 'Ritmo de avance de la capacidad', v => (v.chi * v.gC + v.gS) / LN10],
    ['accel', '×', 'nucleo', 'Aceleración atribuible a la IA', v => (v.chi * v.gC + v.gS) / (v.chi * v.gC + v.gS / v.mult)],
    ['gain', 'adim.', 'nucleo', 'Ganancia del lazo de automejora', v => {
      // G > 1 exactly when software growth speeds up as S rises with compute and labor held fixed
      if (v.room <= 1e-6) return 0;   // at the ceiling nothing can accelerate
      const h = 0.01;
      const eps = Math.log(effort(v, v.lnS + h, true) / v.R) / h;
      const roomUp = Math.max(1e-9, 1 - Math.max(0, (v.lnS + h) / LN10) / v.ceiling);
      const drag = v.beta - Math.log(roomUp / Math.max(v.room, 1e-9)) / h;
      return v.lambda * eps / drag;
    }],
    // observables
    ['horizon', 'min', 'observables', 'Horizonte temporal al 50%', v => Math.min(1e9, v.H0 * Math.pow(2, doublings(v.p, v)))],
    ['eciRate', 'pts/año', 'observables', 'Ritmo del índice ECI', v => v.eciSlope * v.dp],
    // economy and employment
    ['aEco', 'fracción', 'economia', 'Trabajo cognitivo automatizable', v => sig((v.p - v.p50 - v.ecoGap) / v.ecoWidth)],
    ['Y', 'mil M USD/año', 'economia', 'Ingresos de los laboratorios', v => v.marketFull * v.D3],
    ['gYnow', '1/año', 'economia', 'Crecimiento de los ingresos', v => 3 * (v.D2 - v.D3) / v.tauDif / v.D3],
    ['Iwant', 'mil M USD/año', 'economia', 'Inversión deseada', v => Math.min(v.iota * v.Y * Math.exp(clamp(v.gY, -1, 3) * v.planH), v.Imax)],
    // safety and governance
    ['gap', 'OOM', 'gobernanza', 'Brecha entre capacidad y seguridad', v => v.p - v.q],
    ['dq', 'OOM/año', 'gobernanza', 'Avance de la seguridad', v => {
      // safety keeps a share omega of the pace capabilities would have without AI, plus a share
      // epsSafety of what AI adds on top; with omega = epsSafety = 1 the gap stays constant
      const base = (v.chi * v.gC + v.gS / v.mult) / LN10;
      const raw = v.omega * Math.pow(v.safety / v.sRef, v.alphaS) * (base + v.epsSafety * (v.dp - base));
      return v.gap <= 0 ? Math.min(raw, v.dp) : raw;   // safety work cannot run ahead of the systems it studies
    }],
    ['incidents', '1/año', 'gobernanza', 'Incidentes', v => v.kInc * Math.max(0, v.gap) * Math.sqrt(v.D3 / (v.Y0 / v.marketFull))],
  ];

  // Feedback loops, for the diagram and the page. Each is a closed chain of variable ids.
  const LOOPS = [
    { id: 'R1', kind: 'R', name: 'Automatización de la I+D', path: ['lnS', 'p', 'f', 'R', 'gS', 'lnS'] },
    { id: 'R2', kind: 'R', name: 'Ingresos que compran cómputo', path: ['p', 'aEco', 'D3', 'Y', 'lnI', 'chips', 'lnC', 'p'] },
    { id: 'R3', kind: 'R', name: 'Carrera', path: ['dp', 'Lam', 'race', 'safety', 'gS', 'dp'] },
    { id: 'B1', kind: 'B', name: 'Ideas cada vez más difíciles', path: ['lnS', 'gS', 'lnS'] },
    { id: 'B2', kind: 'B', name: 'Cuello de cómputo de experimentos', path: ['f', 'R', 'gS', 'p', 'f'] },
    { id: 'B3', kind: 'B', name: 'Fábricas y energía', path: ['lnC', 'install', 'gC', 'lnC'] },
    { id: 'B4', kind: 'B', name: 'Freno regulatorio', path: ['gap', 'incidents', 'Hc', 'Gr', 'safety', 'gS', 'p', 'gap'] },
  ];

  // Milestones: [id, Spanish label, variable, threshold]
  const MILESTONES = [
    ['accel2', 'Aceleración de 2× atribuible a la IA', 'accel', 2],
    ['loop', 'Lazo autosostenido (ganancia mayor que 1)', 'gain', 1],
    ['m5', 'Multiplicador de I+D de 5×', 'mult', 5],
    ['auto99', 'I+D automatizada al 99%', 'f', 0.99],
    ['m25', 'Multiplicador de I+D de 25×', 'mult', 25],
    ['m250', 'Multiplicador de I+D de 250×', 'mult', 250],
    ['m2000', 'Multiplicador de I+D de 2000×', 'mult', 2000],
    ['eco99', 'Trabajo cognitivo automatizable al 99%', 'aEco', 0.99],
    ['dep50', 'Mitad del trabajo cognitivo desplegado en IA', 'D3', 0.5],
  ];

  /* ---------------------------------------------------------------- simulation */

  const STOCK_IDS = STOCKS.map(s => s[0]);
  const AUX_IDS = AUX.map(a => a[0]);
  const nS = STOCKS.length, nA = AUX.length;

  // Merge overrides on defaults and derive the constants fixed by the 2026 normalization.
  function prepare(overrides) {
    const v = Object.assign(defaults(), overrides || {});
    v.p50 = -v.width * Math.log((v.f0 / v.fmax) / (1 - v.f0 / v.fmax));
    v.N0 = tasks(v.f0, 1, v.aiLabor0, v.rhoTasks);
    v.T0 = tasteMult(0, v);
    v.k = Math.log(v.gS0);
    v.dp0 = (v.chi * Math.log(v.gCHist) + Math.log(v.gS0)) / LN10;
    v.iota = v.I0 / (v.Y0 * Math.exp(Math.log(v.gY0) * v.planH));
    v.sRef = v.sBase * (1 - v.rhoRace / (1 + (12 * v.lead0 / 6) ** 2));
    v.lgC = 0; v.Lrel = 1;
    v.mult0 = Math.pow(effort(v, 0, true) / effort(v, 0, false), v.lambda);
    return v;
  }

  function evalAux(v) {
    for (let i = 0; i < nA; i++) v[AUX[i][0]] = AUX[i][4](v);
  }

  function derivs(v, y, t, out) {
    v.t = t;
    for (let i = 0; i < nS; i++) v[STOCK_IDS[i]] = y[i];
    evalAux(v);
    for (let i = 0; i < nS; i++) out[i] = STOCKS[i][5](v);
  }

  // Forward run of the whole model from 2026. Returns monthly series and milestone dates.
  function run(overrides, opts) {
    opts = opts || {};
    const tEnd = opts.tEnd || 2045, dt = 1 / 48, every = 4;
    const v = prepare(overrides);
    let y = new Float64Array(nS);
    for (let i = 0; i < nS; i++) y[i] = STOCKS[i][4](v);
    const k1 = new Float64Array(nS), k2 = new Float64Array(nS), k3 = new Float64Array(nS), k4 = new Float64Array(nS), tmp = new Float64Array(nS);
    const steps = Math.round((tEnd - T_REF) / dt);
    const ids = STOCK_IDS.concat(AUX_IDS);
    const series = { t: [] };
    for (const id of ids) series[id] = [];
    const hitos = {};
    const prev = {};
    const record = t => {
      series.t.push(t);
      for (const id of ids) series[id].push(v[id]);
    };
    let t = T_REF;
    for (let n = 0; n <= steps; n++) {
      derivs(v, y, t, k1);
      for (const [id, , key, thr] of MILESTONES) {
        const x = v[key];
        if (!(id in hitos) && x >= thr) hitos[id] = n === 0 ? t : t - dt + dt * clamp((thr - prev[key]) / Math.max(x - prev[key], 1e-12), 0, 1);
        prev[key] = x;
      }
      if (n % every === 0) record(t);
      if (n === steps) break;
      // sub-step when software growth is explosive, so each sub-step moves ln S by at most ~0.05
      let left = dt, ts = t, first = true;
      while (left > 1e-12) {
        if (!first) derivs(v, y, ts, k1);
        first = false;
        const h = Math.min(left, Math.max(dt / 8192, 0.05 / Math.max(Math.abs(k1[0]), 1e-9)));
        for (let i = 0; i < nS; i++) tmp[i] = y[i] + 0.5 * h * k1[i];
        derivs(v, tmp, ts + 0.5 * h, k2);
        for (let i = 0; i < nS; i++) tmp[i] = y[i] + 0.5 * h * k2[i];
        derivs(v, tmp, ts + 0.5 * h, k3);
        for (let i = 0; i < nS; i++) tmp[i] = y[i] + h * k3[i];
        derivs(v, tmp, ts + h, k4);
        for (let i = 0; i < nS; i++) y[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
        left -= h; ts += h;
      }
      t = T_REF + (n + 1) * dt;
    }
    return { t: series.t, series, hitos, params: v };
  }

  // Technical core only, integrated backwards from 2026 with historical compute and labor growth.
  function history(overrides, tStart) {
    tStart = tStart || 2023;
    const v = prepare(overrides);
    const dt = -1 / 48, steps = Math.round((tStart - T_REF) / dt);
    const gL = Math.log(v.laborRates[0][1]), gC = Math.log(v.gCHist);
    const g = (lnS, t) => {
      v.lgC = gC * (t - T_REF) / LN10; v.Lrel = Math.exp(gL * (t - T_REF));
      const room = Math.max(0, 1 - Math.max(0, lnS / LN10) / v.ceiling);
      return Math.min(GS_CAP, v.k * Math.pow(effort(v, lnS, true), v.lambda) * Math.exp(-v.beta * lnS) * room);
    };
    const out = { t: [], p: [], f: [], mult: [], horizon: [], dp: [], eciRate: [], accel: [] };
    let lnS = 0;
    for (let n = 0; n <= steps; n++) {
      const t = T_REF + n * dt;
      if (n % 4 === 0) {
        const gS = g(lnS, t), p = v.chi * v.lgC + lnS / LN10;
        const mult = Math.pow(effort(v, lnS, true) / effort(v, lnS, false), v.lambda);
        out.t.push(t); out.p.push(p); out.f.push(automation(p, v)); out.mult.push(mult);
        out.horizon.push(v.H0 * Math.pow(2, doublings(p, v)));
        out.dp.push((v.chi * gC + gS) / LN10); out.eciRate.push(v.eciSlope * (v.chi * gC + gS) / LN10);
        out.accel.push((v.chi * gC + gS) / (v.chi * gC + gS / mult));
      }
      if (n === steps) break;
      const a = g(lnS, t), b = g(lnS + 0.5 * dt * a, t + 0.5 * dt), c = g(lnS + 0.5 * dt * b, t + 0.5 * dt), d = g(lnS + dt * c, t + dt);
      lnS += dt / 6 * (a + 2 * b + 2 * c + d);
    }
    for (const k in out) out[k].reverse();
    return out;
  }

  // Which variables each equation reads, found by running it once against a recording proxy.
  function dependencies(overrides) {
    const v = prepare(overrides);
    v.t = T_REF;
    for (const s of STOCKS) v[s[0]] = s[4](v);
    evalAux(v);
    const known = new Set(STOCK_IDS.concat(AUX_IDS));
    const seen = fn => {
      const reads = new Set();
      fn(new Proxy(v, { get: (o, key) => { if (known.has(key)) reads.add(key); return o[key]; } }));
      return [...reads];
    };
    const deps = {};
    for (const a of AUX) deps[a[0]] = seen(a[4]);
    for (const s of STOCKS) deps[s[0]] = seen(s[5]).filter(id => id !== s[0]);
    return deps;
  }

  // Value of a series at decimal year t (linear interpolation on the monthly grid).
  function at(result, id, t) {
    const x = (t - T_REF) * 12, i = clamp(Math.floor(x), 0, result.t.length - 2), s = result.series[id];
    return s[i] + (s[i + 1] - s[i]) * (x - i);
  }

  return { T_REF, PARAMS, STOCKS, AUX, LOOPS, MILESTONES, defaults, prepare, run, history, dependencies, at, rate, tasks, ces };
});
