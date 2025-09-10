// linea-vs-linea.js — Comparativa Línea vs Línea (KPIs, Rendimiento, Paretos, Crítica)
(function () {
  const host = document.getElementById("lvsl-mount");
  if (!host || host.dataset.mounted === "1") return;
  host.dataset.mounted = "1";

  // ============ Helpers básicos ============
  const normalize = (s) => (s ?? "")
    .toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim();

  const N = (v) => {
    const s = (v ?? "").toString().replace(/[%\s]/g, "").replace(",", ".");
    const n = Number(s);
    return isFinite(n) ? n : 0;
  };

  const fmt = (n, d = 2) => (isFinite(n) ? n : 0).toLocaleString("es-MX", {
    minimumFractionDigits: d, maximumFractionDigits: d
  });

  const fmtMXN = (n) => (isFinite(n) ? n : 0).toLocaleString("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2
  });

  const uniq = (a) => Array.from(new Set(a));
  const getVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();
  const hexA = (hex, a) => {
    const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return hex;
    const x = parseInt(m[1], 16);
    return `rgba(${(x >> 16) & 255},${(x >> 8) & 255},${x & 255},${a})`;
  };
  const yyyymm = (iso) => (iso || "").slice(0, 7); // YYYY-MM
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  // ============ Lectura tolerante de columnas ============
  const getLinea = (r) =>
    r?.linea ?? r?.Linea ?? r?.LINEA ?? r?.["Línea"] ?? r?.["Linea"] ?? r?.["Linea Full"] ?? r?.["Línea Full"];

  const getTeo = (r) =>
    N(r?.["Cantidad Teórica"] ?? r?.CantidadTeorica ?? r?.CTeorica ?? r?.CTEO ?? r?.teorica);

  const getReal = (r) =>
    N(r?.["Cantidad Real"] ?? r?.CantidadReal ?? r?.CReal ?? r?.CREAL ?? r?.real);

  const getCat = (r) =>
    r?.CategoriaMP ?? r?.Categoria ?? r?.["Categoría MP"] ?? r?.cat ?? "Otros";

  const getMP = (r) =>
    r?.MateriaPrima ?? r?.MP ?? r?.["Materia Prima"] ?? r?.["Materia prima"] ?? "";

  const getCostoMerma = (r) => N(
    r?.CostoMerma ?? r?.["CostoMerma"] ?? r?.["Costo Merma"] ?? r?.["Costo de merma"] ?? r?.["Costo total merma"] ?? 0
  );
  const getCostoUnit = (r) => N(
    r?.CostoUnitario ?? r?.["CostoUnitario"] ?? r?.["Costo Unitario"] ?? r?.["Costo unitario"] ??
    r?.["Costo kg"] ?? r?.["Precio unitario"] ?? r?.["Costo x kg"] ?? r?.["Costo x pieza"] ?? 0
  );

  // ============ Reglas especiales ============
  const LINE_BLACKLIST = [/co2\b/, /multiempaq/, /maquila.*preforma/, /maquila.*bevi/];
  const isExcludedLine = (name) => LINE_BLACKLIST.some(re => re.test(normalize(name)));

  const CAT_COMBINED_VAL = "__PRE_RESINA_PET__";
  const CAT_COMBINED_LABEL = "Preforma y Resina PET";
  const isPreformaPet = (c) => { const n = normalize(c); return n.includes("preforma") && n.includes("pet"); };
  const isResinaPet   = (c) => { const n = normalize(c); return n.includes("resina")   && n.includes("pet"); };

  // Conversión kg → piezas cuando se selecciona la categoría combinada y la fila es Resina.
  const RESINA_TO_PIEZAS = 1000 / 18.5;

  // ============ Dataset base ============
  function seedRows() {
    if (window.VMPS?.getAllRows) return window.VMPS.getAllRows();
    if (Array.isArray(window.VMPS?.rows)) return window.VMPS.rows;
    try { return JSON.parse(sessionStorage.getItem("VMPS") || "null")?.rows || []; } catch { return []; }
  }
  let BASE = seedRows();

  // ============ UI ============
  host.innerHTML = `
    <div class="grid grid--2" style="gap:16px;">
      <div>
        <label class="muted">Materia Prima (catálogo)</label>
        <select id="lvslCat" class="btn" style="width:100%"></select>

        <div style="margin-top:8px">
          <label class="muted">Subcategoría (opcional)</label>
          <select id="lvslSub" class="btn" style="width:100%"></select>
        </div>
      </div>

      <div>
        <label class="muted">Líneas</label>
        <div id="lvslChips" class="chips" style="flex-wrap:wrap;gap:8px;"></div>
      </div>
    </div>

    <div class="panel panel--ghost" style="margin-top:16px">
      <div class="muted" style="margin-bottom:8px;">Periodo</div>
      <div id="lvslMonthButtons" class="topbar" style="gap:8px; flex-wrap:wrap"></div>
      <div id="lvslCustomRange" class="topbar" style="gap:8px; flex-wrap:wrap; display:none; margin-top:8px;">
        <label class="muted" for="lvslDateStart">Inicio</label>
        <input id="lvslDateStart" type="date" class="btn" />
        <label class="muted" for="lvslDateEnd">Fin</label>
        <input id="lvslDateEnd" type="date" class="btn" />
        <button id="lvslApplyRange" class="btn" type="button">Aplicar</button>
        <button id="lvslClearRange" class="btn btn--ghost" type="button">Limpiar</button>
      </div>
    </div>

    <div class="grid grid--4 kpi-band" style="margin-top:16px">
      <div class="kpi"><div class="kpi__label">Cant. Teórica (Σ)</div><div class="kpi__value" id="kpTeo">0.00</div></div>
      <div class="kpi"><div class="kpi__label">Cant. Real (Σ)</div><div class="kpi__value" id="kpReal">0.00</div></div>
      <div class="kpi"><div class="kpi__label">Merma (Σ)</div><div class="kpi__value" id="kpMerma">0.00</div></div>
      <div class="kpi"><div class="kpi__label">% Merma = Merma/Real</div><div class="kpi__value" id="kpPct">0.00 %</div></div>
    </div>

    <!-- NUEVO: % Merma por tiempo -->
    <section class="panel" id="rendPanel" style="margin-top:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <h3 class="panel-title" style="margin:0;">% Merma por tiempo</h3>
        <div style="margin-left:auto;display:flex;gap:6px;">
          <button id="btnRGroup" class="btn">Conjunto</button>
          <button id="btnRSplit" class="btn btn--ghost">Separado por Lineas</button>
        </div>
      </div>
      <div style="height:320px"><canvas id="rendChart"></canvas></div>
      <div class="muted" style="margin-top:6px;font-size:12px">
         %Merma (filtrado por categoría, subcategoría y líneas).
      </div>
    </section>

    <section class="panel" style="margin-top:16px">
      <h3 class="panel-title">Pareto — Merma por línea (unidades)</h3>
      <div style="height:360px"><canvas id="pUnits"></canvas></div>
    </section>

    <section class="panel">
      <h3 class="panel-title">Pareto — % Merma por línea</h3>
      <div style="height:360px"><canvas id="pPct"></canvas></div>
    </section>

    <section class="panel" id="critPanel">
      <h3 class="panel-title">Línea crítica — impacto financiero</h3>
      <div id="critSummary" class="crit-sum">—</div>
      <div style="overflow-x:auto;margin-top:8px">
        <table class="table" id="critTable">
          <thead>
            <tr>
              <th>Línea</th>
              <th>Costo de merma (MXN)</th>
              <th>Merma (unidades)</th>
              <th>% Merma</th>
              <th>% del Real Producido</th>
            </tr>
          </thead>
          <tbody><tr><td colspan="5" class="muted">Sin datos…</td></tr></tbody>
        </table>
      </div>
    </section>
  `;

  // estilos mínimos
  (function ensureCSS(){
    if (document.getElementById("lvsl-css")) return;
    const s = document.createElement("style");
    s.id = "lvsl-css";
    s.textContent = `
      .chips{display:flex;align-items:center;gap:8px}
      .chip{padding:6px 10px;border:1px solid var(--border,#2a2a2a);border-radius:18px;cursor:pointer;background:#000;color:#e5e7eb;transition:background .15s}
      .chip--on{background:rgba(255,138,0,.22);border-color:var(--c-brand,#ff8a00);color:#fff}
      .kpi-band{display:grid;gap:12px}
      @media(min-width:980px){.kpi-band{grid-template-columns:repeat(4,1fr)}}
    `;
    document.head.appendChild(s);
  })();

  // ============ Refs ============
  const selCat = document.getElementById("lvslCat");
  const selSub = document.getElementById("lvslSub");
  selSub.innerHTML = `<option value="__ALL__">Todas las materias primas</option>`;
  selSub.value = "__ALL__";

  const chipsWrap = document.getElementById("lvslChips");
  const monthButtons = document.getElementById("lvslMonthButtons");
  const customRange  = document.getElementById("lvslCustomRange");
  const dateStart    = document.getElementById("lvslDateStart");
  const dateEnd      = document.getElementById("lvslDateEnd");
  const btnApply     = document.getElementById("lvslApplyRange");
  const btnClear     = document.getElementById("lvslClearRange");

  // Estado líneas & periodo
  let picked = new Set();
  let chipAllBtn = null;
  let lineButtons = [];
  const period = { mode: "month", monthKey: "", dateStart: "", dateEnd: "" };

  // ============ Categorías y subcategorías ============
  function buildCategories() {
    const catsRaw = uniq(BASE.map(getCat).filter(Boolean));
    const hasPre = catsRaw.some(isPreformaPet);
    const hasRes = catsRaw.some(isResinaPet);

    const cats = catsRaw
      .filter(c => !(isPreformaPet(c) || isResinaPet(c)))
      .sort((a,b)=>(""+a).localeCompare(""+b,"es"));

    if (hasPre || hasRes) cats.unshift(CAT_COMBINED_LABEL);

    // sin opción "Todas"
    selCat.innerHTML = cats
      .map(c => c === CAT_COMBINED_LABEL
        ? `<option value="${CAT_COMBINED_VAL}">${CAT_COMBINED_LABEL}</option>`
        : `<option>${c}</option>`).join("");

    const saved = sessionStorage.getItem("LVSL_CAT");
    if (saved && [...selCat.options].some(o=>o.value===saved || o.textContent===saved)) {
      selCat.value = saved;
    } else {
      selCat.value = cats.includes(CAT_COMBINED_LABEL) ? CAT_COMBINED_VAL : cats[0] || "";
      sessionStorage.setItem("LVSL_CAT", selCat.value);
    }
  }

  function buildSubcats(){
    if (!selSub) return;

    if (!Array.isArray(BASE) || BASE.length === 0) {
      selSub.innerHTML = `<option value="__ALL__">Todas las materias primas</option>`;
      selSub.value = "__ALL__";
      return;
    }

    const selVal = selCat.value;
    const inCat = (r) => {
      const c = getCat(r);
      if (selVal === CAT_COMBINED_VAL) return isPreformaPet(c) || isResinaPet(c);
      return c === selVal;
    };

    const mps = [...new Set(
      BASE.filter(inCat).map(getMP).filter(Boolean).map(s=>s.trim())
    )].sort((a,b)=>a.localeCompare(b,"es"));

    const saved = sessionStorage.getItem("LVSL_SUB");
    selSub.innerHTML =
      `<option value="__ALL__">Todas las materias primas</option>` +
      mps.map(mp => `<option>${mp}</option>`).join("");

    selSub.value = (saved && (saved==="__ALL__" || mps.includes(saved))) ? saved : "__ALL__";
  }

  selCat.addEventListener("change", ()=>{
    sessionStorage.setItem("LVSL_CAT", selCat.value);
    buildSubcats();
    render();
  });
  selSub.addEventListener("change", ()=>{
    sessionStorage.setItem("LVSL_SUB", selSub.value);
    render();
  });

  // ============ Chips de líneas ============
  function buildLineChips() {
    chipsWrap.innerHTML = "";
    lineButtons = [];

    const savedRaw = sessionStorage.getItem("LVSL_LINES");
    picked = new Set(savedRaw ? JSON.parse(savedRaw) : []);

    const allLines = uniq(
      BASE.map(getLinea).filter(Boolean).filter(L => !isExcludedLine(L))
    ).sort((a,b)=>(""+a).localeCompare(""+b,"es"));

    // botón "Todas"
    chipAllBtn = document.createElement("button");
    chipAllBtn.className = "chip";
    chipAllBtn.textContent = "Todas";
    chipsWrap.appendChild(chipAllBtn);

    // chips por línea
    allLines.forEach(L => {
      const btn = document.createElement("button");
      const active = (savedRaw === null) ? true : picked.has(L);
      if (active) picked.add(L);
      btn.className = "chip" + (active ? " chip--on" : "");
      btn.textContent = L;
      btn.onclick = () => { toggleLine(L, btn, allLines.length); };
      chipsWrap.appendChild(btn);
      lineButtons.push({ name: L, btn });
    });

    // toggle “Todas”
    chipAllBtn.onclick = () => {
      const total = allLines.length;
      if (picked.size === total) {
        picked.clear();
        for (const {btn} of lineButtons) btn.classList.remove("chip--on");
        chipAllBtn.classList.remove("chip--on");
      } else {
        picked = new Set(allLines);
        for (const {btn} of lineButtons) btn.classList.add("chip--on");
        chipAllBtn.classList.add("chip--on");
      }
      persistLines();
      render();
    };

    if (savedRaw === null) {
      picked = new Set(allLines);
      for (const {btn} of lineButtons) btn.classList.add("chip--on");
    }
    updateChipAllState(allLines.length);
  }
  function toggleLine(L, btn, total) {
    if (picked.has(L)) picked.delete(L); else picked.add(L);
    btn.classList.toggle("chip--on");
    updateChipAllState(total);
    persistLines();
    Promise.resolve().then(render);
  }
  function updateChipAllState(total) {
    const allOn = picked.size === total && total > 0;
    chipAllBtn.classList.toggle("chip--on", allOn);
  }
  function persistLines(){ sessionStorage.setItem("LVSL_LINES", JSON.stringify(Array.from(picked))); }

  // ============ Periodo ============
  function buildPeriodUI(rows){
    const months = [...new Set(rows.map(r => yyyymm(r.FechaISO)).filter(Boolean))].sort();

    // botones
    const frag = document.createDocumentFragment();
    const makeBtn = (txt, mk, ghost=false) => {
      const b = document.createElement("button");
      b.className = "btn" + (ghost ? " btn--ghost" : "");
      b.textContent = txt;
      b.dataset.mk = mk;
      frag.appendChild(b);
      return b;
    };
    makeBtn("Todas las fechas","ALL");
    makeBtn("Mes actual","NOW");
    months.forEach(mk=>{
      const [y,m] = mk.split("-");
      const MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
      makeBtn(`${MESES[parseInt(m,10)-1]||mk} ${y}`, mk);
    });
    makeBtn("Personalizado","CUSTOM", true);
    monthButtons.replaceChildren(frag);

    // límites inputs
    const dates = rows.map(r=>r.FechaISO).filter(Boolean).sort();
    const minISO = dates[0] || ""; const maxISO = dates[dates.length-1] || "";
    if (dateStart) { dateStart.min = minISO; dateStart.max = maxISO; }
    if (dateEnd)   { dateEnd.min   = minISO; dateEnd.max   = maxISO; }

    // default: mes actual si existe, si no el último, si no “Todas”
    const now = new Date();
    const mkNow = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    period.mode = "month";
    period.monthKey = months.includes(mkNow) ? mkNow : (months[months.length-1] || "");
    period.dateStart = period.dateEnd = "";
    customRange.style.display = "none";

    monthButtons.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
    const btnMk = monthButtons.querySelector(`.btn[data-mk="${period.monthKey}"]`);
    (btnMk || monthButtons.querySelector('.btn[data-mk="ALL"]'))?.classList.add("active");

    // handler
    monthButtons.onclick = (ev)=>{
      const btn = ev.target.closest("button.btn");
      if(!btn) return;

      monthButtons.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");

      if (btn.dataset.mk === "CUSTOM"){
        period.mode = "range";
        customRange.style.display = "";
        return;
      }

      period.mode = "month";
      customRange.style.display = "none";
      period.dateStart = period.dateEnd = "";

      if (btn.dataset.mk === "ALL"){
        period.monthKey = "";
      } else if (btn.dataset.mk === "NOW"){
        period.monthKey = months.includes(mkNow) ? mkNow : (months[months.length-1] || "");
      } else {
        period.monthKey = btn.dataset.mk || "";
      }
      render();
    };

    // rango
    btnApply.onclick = ()=>{
      const ds = dateStart.value || "";
      const de = dateEnd.value   || "";
      if (!ds && !de) {
        period.mode = "month"; period.monthKey = "";
        monthButtons.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
        monthButtons.querySelector('.btn[data-mk="ALL"]')?.classList.add("active");
        customRange.style.display = "none";
      } else {
        period.mode = "range"; period.dateStart = ds; period.dateEnd = de;
        monthButtons.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
        monthButtons.querySelector('.btn[data-mk="CUSTOM"]')?.classList.add("active");
      }
      render();
    };
    btnClear.onclick = ()=>{
      period.mode = "month"; period.monthKey = "";
      monthButtons.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
      monthButtons.querySelector('.btn[data-mk="ALL"]')?.classList.add("active");
      customRange.style.display = "none";
      dateStart.value = ""; dateEnd.value = "";
      render();
    };
  }

  // init filtros
  function populateFilters(){ buildCategories(); buildSubcats(); buildLineChips(); }
  populateFilters();
  buildPeriodUI(BASE);

  // ============ Filtrado por controles ============
  function filteredRows() {
    const sel = selCat.value;
    const sub = selSub?.value || "__ALL__";
    if (picked.size === 0) return [];
    const lines = picked;

    const applyDate = (r) => {
      if (period.mode === "month") {
        if (!period.monthKey) return true;
        return yyyymm(r.FechaISO) === period.monthKey;
      } else {
        const ds = period.dateStart || "";
        const de = period.dateEnd   || "";
        if (ds && (!r.FechaISO || r.FechaISO <  ds)) return false;
        if (de && (!r.FechaISO || r.FechaISO >  de)) return false;
        return true;
      }
    };
    const eq = (a,b)=> normalize(a) === normalize(b);

    return BASE.filter(r => {
      const L = getLinea(r);
      if (!L || !lines.has(L) || isExcludedLine(L)) return false;
      if (!applyDate(r)) return false;

      // categoría
      const c = getCat(r);
      if (sel === CAT_COMBINED_VAL) {
        if (!(isPreformaPet(c) || isResinaPet(c))) return false;
      } else if (c !== sel) return false;

      // subcategoría
      if (sub !== "__ALL__") {
        const mp = getMP(r);
        if (!mp || !eq(mp, sub)) return false;
      }
      return true;
    });
  }

  // ============ Métricas por fila, agregados ============
  function metricsForRow(r, selCatVal) {
    let teo = getTeo(r);
    let real = getReal(r);
    // conversión kg→piezas para Resina PET cuando usamos la categoría combinada
    if (selCatVal === CAT_COMBINED_VAL && isResinaPet(getCat(r))) {
      const k = RESINA_TO_PIEZAS; teo *= k; real *= k;
    }
    return { teo, real };
  }

  function aggregateByLine(rows) {
    const map = new Map();
    const selVal = selCat.value;

    for (const r of rows){
      const L = getLinea(r);
      if (!L) continue;

      const m = metricsForRow(r, selVal);
      const o = map.get(L) || { teo:0, real:0 };
      o.teo  += m.teo;
      o.real += m.real;
      map.set(L, o);
    }

    // merma = Real − Teórica (puede ser negativa según MP)
    for (const o of map.values()){
      o.merma = (o.real - o.teo);
      o.pct   = o.real > 0 ? (o.merma / o.real) * 100 : 0;
    }
    return map;
  }

  function aggregateFinance(rows){
    const map = new Map();
    const selVal = selCat.value;

    for (const r of rows){
      const L = getLinea(r); if (!L) continue;
      const m = metricsForRow(r, selVal);
      const mermaU = (m.real - m.teo);
      const cu = getCostoUnit(r);
      const cost = isFinite(cu) && cu > 0 ? (mermaU * cu) : getCostoMerma(r);
      const getOPE = (r) =>
        r?.OPE ?? r?.Op ?? r?.OP ?? r?.["No OPE"] ?? r?.["# OPE"] ??
        r?.["Orden Producción"] ?? r?.["Orden de Producción"] ?? r?.["Orden"] ?? "";


      const o = map.get(L) || { teo:0, real:0, cost:0 };
      o.teo  += m.teo;
      o.real += m.real;
      o.cost += cost;
      map.set(L, o);
    }
    return map;
  }

  // ============ Rendimiento (Conjunto / Separado) ============
  let charts = { rend:null, units:null, pct:null };

  let rendMode = sessionStorage.getItem("LVSL_REND_MODE") || "group";
  const btnRGroup = document.getElementById("btnRGroup");
  const btnRSplit = document.getElementById("btnRSplit");
  function setRendMode(m){
    rendMode = m;
    sessionStorage.setItem("LVSL_REND_MODE", m);
    btnRGroup.classList.toggle("btn--ghost", m !== "group");
    btnRSplit.classList.toggle("btn--ghost", m !== "split");
    renderRendChart();
  }
  btnRGroup.onclick = ()=> setRendMode("group");
  btnRSplit.onclick = ()=> setRendMode("split");
  setRendMode(rendMode);

  const PALETTE = ["#1f77b4","#d62728","#2ca02c","#9467bd","#17becf","#ff7f0e","#8c564b","#e377c2","#bcbd22","#7f7f7f"];
  function colorForLine(L, idx){
    const n = normalize(L);
    if (/^linea\s*8\b/.test(n) || /^l[ií]nea\s*8\b/.test(n)) return "#1f77b4"; // azul (agua)
    if (/^linea\s*7\b/.test(n) || /^l[ií]nea\s*7\b/.test(n)) return "#d62728"; // rojo (coca)
    if (/^linea\s*4\b/.test(n) || /^l[ií]nea\s*4\b/.test(n)) return "#2ca02c"; // verde (retornable)
    if (/^linea\s*1\b/.test(n) || /^l[ií]nea\s*1\b/.test(n)) return "#9467bd"; // naranja (retornable)
    if (/^linea\s*2\b/.test(n) || /^l[ií]nea\s*2\b/.test(n)) return "#17becf"; // azul cielo 
    if (/^linea\s*3\b/.test(n) || /^l[ií]nea\s*3\b/.test(n)) return "#bcbd22"; // amarillo (valle)
    if (/^linea\s*6\b/.test(n) || /^l[ií]nea\s*6\b/.test(n)) return "#7f7f7f"; // vidrio (valle)
    if (/^linea\s*10\b/.test(n) || /^l[ií]nea\s*10\b/.test(n)) return "#e377c2"; // vidrio (valle)
    return PALETTE[idx % PALETTE.length];
  }

  function spanDays(aISO, bISO){
    return Math.max(0, Math.round((new Date(bISO) - new Date(aISO)) / 86400000));
  }

  function timeBucketer(rows){
    const dates = rows.map(r=>r.FechaISO).filter(Boolean).sort();
    if (!dates.length) return { scale:"day", keyOf:()=>"", keys:[] };
    const scale = spanDays(dates[0], dates[dates.length-1]) > 93 ? "month" : "day";
    const keyOf = scale === "month" ? (r)=> yyyymm(r.FechaISO) : (r)=> (r.FechaISO || "");
    const keys = [...new Set(rows.map(keyOf).filter(Boolean))].sort();
    return { scale, keyOf, keys };
  }

  // 👇 reemplaza TODA tu función buildRendDatasets por esta
    function buildRendDatasets(rows){
      const { keyOf, keys } = timeBucketer(rows);
      const selVal = selCat.value;

      // helper: arma puntos (valor + opes) para un filtro de filas
      const pointsFor = (rowFilter) => keys.map(k => {
        let teo = 0, real = 0;
        const seen = new Set();
        for (const r of rows) {
          if (keyOf(r) !== k) continue;
          if (rowFilter && !rowFilter(r)) continue;
          const m = metricsForRow(r, selVal); teo += m.teo; real += m.real;
          const op = (r.OPE ?? r.Op ?? r.OP ?? r["No OPE"] ?? r["# OPE"] ??
                      r["Orden Producción"] ?? r["Orden de Producción"] ?? r["Orden"] ?? "");
          if (op) seen.add(String(op));
        }
        // % merma (2 decimales). Si necesitas rendimiento, cambia la fórmula.
        const pct = real > 0 ? ((real - teo) / real * 100) : 0;
        return { y: +pct.toFixed(2), opes: [...seen] };
      });

      // MODO CONJUNTO: una sola serie
      if (rendMode === "group"){
        const pts = pointsFor(null);
        const brand = getVar("--c-brand") || "#ff8a00";
        return {
          labels: keys,
          datasets: [{
            label: "% Merma (conjunto)",
            data: pts.map(p => p.y),
            opesList: pts.map(p => p.opes),  // <-- paralelo a data
            spanGaps: true, tension: .25, pointRadius: 2,
            borderColor: brand, backgroundColor: hexA(brand,.2), fill: false
          }]
        };
      }

    // MODO SEPARADO: una serie por línea (máx. 10)
    const lines = [...new Set(rows.map(getLinea).filter(Boolean))]
      .sort((a,b)=>(""+a).localeCompare(""+b,"es"))
      .slice(0,10);

    const datasets = lines.map((L,i)=>{
      const pts = pointsFor(r => getLinea(r) === L);
      const col = colorForLine(L,i);
      return {
        label: L,
        data: pts.map(p => p.y),
        opesList: pts.map(p => p.opes),     // <-- paralelo a data
        spanGaps: true, tension: .25, pointRadius: 0,
        borderColor: col, backgroundColor: hexA(col,.2)
      };
    }).filter(ds => ds.data.some(v => Number.isFinite(v) && Math.abs(v) > 1e-9));

    return { labels: keys, datasets };
  }

  function renderRendChart(){
    const rows = filteredRows();
    const ctx = document.getElementById("rendChart")?.getContext("2d");
    if (!ctx) return;

    if (charts.rend) charts.rend.destroy();

    const cfg = buildRendDatasets(rows);

    
      // --- LÍNEA BASE EN 0 ---
      const ZERO_LABEL = "0%";
      cfg.datasets.push({
        label: ZERO_LABEL,                 // la ocultamos del legend con filter
        data: (cfg.labels || []).map(()=> 0),
        type: "line",
        borderColor: "#ff4d4d",            // rojo base
        borderWidth: 1,
        pointRadius: 0,
        hitRadius: 0,
        hoverRadius: 0,
         borderDash: [6, 6],
        fill: false,
        order: 0,                          // detrás de las demás
        clip: false
      });


    const tick = getVar("--c-text-dim") || "#cfd3da";
    const grid = "rgba(255,255,255,.08)";

    
    charts.rend = new Chart(ctx, {
      type: "line",
      data: cfg,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { /* ... */ },
          tooltip: {
            filter: (ctx) => {
              const lbl = ctx.dataset?.label || "";
              if (lbl === "0%" || lbl === "__ZERO_BASE__") return false; // oculta línea 0
              const v = Number(ctx.parsed?.y);
              return Number.isFinite(v) && Math.abs(v) > 1e-9;            // oculta valores 0
            },
            callbacks: {
              label: (ctx) => {
                const name = ctx.dataset?.label ?? "";
                const v = Number(ctx.parsed?.y);
                const num = v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return `${name}: ${num}%`;
              },
              afterBody: (items) => {
                const it = items?.[0]; if (!it) return [];
                const ds = it.dataset || {}; const idx = it.dataIndex;
                const ops = (ds.opesList && ds.opesList[idx]) ? ds.opesList[idx] : [];
                if (!ops.length) return [];
                const MAX = 12;
                const view = ops.slice(0, MAX);
                const extra = ops.length > MAX ? `… (+${ops.length - MAX} más)` : null;
                return ["OPE(s):", ...view.map(x => "• " + x), ...(extra ? [extra] : [])];
              }
            }
          }
        }
        ,
        scales: {
          x: { ticks: { color: tick }, grid: { color: grid } },
          y: {
            beginAtZero: true,
            ticks: {
              color: tick,
              // eje Y con porcentaje (puedes dejar 0 decimales aquí si quieres)
              callback: (v) =>
                Number(v).toLocaleString("es-MX", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0
                }) + "%"
            },
            grid: { color: grid },
            title: { display: true, text: "Merma (%)", color: tick }
          }
        }
      }
    });
  }

  // ============ Render principal ============
  function render(){
    const rows = filteredRows();
    const byLine = aggregateByLine(rows);

    // KPIs globales
    const tot = [...byLine.values()].reduce((acc,o)=>({teo:acc.teo+o.teo, real:acc.real+o.real, merma:acc.merma+o.merma}), {teo:0,real:0,merma:0});
    const pct = tot.real > 0 ? (tot.merma / tot.real) * 100 : 0;
    document.getElementById("kpTeo").textContent   = fmt(tot.teo);
    document.getElementById("kpReal").textContent  = fmt(tot.real);
    document.getElementById("kpMerma").textContent = fmt(tot.merma);
    document.getElementById("kpPct").textContent   = fmt(pct) + " %";

    // Render rendimiento
    renderRendChart();

    // Colores
    const brand = getVar("--c-brand") || "#ff8a00";
    const lineColor = getVar("--c-brand-300") || "#FFA366";
    const grid = "rgba(255,255,255,.08)";
    const tick = getVar("--c-text-dim") || "#cfd3da";

    // Pareto UNIDADES
    const e1 = [...byLine.entries()].sort((a,b)=> b[1].merma - a[1].merma);
    const L1 = e1.map(([L])=>L);
    const V1 = e1.map(([,o])=> o.merma);
    const T1 = V1.reduce((s,v)=> s+v, 0);
    let acc1 = 0;
    const C1 = V1.map(v => { acc1 += v; return T1>0 ? +(acc1 / T1 * 100).toFixed(2) : 0; });
    const yMax1 = T1 > 0 ? T1 : 1;

    const ctx1 = document.getElementById("pUnits").getContext("2d");
    if (charts.units) charts.units.destroy();
    const grad1 = ctx1.createLinearGradient(0,0,0,300);
    grad1.addColorStop(0, brand); grad1.addColorStop(1, hexA(brand,.25));
    charts.units = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: L1,
        datasets: [
          { type:"bar",  order:2, label:"Merma (unidades)", data:V1,
            backgroundColor:grad1, borderColor:brand, borderWidth:1.2, borderRadius:8, yAxisID:"y" },
          { type:"line", order:1, label:"Acumulado (%)", data:C1,
            borderColor:lineColor, backgroundColor:lineColor, tension:.25, pointRadius:2, yAxisID:"y1" }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false, interaction:{ mode:"index", intersect:false },
        plugins:{ legend:{ labels:{ color: tick, usePointStyle:true } } },
        scales:{
          x:{ ticks:{ color:tick }, grid:{ color:grid } },
          y:{ beginAtZero:true, min:0, max:yMax1,
              ticks:{ color:tick, callback:v=>Number(v).toLocaleString("es-MX") },
              grid:{ color:grid }, title:{ display:true, text:"Unidades", color:tick } },
          y1:{ beginAtZero:true, min:0, max:100,
              ticks:{ color:tick, callback:v=>v+"%" }, grid:{ drawOnChartArea:false },
              position:"right", title:{ display:true, text:"% acumulado", color:tick } }
        }
      }
    });

    // Pareto % MERMA
    const e2 = [...byLine.entries()].sort((a,b)=> b[1].pct - a[1].pct);
    const L2 = e2.map(([L])=>L);
    const V2 = e2.map(([,o])=> o.pct);
    const S2 = V2.reduce((s,v)=> s+v, 0);
    let acc2 = 0;
    const A2 = V2.map(v => { acc2 += v; return S2>0 ? +(acc2 / S2 * 100).toFixed(2) : 0; });
    const yMax2 = S2 > 0 ? S2 : 1;

    const ctx2 = document.getElementById("pPct").getContext("2d");
    if (charts.pct) charts.pct.destroy();
    const grad2 = ctx2.createLinearGradient(0,0,0,300);
    grad2.addColorStop(0, brand); grad2.addColorStop(1, hexA(brand,.25));
    charts.pct = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: L2,
        datasets: [
          { type:"bar",  order:2, label:"% Merma (merma/real)", data:V2,
            backgroundColor:grad2, borderColor:brand, borderWidth:1.2, borderRadius:8, yAxisID:"y" },
          { type:"line", order:1, label:"Acumulado (%) relativo a Σ barras", data:A2,
            borderColor:lineColor, backgroundColor:lineColor, tension:.25, pointRadius:2, yAxisID:"y1" }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false, interaction:{ mode:"index", intersect:false },
        plugins:{ legend:{ labels:{ color: tick, usePointStyle:true } },
          tooltip:{ callbacks:{ label:(ctx)=> {
            const v = +ctx.parsed.y;
            return `${ctx.dataset.label}: ${Number.isFinite(v) ? v.toFixed(2) : v}%`;
          }}} },
        scales:{
          x:{ ticks:{ color:tick }, grid:{ color:grid } },
          y:{ min:0, max:yMax2,
              ticks:{ color:tick, callback: (v)=> `${(+v).toFixed(2)}%`}, grid:{ color:grid },
              title:{ display:true, text:"Suma de % merma (barras)", color:tick } },
          y1:{ min:0, max:100, position:"right",
              ticks:{ color:tick, callback: (v)=> `${(+v).toFixed(2)}%`}, grid:{ drawOnChartArea:false },
              title:{ display:true, text:"% acumulado relativo", color:tick } }
        }
      }
    });

    // Línea crítica ($)
    renderCritical(aggregateFinance(rows));
  }

  function renderCritical(finMap){
    const tbody = document.querySelector("#critTable tbody");
    const summary = document.getElementById("critSummary");

    const arr = [...finMap.entries()].map(([L,o])=>({ linea:L, ...o }));
    if (!arr.length){
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin datos…</td></tr>`;
      summary.textContent = "—";
      return;
    }

    const totalReal  = arr.reduce((s,o)=> s+o.real ,0);
    const totalCost  = arr.reduce((s,o)=> s+o.cost ,0); // por si se usa después

    for (const o of arr){
      o.merma    = (o.real - o.teo);
      o.pctMerma = o.real > 0 ? (o.merma/o.real*100) : 0;
      o.shareR   = totalReal>0 ? (o.real/totalReal*100) : 0;
    }

    arr.sort((a,b)=> b.cost - a.cost);

    const top = arr[0];
    summary.innerHTML = `
      <span>La línea más crítica es <b>${top.linea}</b>.</span>
      <span>Impacto estimado: <b>${fmtMXN(top.cost)}</b></span>
      <span>Merma: <b>${fmt(top.merma,2)}</b> u. (${fmt(top.pctMerma,2)}%)</span>
      <span>Participa el <b>${fmt(top.shareR,1)}%</b> del Total Real Producido.</span>
    `;

    const top5 = arr.slice(0,5);
    tbody.innerHTML = top5.map(o=>`
      <tr>
        <td>${o.linea}</td>
        <td>${fmtMXN(o.cost)}</td>
        <td>${fmt(o.merma,2)}</td>
        <td>${fmt(o.pctMerma,2)}%</td>
        <td>${fmt(o.shareR,1)}%</td>
      </tr>`).join("");
  }

  // primer render
  render();

  // cuando cambie el dataset base
  window.addEventListener("vmps:update", ()=>{
    BASE = seedRows();
    populateFilters();
    buildPeriodUI(BASE);
    render();
  });
})();
