// consumo-por-linea.js — lee sessionStorage comprimido y renderiza filtros/KPIs/tabla
(function(){
  const SKEY_META = "vmps_meta_v1";
  const SKEY_ROWS = "vmps_rows_v1";
  const $ = (sel) => document.querySelector(sel);

  // ---- Loader global (pantalla completa) ----
  function showPageLoader(){
    document.documentElement.classList.add("noscroll");
    document.body.classList.add("noscroll");
    const el = document.getElementById("pageLoader");
    if (el) el.classList.remove("hidden");
  }
  function hidePageLoader(){
    const el = document.getElementById("pageLoader");
    if (el) el.classList.add("hidden");
    document.documentElement.classList.remove("noscroll");
    document.body.classList.remove("noscroll");
    setTimeout(() => { if (el) el.style.display = "none"; }, 400);
  }

  // --------- compresión ---------
  async function ensureLZ(){
    if (window.LZString) return;
    await new Promise((res, rej)=>{
      const sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js";
      sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
    });
  }
  async function loadSessionCompressed(){
    try{
      const meta = sessionStorage.getItem(SKEY_META);
      const data = sessionStorage.getItem(SKEY_ROWS);
      if (!meta || !data) {
        const legacy = sessionStorage.getItem("vmpsession_v1");
        return legacy ? JSON.parse(legacy) : null;
      }
      await ensureLZ();
      const rows = JSON.parse(LZString.decompressFromUTF16(data) || "[]");
      const { filename } = JSON.parse(meta);
      return { filename, rows };
    }catch{ return null; }
  }

  // --------- UI refs ---------
  const fileTag      = $("#fileTag");
  const selLinea     = $("#selLinea");
  const selCategoria = $("#selCategoria");
  const selSubcat    = $("#selSubcat");
  const tbody        = $("#tablaLinea tbody");
  const kTeo         = $("#kTeo");
  const kReal        = $("#kReal");
  const kMerma       = $("#kMerma");

  // Periodo (meses / personalizado)
  const monthButtons  = $("#monthButtons");
  const customRange   = $("#customRange");
  const dateStart     = $("#dateStart");
  const dateEnd       = $("#dateEnd");
  const btnApplyRange = $("#btnApplyRange");
  const btnClearRange = $("#btnClearRange");

  // --------- defaults fijos ---------
  const DEFAULT_LINEA = "Linea 1 - 9 Simonazzi plus Pacabtun";
  const DEFAULT_CAT   = "Preformas PET";

  // --------- utils ---------
  const fmt  = (n, d=0) => Number(n||0).toLocaleString("es-MX",{minimumFractionDigits:d, maximumFractionDigits:d});
  const pct  = (n) => Number(n||0).toFixed(2) + "%";
  const stripAccents = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const norm = v => stripAccents(v).toLowerCase().trim();
  const eq   = (a,b) => norm(a) === norm(b);
  const yyyymm = (iso) => (iso||"").slice(0,7); // YYYY-MM

  function uniqueBy(arr, key){
    const set = new Set(arr.map(r => r[key]));
    return [...set].filter(v => v!=null && String(v).trim()!=="").sort();
  }

  // Overlay local del periodo
  function setPeriodLoading(on){
    const overlay = document.getElementById("periodOverlay");
    overlay?.classList.toggle("hidden", !on);
    monthButtons?.classList.toggle("is-loading", on);
    customRange?.classList.toggle("is-loading", on);
    customRange?.querySelectorAll("input,button")?.forEach(el => el.disabled = on);
    if (monthButtons) monthButtons.style.visibility = on ? "hidden" : "visible";
  }

  // ---------- Fechas robustas ----------
  function excelSerialToDate(serial){
    const n = Number(serial);
    if (!Number.isFinite(n)) return null;
    const base = new Date(Date.UTC(1899, 11, 30)); // corrige bug 1900
    const ms = base.getTime() + Math.round(n) * 86400000;
    const d = new Date(ms);
    return isNaN(d) ? null : d;
  }
  function toISODateUTC(d){
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
           .toISOString().slice(0,10); // YYYY-MM-DD
  }
  function parseToDate(fechaRaw){
    if (fechaRaw == null) return null;
    const s = String(fechaRaw).trim();
    if (!s) return null;

    // Serial Excel
    if (/^\d+(\.0+)?$/.test(s)) return excelSerialToDate(s);

    // YYYY-MM-DD
    let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) {
      const y=+m[1], mo=+m[2], d=+m[3];
      if (y>1900 && mo>=1 && mo<=12 && d>=1 && d<=31) return new Date(Date.UTC(y,mo-1,d));
    }
    // DD/MM/YYYY o DD-MM-YYYY (MX)
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let d=+m[1], mo=+m[2], y=+m[3]; if (y<100) y+=2000;
      if (y>1900 && mo>=1 && mo<=12 && d>=1 && d<=31) return new Date(Date.UTC(y,mo-1,d));
    }
    // Último recurso
    const d = new Date(s);
    return isNaN(d) ? null : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // Select requerido (sin "Todos")
  function fillSelectRequired(sel, values, defaultValue){
    sel.innerHTML = "";
    values.forEach(v => {
      const o = document.createElement("option");
      o.value = v; o.textContent = v; sel.appendChild(o);
    });
    const def = values.find(v => eq(v, defaultValue)) ?? (values[0] ?? "");
    sel.value = def;
  }
  // Select opcional (con "Todos")
  function fillSelectOptional(sel, values, placeholder, defaultValue=""){
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = ""; o0.textContent = placeholder || "Todos";
    sel.appendChild(o0);
    values.forEach(v => {
      const o = document.createElement("option");
      o.value = v; o.textContent = v; sel.appendChild(o);
    });
    sel.value = defaultValue;
  }

  // --------- estado ---------
  const state = {
    rows: [],
    filterMode: "month",   // "month" | "range"
    monthKey: "",          // "YYYY-MM"
    dateStart: "",         // "YYYY-MM-DD"
    dateEnd: ""
  };

  // --- API pública para otras vistas/scripts ---
  window.VMPS = {
    last: { rows: [], agg: [], kpis: { teo:0, real:0, merma:0, pMerma:0 } },
    getAllRows: () => state.rows.slice(),
    getFilteredRows: () => window.VMPS.last.rows.slice(),
    getAgg: () => window.VMPS.last.agg.slice(),
    getKPIs: () => ({ ...window.VMPS.last.kpis })
  };
  function publishUpdate(rows, agg, kpis){
    window.VMPS.last = { rows, agg, kpis };
    window.dispatchEvent(new CustomEvent("vmps:update", {
      detail: window.VMPS.last
    }));
  }

  // --------- periodo: botones de mes ---------
  async function buildMonthButtons(rows){
    if (!monthButtons) return;
    setPeriodLoading(true);
    monthButtons.replaceChildren();
    await new Promise(r => requestAnimationFrame(r));

    const months = [...new Set(rows.map(r => yyyymm(r.FechaISO)).filter(Boolean))].sort();
    const MESES  = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

    const frag = document.createDocumentFragment();

    const btnAll = document.createElement("button");
    btnAll.className = "btn";
    btnAll.textContent = "Todas las fechas";
    btnAll.dataset.mk = "ALL";
    frag.appendChild(btnAll);

    const btnNow = document.createElement("button");
    btnNow.className = "btn";
    btnNow.textContent = "Mes actual";
    btnNow.dataset.mk = "NOW";
    frag.appendChild(btnNow);

    months.forEach(mk => {
      const [y, m] = mk.split("-");
      const nombre = MESES[parseInt(m,10)-1] || mk;
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = `${nombre} ${y}`;
      b.dataset.mk = mk;
      frag.appendChild(b);
    });

    const bCustom = document.createElement("button");
    bCustom.className = "btn btn--ghost";
    bCustom.textContent = "Personalizado";
    bCustom.dataset.mk = "CUSTOM";
    frag.appendChild(bCustom);

    monthButtons.replaceChildren(frag);

    monthButtons.onclick = (ev)=>{
      const btn = ev.target.closest("button.btn");
      if(!btn) return;

      monthButtons.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");

      if (btn.dataset.mk === "CUSTOM"){
        state.filterMode = "range";
        customRange.style.display = "";
        render();
        return;
      }

      state.filterMode = "month";
      customRange.style.display = "none";
      // limpiar posibles residuos del rango
      state.dateStart = state.dateEnd = "";
      if (dateStart) dateStart.value = "";
      if (dateEnd)   dateEnd.value   = "";

      if (btn.dataset.mk === "ALL"){
        state.monthKey = ""; // sin filtro de fechas
        render();
        return;
      }
      if (btn.dataset.mk === "NOW"){
        const now = new Date();
        const mk = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        state.monthKey = months.includes(mk) ? mk : (months[months.length-1] || "");
      } else {
        state.monthKey = btn.dataset.mk || "";
      }
      render();
    };

    // Default visual: "Todas las fechas"
    monthButtons.querySelector('button[data-mk="ALL"]')?.classList.add("active");
    setPeriodLoading(false);
  }

  // --------- render ---------
  function render(){
    // Si en el primer frame aún no hay selects, salimos
    if (!state.rows.length) return;

    // Forzar defaults si los selects aún no tienen value en el primer frame
    const lineasList = uniqueBy(state.rows, "Linea");
    const catsList   = uniqueBy(state.rows, "CategoriaMP");

    const lineaSel = (selLinea?.value || lineasList.find(v=>eq(v, DEFAULT_LINEA)) || lineasList[0] || "");
    const catSel   = (selCategoria?.value || catsList.find(v=>eq(v, DEFAULT_CAT)) || catsList[0] || "");
    const subSel   = selSubcat?.value || "";

    let rows = state.rows.slice();
    if (lineaSel) rows = rows.filter(r => eq(r.Linea, lineaSel));
    if (catSel)   rows = rows.filter(r => eq(r.CategoriaMP, catSel));
    if (subSel)   rows = rows.filter(r => eq(r.SubcategoriaMP, subSel));

    // --- filtro por fecha ---
    if (state.filterMode === "month") {
      if (state.monthKey) rows = rows.filter(r => yyyymm(r.FechaISO) === state.monthKey);
    } else {
      const ds = state.dateStart || "";
      const de = state.dateEnd   || "";
      if (ds) rows = rows.filter(r => r.FechaISO && r.FechaISO >= ds);
      if (de) rows = rows.filter(r => r.FechaISO && r.FechaISO <= de);
    }

    // --- agregados por MP ---
    const map = new Map();
    for(const r of rows){
      const key = r.MateriaPrima || "(sin nombre)";
      const acc = map.get(key) || { mp:key, teo:0, real:0, merma:0 };
      acc.teo  += Number(r.CantidadTeorica||0);
      acc.real += Number(r.CantidadReal||0);
      acc.merma+= Number(r.Merma||0);
      map.set(key, acc);
    }
    const agg = [...map.values()].sort((a,b)=>b.merma-a.merma);

    const sumTeo = agg.reduce((s,a)=>s+a.teo,0);
    const sumReal= agg.reduce((s,a)=>s+a.real,0);
    const sumMer = agg.reduce((s,a)=>s+a.merma,0);
    const pMerma = sumReal>0 ? (sumMer/sumReal*100) : 0;

    kTeo.textContent   = fmt(sumTeo);
    kReal.textContent  = fmt(sumReal);
    kMerma.textContent = `${fmt(sumMer)}  (${pct(pMerma)})`;

    if(agg.length===0){
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin datos para los filtros seleccionados…</td></tr>`;
    }else{
      tbody.innerHTML = "";
      const frag = document.createDocumentFragment();
      for(const a of agg){
        const p = a.real>0 ? (a.merma/a.real*100) : 0;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td title="${a.mp}">${a.mp}</td>
          <td style="text-align:right">${fmt(a.teo)}</td>
          <td style="text-align:right">${fmt(a.real)}</td>
          <td style="text-align:right">${fmt(a.merma)}</td>
          <td style="text-align:right">${pct(p)}</td>
        `;
        frag.appendChild(tr);
      }
      tbody.appendChild(frag);
    }

    // Publica para otras vistas (gráficas, etc.)
    publishUpdate(
      rows,
      agg,
      { teo: sumTeo, real: sumReal, merma: sumMer, pMerma }
    );
  }

  // --------- init ---------
  (async ()=>{
    showPageLoader();
    try {
      const sess = await loadSessionCompressed();

      if(!sess || !Array.isArray(sess.rows) || sess.rows.length===0){
        tbody.innerHTML = `<tr><td colspan="5" class="muted">No hay datos. Sube un archivo en <a href="index.html">Concentrado</a> (misma pestaña).</td></tr>`;
      } else {
        if (fileTag) fileTag.textContent = sess.filename || "Sesión restaurada";

        state.rows = sess.rows.map(r => {
          const iso = r.FechaISO && /^\d{4}-\d{2}-\d{2}$/.test(r.FechaISO)
            ? r.FechaISO
            : (()=>{ const d = parseToDate(r.Fecha ?? ""); return d ? toISODateUTC(d) : ""; })();
          return {
            MateriaPrima: r.MateriaPrima ?? r["Materia Prima"] ?? "",
            CantidadTeorica: Number(r.CantidadTeorica ?? 0),
            CantidadReal: Number(r.CantidadReal ?? 0),
            CostoMerma: Number(r.CostoMerma ?? 0),      // ⬅️ agregar
            CostoUnitario: Number(r.CostoUnitario ?? 0),// ⬅️ opcional
            Merma: Number(r.Merma ?? 0),
            Linea: r.Linea ?? r["Línea"] ?? "",
            Fecha: r.Fecha ?? "",
            FechaISO: iso,
            CategoriaMP: r.CategoriaMP ?? "",
            SubcategoriaMP: r.SubcategoriaMP ?? "",
          };
        });

        const lineas = uniqueBy(state.rows, "Linea");
        const cats   = uniqueBy(state.rows, "CategoriaMP");

       fillSelectRequired(selLinea, lineas, DEFAULT_LINEA);
        fillSelectRequired(selCategoria, cats,  DEFAULT_CAT);

        // Fuerza valor si no hubo match exacto
        if (!selLinea.value)     selLinea.value     = (lineas.find(v=>eq(v,DEFAULT_LINEA)) ?? lineas[0] ?? "");
        if (!selCategoria.value) selCategoria.value = (cats.find(v=>eq(v,DEFAULT_CAT))   ?? cats[0]   ?? "");

        const subsIni = uniqueBy(
          state.rows.filter(r => eq(r.CategoriaMP, selCategoria.value)),
          "SubcategoriaMP"
        ).filter(Boolean);
        fillSelectOptional(selSubcat, subsIni, "Todas las subcategorías");

        await buildMonthButtons(state.rows);

        // Límites para el rango personalizado
        const dates = state.rows.map(r => r.FechaISO).filter(Boolean).sort();
        const minISO = dates[0] || "";
        const maxISO = dates[dates.length-1] || "";
        if (dateStart) { dateStart.min = minISO; dateStart.max = maxISO; }
        if (dateEnd)   { dateEnd.min   = minISO; dateEnd.max   = maxISO; }

        // Default: MES ACTUAL (si no existe en datos, usa el último mes disponible)
        const monthSet = [...new Set(dates.map(yyyymm))].sort();
        const now = new Date();
        const mkNow = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

        state.filterMode = "month";
        state.monthKey   = monthSet.includes(mkNow) ? mkNow : (monthSet[monthSet.length-1] || "");

        // Marcar botón activo en UI
        monthButtons?.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
        const btnNow = monthButtons?.querySelector('button[data-mk="NOW"]');
        const btnMk  = monthButtons?.querySelector(`button[data-mk="${state.monthKey}"]`);
        (btnNow || btnMk)?.classList.add("active");

        // Asegurar que el rango personalizado no quede visible/activo
        if (customRange) customRange.style.display = "none";
        state.dateStart = state.dateEnd = "";
        if (dateStart) dateStart.value = "";
        if (dateEnd)   dateEnd.value   = "";


        // Listeners selects
        selCategoria.addEventListener("change", ()=>{
          const subs = uniqueBy(
            state.rows.filter(r => eq(r.CategoriaMP, selCategoria.value)),
            "SubcategoriaMP"
          ).filter(Boolean);
          fillSelectOptional(selSubcat, subs, "Todas las subcategorías");
          render();
        });
        selLinea.addEventListener("change", render);
        selSubcat.addEventListener("change", render);

        // Rango personalizado
        btnApplyRange?.addEventListener("click", ()=>{
          const ds = dateStart?.value || "";
          const de = dateEnd?.value   || "";
          if (!ds && !de) {
            state.filterMode = "month";
            state.monthKey = "";
            monthButtons?.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
            monthButtons?.querySelector('button[data-mk="ALL"]')?.classList.add("active");
          } else {
            state.filterMode = "range";
            state.dateStart = ds;
            state.dateEnd   = de;
            monthButtons?.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
            monthButtons?.querySelector('button[data-mk="CUSTOM"]')?.classList.add("active");
          }
          customRange.style.display = "";
          render();
        });

        btnClearRange?.addEventListener("click", ()=>{
          // Volver a "Todas las fechas"
          state.filterMode = "month";
          state.monthKey = "";
          monthButtons?.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
          monthButtons?.querySelector('button[data-mk="ALL"]')?.classList.add("active");
          if (customRange) customRange.style.display = "none";
          if (dateStart) dateStart.value = "";
          if (dateEnd)   dateEnd.value   = "";
          render();
        });

        // Primer render determinista
        render();
        window.dispatchEvent(new CustomEvent("vmps:ready", {
          detail: { rows: state.rows.slice() }
        }));
      }
    } catch (err){
      console.error("Error en init:", err);
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Error al cargar. Revisa la consola.</td></tr>`;
    } finally {
      hidePageLoader();
    }
  })();

})();
