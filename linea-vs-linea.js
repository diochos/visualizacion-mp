// linea-vs-linea.js — Comparativa Línea vs Línea (unidades y % merma) — v3
(function () {
  const host = document.getElementById("lvsl-mount");
  if (!host || host.dataset.mounted === "1") return;
  host.dataset.mounted = "1";

  // ---------- helpers ----------
  const normalize = (s) => (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const N = (v) => {
    const s = (v ?? "").toString().replace(/[%\s]/g, "").replace(",", ".");
    const n = Number(s);
    return isFinite(n) ? n : 0;
  };
  const fmt = (n, d = 2) => (isFinite(n) ? n : 0).toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
  const uniq = (a) => Array.from(new Set(a));
  const getVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();
  const hexA = (hex, a) => {
    const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return hex;
    const x = parseInt(m[1], 16);
    return `rgba(${(x >> 16) & 255},${(x >> 8) & 255},${x & 255},${a})`;
  };
  const niceCeilPctSum = (x) => {
    if (!isFinite(x) || x <= 0) return 1;
    if (x < 5) return Math.ceil(x * 2) / 2;
    if (x < 10) return Math.ceil(x);
    if (x < 20) return Math.ceil(x / 2) * 2;
    if (x < 50) return Math.ceil(x / 5) * 5;
    return Math.ceil(x / 10) * 10;
  };
  const yyyymm = (iso) => (iso || "").slice(0, 7); // YYYY-MM

  // --- Moneda (MXN)
    const fmtMXN = (n)=> (isFinite(n)?n:0).toLocaleString("es-MX",{ style:"currency", currency:"MXN", minimumFractionDigits:2, maximumFractionDigits:2 });

    // --- Lectura tolerante de costos (del parser)
    const getCostoMerma = (r)=> N(
    r?.CostoMerma ?? r?.["CostoMerma"] ?? r?.["Costo Merma"] ?? r?.["Costo de merma"] ?? r?.["Costo total merma"] ?? 0
    );
    const getCostoUnit  = (r)=> N(
    r?.CostoUnitario ?? r?.["CostoUnitario"] ?? r?.["Costo Unitario"] ?? r?.["Costo unitario"] ??
    r?.["Costo kg"] ?? r?.["Precio unitario"] ?? r?.["Costo x kg"] ?? r?.["Costo x pieza"] ?? 0
    );



  // columnas tolerantes
  const getLinea = (r) => r?.linea ?? r?.Linea ?? r?.LINEA ?? r?.["Línea"] ?? r?.["Linea"] ?? r?.["Linea Full"] ?? r?.["Línea Full"];
  const getTeo   = (r) => N(r?.["Cantidad Teórica"] ?? r?.CantidadTeorica ?? r?.CTeorica ?? r?.CTEO ?? r?.teorica);
  const getReal  = (r) => N(r?.["Cantidad Real"] ?? r?.CantidadReal ?? r?.CReal ?? r?.CREAL ?? r?.real);
  
  
    // Ya NO usamos el campo "Merma" del dataset aquí.
    // La merma se calcula siempre desde Teórica/Real.
    const getMermaField = () => 0; // placeholder para no romper referencias antiguas

    // En esta página calcularemos la merma con |Real - Teórica|,
    // así funciona tanto para Etiquetas (Real > Teórica) como para otros casos.
    const calcMermaFrom = (teo, real) => (real - teo); // permite merma negativa

  
  const getCat = (r) => r?.CategoriaMP ?? r?.Categoria ?? r?.["Categoría MP"] ?? r?.cat ?? "Otros";

  // ---------- reglas especiales ----------
  const LINE_BLACKLIST = [/co2\b/, /multiempaq/, /maquila.*preforma/, /maquila.*bevi/];
  const isExcludedLine = (name) => LINE_BLACKLIST.some(re => re.test(normalize(name)));

  const CAT_COMBINED_VAL = "__PRE_RESINA_PET__";
  const CAT_COMBINED_LABEL = "Preforma + Resina PET";
  const isPreformaPet = (c) => { const n = normalize(c); return n.includes("preforma") && n.includes("pet"); };
  const isResinaPet   = (c) => { const n = normalize(c); return n.includes("resina")   && n.includes("pet"); };
  const RESINA_TO_PIEZAS = 1000 / 18.5; // kg → piezas

  // ---------- datos base: SIEMPRE todas las filas ----------
  function seedRows() {
    if (window.VMPS?.getAllRows) return window.VMPS.getAllRows();
    if (Array.isArray(window.VMPS?.rows)) return window.VMPS.rows;
    try { return JSON.parse(sessionStorage.getItem("VMPS") || "null")?.rows || []; } catch { return []; }
  }
  let BASE = seedRows();

  // ---------- UI ----------
  host.innerHTML = `
    <div class="grid grid--2" style="gap:16px;">
      <div>
        <label class="muted">Materia Prima (catálogo)</label>
        <select id="lvslCat" class="btn" style="width:100%"></select>
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

  // refs filtros
  const selCat = document.getElementById("lvslCat");
  const chipsWrap = document.getElementById("lvslChips");

  // refs periodo
  const monthButtons = document.getElementById("lvslMonthButtons");
  const customRange  = document.getElementById("lvslCustomRange");
  const dateStart    = document.getElementById("lvslDateStart");
  const dateEnd      = document.getElementById("lvslDateEnd");
  const btnApply     = document.getElementById("lvslApplyRange");
  const btnClear     = document.getElementById("lvslClearRange");

  // estado líneas
  let picked = new Set();
  let chipAllBtn = null;
  let lineButtons = []; // [{name, btn}]

  // estado periodo (igual que consumo)
  const period = { mode: "month", monthKey: "", dateStart: "", dateEnd: "" };

  // --------- categorías ----------
  function buildCategories() {
    const catsRaw = uniq(BASE.map(getCat).filter(Boolean));
    const hasPre = catsRaw.some(isPreformaPet);
    const hasRes = catsRaw.some(isResinaPet);

    const cats = catsRaw
      .filter(c => !(isPreformaPet(c) || isResinaPet(c)))
      .sort((a,b)=>(""+a).localeCompare(""+b,"es"));

    if (hasPre || hasRes) cats.unshift(CAT_COMBINED_LABEL);

    selCat.innerHTML = `<option value="__ALL__">Todas</option>` + 
      cats.map(c => c === CAT_COMBINED_LABEL
        ? `<option value="${CAT_COMBINED_VAL}">${CAT_COMBINED_LABEL}</option>`
        : `<option>${c}</option>`).join("");

    const savedCat = sessionStorage.getItem("LVSL_CAT");
    if (savedCat && (savedCat==="__ALL__" || savedCat===CAT_COMBINED_VAL || cats.includes(savedCat))) {
      selCat.value = savedCat;
    }
  }

  // --------- chips (FIX: onclick de “Todas” FUERA del forEach y btn.onclick restaurado) ----------
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
      btn.onclick = () => { toggleLine(L, btn, allLines.length); }; // <- RESTAURADO
      chipsWrap.appendChild(btn);
      lineButtons.push({ name: L, btn });
    });

    // toggle de “Todas” (FUERA del forEach)
    chipAllBtn.onclick = () => {
      const total = allLines.length;
      if (picked.size === total) {
        // dejar NINGUNA
        picked.clear();
        for (const {btn} of lineButtons) btn.classList.remove("chip--on");
        chipAllBtn.classList.remove("chip--on");
      } else {
        // seleccionar TODO
        picked = new Set(allLines);
        for (const {btn} of lineButtons) btn.classList.add("chip--on");
        chipAllBtn.classList.add("chip--on");
      }
      persistLines();
      render();
    };

    // primera vez (sin clave) → todas
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
  selCat.addEventListener("change", ()=>{ sessionStorage.setItem("LVSL_CAT", selCat.value); render(); });

  // --------- PERIODO (clonado del flujo de consumo) ----------
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

    // límites para inputs
    const dates = rows.map(r=>r.FechaISO).filter(Boolean).sort();
    const minISO = dates[0] || ""; const maxISO = dates[dates.length-1] || "";
    if (dateStart) { dateStart.min = minISO; dateStart.max = maxISO; }
    if (dateEnd)   { dateEnd.min   = minISO; dateEnd.max   = maxISO; }

    // default (igual que consumo): seleccionar mes actual si existe, si no el último; si no, “Todas”
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

      // month mode
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

    // rango personalizado
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

  // --------- init filtros ----------
  function populateFilters() { buildCategories(); buildLineChips(); }
  populateFilters();
  buildPeriodUI(BASE);

  // ---------- agregación ----------
  function filteredRows() {
    const sel = selCat.value;
    // líneas
    if (picked.size === 0) return [];
    const lines = picked;

    // fecha
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

    return BASE.filter(r => {
      const L = getLinea(r);
      if (!L || !lines.has(L) || isExcludedLine(L)) return false;
      if (!applyDate(r)) return false;

      if (sel === "__ALL__") return true;
      const c = getCat(r);
      if (sel === CAT_COMBINED_VAL) return isPreformaPet(c) || isResinaPet(c);
      return c === sel;
    });
  }

  function metricsForRow(r, selCatVal) {
        let teo = getTeo(r);
        let real = getReal(r);
        // Conversión kg→piezas SOLO para Resina PET cuando usamos la categoría combinada
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

            const m = metricsForRow(r, selVal); // {teo, real}
            const o = map.get(L) || { teo:0, real:0 };
            o.teo  += m.teo;
            o.real += m.real;
            map.set(L, o);
        }

        // Ahora calculamos MERMA por línea como |ΣReal − ΣTeo|
        for (const o of map.values()){
            o.merma = calcMermaFrom(o.teo, o.real);
            o.pct   = o.real > 0 ? (o.merma / o.real) * 100 : 0;
        }
        return map;
    }

// Agrega por línea: real, merma (en unidades ya normalizadas) y costo de merma (MXN)
    function aggregateFinance(rows){
    const map = new Map();
    const selVal = selCat.value;

    for (const r of rows){
        const L = getLinea(r); if (!L) continue;

        // mismas reglas de unidades que el resto de la página
        const m = metricsForRow(r, selVal);                 // {teo, real} (ya convierte Resina→piezas si procede)
        const mermaU = calcMermaFrom(m.teo, m.real);        // |ΣReal − ΣTeo| en unidades “vista”
        // costo: si hay unitario confiable, recalculamos con nuestra merma; si no, usamos CostoMerma del dataset
        const cu  = getCostoUnit(r);
        let cost  = isFinite(cu) && cu > 0 ? (mermaU * cu) : getCostoMerma(r);

        const o = map.get(L) || { teo:0, real:0, cost:0 };
        o.teo  += m.teo;
        o.real += m.real;
        // el costo sí se suma por registro:
        o.cost += (isFinite(cu)&&cu>0 ? (mermaU*cu) : getCostoMerma(r));

        map.set(L, o);
    }
    return map;
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
    const totalCost  = arr.reduce((s,o)=> s+o.cost ,0);

    // métricas derivadas
    for (const o of arr){
        o.merma    = (o.real - o.teo);                 // antes: Math.abs(...)
        o.pctMerma = o.real > 0 ? (o.merma/o.real*100) : 0;

        o.shareR   = totalReal>0 ? (o.real/totalReal*100) : 0;
    }

    // ordenar por mayor impacto $
    arr.sort((a,b)=> b.cost - a.cost);

    // resumen “línea crítica”
    const top = arr[0];
    summary.innerHTML = `
        <span>La línea más crítica es <b>${top.linea}</b>.</span>
        <span>Impacto estimado: <b>${fmtMXN(top.cost)}</b></span>
        <span>Merma: <b>${fmt(top.merma,2)}</b> u. (${fmt(top.pctMerma,2)}%)</span>
        <span>Participa el <b>${fmt(top.shareR,1)}%</b> del Total Real Producido.</span>
    `;

    // tabla (Top 5)
    const top5 = arr.slice(0,5);
    tbody.innerHTML = top5.map(o=>`
        <tr>
        <td>${o.linea}</td>
        <td>${fmtMXN(o.cost)}</td>
        <td>${fmt(o.merma,2)}</td>
        <td>${fmt(o.pctMerma,2)}%</td>
        <td>${fmt(o.shareR,1)}%</td>
        </tr>
    `).join("");
    }

  // ---------- render ----------
  let charts = { units:null, pct:null };

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

    // colores
    const brand = getVar("--c-brand") || "#ff8a00";
    const lineColor = getVar("--c-brand-300") || "#FFA366";
    const grid = "rgba(255,255,255,.08)";
    const tick = getVar("--c-text-dim") || "#cfd3da";

    // Pareto unidades
 
   // === Pareto UNIDADES (idéntico enfoque a graficas.js) ===
    const e1 = [...byLine.entries()].sort((a,b)=> b[1].merma - a[1].merma);
    const L1 = e1.map(([L])=>L);
    const V1 = e1.map(([,o])=> o.merma);

    // suma de barras (altura del eje izquierdo) y acumulado relativo
    const T1 = V1.reduce((s,v)=> s+v, 0);
    let acc1 = 0;
    const C1 = V1.map(v => {
    acc1 += v;
    return T1>0 ? +(acc1 / T1 * 100).toFixed(2) : 0;  // acumulado relativo a Σ barras
    });
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

    // === Pareto % MERMA (idéntico enfoque a graficas.js) ===
    const e2 = [...byLine.entries()].sort((a,b)=> b[1].pct - a[1].pct);
    const L2 = e2.map(([L])=>L);
    const V2 = e2.map(([,o])=> o.pct);   // barras en % (merma/real*100)

    // suma de barras (altura del eje izquierdo) y acumulado relativo
    const S2 = V2.reduce((s,v)=> s+v, 0);
    let acc2 = 0;
    const A2 = V2.map(v => {
    acc2 += v;
    return S2>0 ? +(acc2 / S2 * 100).toFixed(2) : 0; // acumulado relativo a Σ barras
    });
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
        // Eje izquierdo = suma de % de las barras (no 100)
        y:{ min:0, max:yMax2,
            ticks:{ color:tick, callback: (v)=> `${(+v).toFixed(2)}%`}, grid:{ color:grid },
            title:{ display:true, text:"Suma de % merma (barras)", color:tick } },
        // Eje derecho = 0–100% (acumulado relativo)
        y1:{ min:0, max:100, position:"right",
            ticks:{ color:tick, callback: (v)=> `${(+v).toFixed(2)}%`}, grid:{ drawOnChartArea:false },
            title:{ display:true, text:"% acumulado relativo", color:tick } }
        }
    }
    });

    // --- Línea crítica (impacto financiero)
    const fin = aggregateFinance(rows);
    
    renderCritical(fin);





  }

  // primer render
  render();

  // cuando cambie el dataset global: siempre releemos TODO, reconstruimos meses/chips
  window.addEventListener("vmps:update", ()=>{
    BASE = seedRows();
    populateFilters();
    buildPeriodUI(BASE);
    render();
  });

  function populateFilters(){ buildCategories(); buildLineChips(); }
})();

// --- EXPORT HELPERS (PNG / CSV) ---
function __exportCanvasPNG(canvas, filenameBase = "grafica") {
  if (!canvas) return;
  const bg = getComputedStyle(document.body).getPropertyValue("background-color") || "#111";
  const tmp = document.createElement("canvas");
  tmp.width  = canvas.width;
  tmp.height = canvas.height;
  const ctx = tmp.getContext("2d");
  ctx.fillStyle = bg || "#111";
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(canvas, 0, 0);
  const a = document.createElement("a");
  a.download = `${filenameBase}.png`;
  a.href = tmp.toDataURL("image/png", 1.0);
  a.click();
}

function __exportArrayToCSV(headers = [], rows = [], filenameBase = "datos") {
  const esc = (v) => {
    const s = (v ?? "").toString();
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const head = headers.map(esc).join(",");
  const body = rows.map(r => r.map(esc).join(",")).join("\n");
  const csv = head + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filenameBase}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Añade botones a un <section class="panel"> (encabezado del panel)
function __ensurePanelActions(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return null;

  let head = panel.querySelector(".panel__head");
  if (!head) head = panel.querySelector("header") || panel;

  let box = panel.querySelector(".panel__actions");
  if (!box) {
    box = document.createElement("div");
    box.className = "panel__actions";
    box.style.display = "flex";
    box.style.gap = "8px";
    box.style.marginLeft = "auto";
    // intenta colocarlo al lado del meta si existe
    const meta = head.querySelector(".panel__meta");
    (meta?.parentNode || head).appendChild(box);
    if (!meta) head.style.display = "flex";
  }
  return box;
}

function __addExportButtons(panelId, { onPNG, onCSV, labelCSV = "CSV", labelPNG = "PNG" }) {
  const box = __ensurePanelActions(panelId);
  if (!box) return;

  // Evita duplicar
  const mark = `data-actions-for-${panelId}`;
  if (box.getAttribute(mark) === "1") return;
  box.setAttribute(mark, "1");

  const mkBtn = (txt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn--ghost";
    b.textContent = txt;
    b.style.padding = "6px 10px";
    b.style.borderRadius = "12px";
    return b;
  };

  if (onPNG) {
    const bPng = mkBtn(labelPNG);
    bPng.onclick = onPNG;
    box.appendChild(bPng);
  }
  if (onCSV) {
    const bCsv = mkBtn(labelCSV);
    bCsv.onclick = onCSV;
    box.appendChild(bCsv);
  }
}
