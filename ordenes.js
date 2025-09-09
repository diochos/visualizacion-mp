// ordenes.js — Órdenes por OPE con % de merma, filtros por línea/categoría/periodo
(function(){
  const $ = (s) => document.querySelector(s);

  // Loader
  function showPageLoader(){ $("#pageLoader")?.classList.remove("hidden"); }
  function hidePageLoader(){ $("#pageLoader")?.classList.add("hidden"); }

  // UI refs
  const fileTag      = $("#fileTag");
  const selLinea     = $("#selLinea");
  const selCategoria = $("#selCategoria");
  const monthButtons = $("#monthButtons");
  const customRange  = $("#customRange");
  const dateStart    = $("#dateStart");
  const dateEnd      = $("#dateEnd");
  const btnApply     = $("#btnApplyRange");
  const btnClear     = $("#btnClearRange");
  const tbody        = $("#tablaOrdenes tbody");

  // Defaults
  const DEFAULT_LINEA = "Linea 1 - 9 Simonazzi plus Pacabtun";
  const DEFAULT_CAT   = "Preformas PET";

  // Utils
  const fmt = (n,d=2)=> Number(n||0).toLocaleString("es-MX",{minimumFractionDigits:d,maximumFractionDigits:d});
  const stripAccents = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const norm = v => stripAccents(v).toLowerCase().trim();
  const eq   = (a,b) => norm(a) === norm(b);
  const yyyymm = (iso) => (iso||"").slice(0,7);
  const human = (iso)=> /^\d{4}-\d{2}-\d{2}$/.test(iso||"") ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : (iso||"");

  function uniqueBy(arr, key){
    const set = new Set(arr.map(r => r[key]));
    return [...set].filter(v => v!=null && String(v).trim()!=="").sort();
  }

  function excelSerialToDate(serial){
    const n = Number(serial);
    if (!Number.isFinite(n)) return null;
    const base = new Date(Date.UTC(1899, 11, 30));
    const ms = base.getTime() + Math.round(n) * 86400000;
    const d = new Date(ms);
    return isNaN(d) ? null : d;
  }
  function toISODateUTC(d){
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
           .toISOString().slice(0,10);
  }
  function parseToDate(fechaRaw){
    if (fechaRaw == null) return null;
    const s = String(fechaRaw).trim();
    if (!s) return null;
    if (/^\d+(\.0+)?$/.test(s)) return excelSerialToDate(s);
    let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) { const y=+m[1], mo=+m[2], d=+m[3]; return new Date(Date.UTC(y,mo-1,d)); }
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) { let d=+m[1], mo=+m[2], y=+m[3]; if (y<100) y+=2000; return new Date(Date.UTC(y,mo-1,d)); }
    const d = new Date(s);
    return isNaN(d) ? null : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // Estado
  const state = {
    rows: [],
    filterMode: "month", // month | range
    monthKey: "",
    dateStart: "",
    dateEnd: ""
  };

  // Periodo UI
  function setPeriodLoading(on){
    $("#periodOverlay")?.classList.toggle("hidden", !on);
    monthButtons?.classList.toggle("is-loading", on);
    customRange?.classList.toggle("is-loading", on);
    customRange?.querySelectorAll("input,button")?.forEach(el => el.disabled = on);
    if (monthButtons) monthButtons.style.visibility = on ? "hidden" : "visible";
  }

  async function buildMonthButtons(rows){
    if (!monthButtons) return;
    setPeriodLoading(true);
    monthButtons.replaceChildren();
    await new Promise(r => requestAnimationFrame(r));

    const months = [...new Set(rows.map(r => yyyymm(r.FechaISO)).filter(Boolean))].sort();
    const MESES  = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

    const frag = document.createDocumentFragment();

    const btnAll = document.createElement("button");
    btnAll.className = "btn"; btnAll.textContent = "Todas las fechas"; btnAll.dataset.mk = "ALL";
    frag.appendChild(btnAll);

    const btnNow = document.createElement("button");
    btnNow.className = "btn"; btnNow.textContent = "Mes actual"; btnNow.dataset.mk = "NOW";
    frag.appendChild(btnNow);

    months.forEach(mk => {
      const [y, m] = mk.split("-");
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = `${MESES[parseInt(m,10)-1] || mk} ${y}`;
      b.dataset.mk = mk;
      frag.appendChild(b);
    });

    const bCustom = document.createElement("button");
    bCustom.className = "btn btn--ghost"; bCustom.textContent = "Personalizado"; bCustom.dataset.mk = "CUSTOM";
    frag.appendChild(bCustom);

    monthButtons.replaceChildren(frag);

    monthButtons.onclick = (ev)=>{
      const btn = ev.target.closest("button.btn"); if(!btn) return;
      monthButtons.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");

      if (btn.dataset.mk === "CUSTOM"){
        state.filterMode = "range"; customRange.style.display = ""; render(); return;
      }
      state.filterMode = "month"; customRange.style.display = "none";
      state.dateStart = state.dateEnd = ""; if (dateStart) dateStart.value = ""; if (dateEnd) dateEnd.value = "";

      if (btn.dataset.mk === "ALL"){ state.monthKey = ""; render(); return; }
      if (btn.dataset.mk === "NOW"){
        const now = new Date();
        const mk = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        state.monthKey = months.includes(mk) ? mk : (months[months.length-1] || "");
      } else {
        state.monthKey = btn.dataset.mk || "";
      }
      render();
    };

    monthButtons.querySelector('button[data-mk="ALL"]')?.classList.add("active");
    setPeriodLoading(false);
  }

  // Render
  function render(){
    if (!state.rows.length) return;

    const lineas = uniqueBy(state.rows, "Linea");
    const cats   = uniqueBy(state.rows, "CategoriaMP");

    const lineaSel = (selLinea?.value || lineas.find(v=>eq(v, DEFAULT_LINEA)) || lineas[0] || "");
    const catSel   = (selCategoria?.value || cats.find(v=>eq(v, DEFAULT_CAT)) || cats[0] || "");

    // 1) filtros básicos
    let rows = state.rows.slice();
    if (lineaSel) rows = rows.filter(r => eq(r.Linea, lineaSel));
    if (catSel)   rows = rows.filter(r => eq(r.CategoriaMP, catSel));

    // 2) periodo
    if (state.filterMode === "month"){
      if (state.monthKey) rows = rows.filter(r => yyyymm(r.FechaISO) === state.monthKey);
    } else {
      const ds = state.dateStart || "", de = state.dateEnd || "";
      if (ds) rows = rows.filter(r => r.FechaISO && r.FechaISO >= ds);
      if (de) rows = rows.filter(r => r.FechaISO && r.FechaISO <= de);
    }

    // 3) agrupar por OPE dentro de la categoría seleccionada
    const byOpe = new Map(); // OPE -> { ope, linea, fmin, fmax, real, merma }
    for (const r of rows){
      const ope = r.OPE || r.Produccion || r["Producción"] || r.OP || r.Op || "";
      if (!ope) continue;
      const o = byOpe.get(ope) || { ope, lineas:new Map(), fmin:null, fmax:null, real:0, merma:0 };
      // línea más frecuente
      const lin = r.Linea || "";
      if (lin) o.lineas.set(lin, (o.lineas.get(lin)||0)+1);
      // fechas
      const f = r.FechaISO || ""; 
      if (f) {
        if (!o.fmin || f < o.fmin) o.fmin = f;
        if (!o.fmax || f > o.fmax) o.fmax = f;
      }
      // agregados
      o.real  += Number(r.CantidadReal || 0);
      o.merma += Number(r.Merma || 0);
      byOpe.set(ope, o);
    }

    // 4) construir filas: % merma = ΣMerma / ΣReal
    const rowsTbl = [];
    for (const o of byOpe.values()){
      const lineaTop = (()=>{ let best="", n=0; for (const [k,v] of o.lineas) if (v>n){n=v;best=k;} return best || "—"; })();
      const p = o.real > 0 ? (o.merma / o.real * 100) : 0;
      const fechaTxt = (!o.fmin && !o.fmax) ? "—" : (o.fmin===o.fmax ? human(o.fmin) : `${human(o.fmin)} a ${human(o.fmax)}`);
      rowsTbl.push({ ope:o.ope, linea: lineaTop, fecha: fechaTxt, pMerma: p });
    }

    // 5) ordenar desc por % merma
    rowsTbl.sort((a,b)=> b.pMerma - a.pMerma);

    // 6) pintar
    if (!rowsTbl.length){
      tbody.innerHTML = `<tr><td colspan="4" class="muted">Sin datos para los filtros seleccionados…</td></tr>`;
    } else {
      tbody.innerHTML = "";
      const frag = document.createDocumentFragment();
      for (const r of rowsTbl){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><a href="detalle-ope.html?ope=${encodeURIComponent(r.ope)}" target="_blank" rel="noopener">${r.ope}</a></td>
          <td>${r.linea}</td>
          <td>${r.fecha}</td>
          <td class="num">${fmt(r.pMerma)}</td>
        `;
        frag.appendChild(tr);
      }
      tbody.appendChild(frag);
    }
  }

  // Init
  async function loadDataset(){
    const ds = await VMPS.loadDataset();
    return ds ? { filename: ds.filename || "", rows: ds.rows || [] } : null;
  }

  (async()=>{
    showPageLoader();
    try{
      const sess = await loadDataset();
      if (!sess || !Array.isArray(sess.rows) || !sess.rows.length){
        tbody.innerHTML = `<tr><td colspan="4" class="muted">No hay datos. Sube un archivo en <a href="index.html">Concentrado</a>.</td></tr>`;
        hidePageLoader();
        return;
      }
      if (fileTag) fileTag.textContent = sess.filename || "Dataset restaurado";

      // normaliza campos mínimos que necesitamos
      state.rows = sess.rows.map(r => {
        const iso = r.FechaISO && /^\d{4}-\d{2}-\d{2}$/.test(r.FechaISO)
          ? r.FechaISO
          : (()=>{ const d = parseToDate(r.Fecha ?? ""); return d ? toISODateUTC(d) : ""; })();
        return {
          OPE: r.OPE ?? r.Produccion ?? r["Producción"] ?? r.OP ?? r.Op
               ?? r.Orden ?? r["Orden Producción"] ?? r.OrdenProduccion ?? "",
          Linea: r.Linea ?? r["Línea"] ?? "",
          FechaISO: iso,
          CategoriaMP: r.CategoriaMP ?? "",
          CantidadReal: Number(r.CantidadReal ?? 0),
          Merma: Number(r.Merma ?? 0),
        };
      });

      // llenar selects
      const lineas = uniqueBy(state.rows, "Linea");
      const cats   = uniqueBy(state.rows, "CategoriaMP");
      selLinea.innerHTML = ""; lineas.forEach(v => { const o=document.createElement("option"); o.value=v; o.textContent=v; selLinea.appendChild(o); });
      selCategoria.innerHTML = ""; cats.forEach(v => { const o=document.createElement("option"); o.value=v; o.textContent=v; selCategoria.appendChild(o); });

      // defaults
      selLinea.value = lineas.find(v => eq(v, DEFAULT_LINEA)) ?? (lineas[0] || "");
      selCategoria.value = cats.find(v => eq(v, DEFAULT_CAT)) ?? (cats[0] || "");

      await buildMonthButtons(state.rows);

      // límites de rango personalizado
      const dates = state.rows.map(r => r.FechaISO).filter(Boolean).sort();
      const minISO = dates[0] || "", maxISO = dates[dates.length-1] || "";
      if (dateStart) { dateStart.min = minISO; dateStart.max = maxISO; }
      if (dateEnd)   { dateEnd.min   = minISO; dateEnd.max   = maxISO; }

      // default periodo: mes actual o último disponible
      const monthSet = [...new Set(dates.map(yyyymm))].sort();
      const now = new Date(); const mkNow = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
      state.filterMode = "month";
      state.monthKey   = monthSet.includes(mkNow) ? mkNow : (monthSet[monthSet.length-1] || "");

      monthButtons?.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
      const btnNow = monthButtons?.querySelector('button[data-mk="NOW"]');
      const btnMk  = monthButtons?.querySelector(`button[data-mk="${state.monthKey}"]`);
      (btnNow || btnMk)?.classList.add("active");

      customRange.style.display = "none";
      state.dateStart = state.dateEnd = ""; if (dateStart) dateStart.value = ""; if (dateEnd) dateEnd.value = "";

      // listeners
      selLinea.addEventListener("change", render);
      selCategoria.addEventListener("change", render);
      btnApply?.addEventListener("click", ()=>{
        const ds = dateStart?.value || "", de = dateEnd?.value || "";
        if (!ds && !de){
          state.filterMode = "month"; state.monthKey = "";
          monthButtons?.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
          monthButtons?.querySelector('button[data-mk="ALL"]')?.classList.add("active");
          customRange.style.display = "none";
        } else {
          state.filterMode = "range"; state.dateStart = ds; state.dateEnd = de;
          monthButtons?.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
          monthButtons?.querySelector('button[data-mk="CUSTOM"]')?.classList.add("active");
          customRange.style.display = "";
        }
        render();
      });
      btnClear?.addEventListener("click", ()=>{
        state.filterMode = "month"; state.monthKey = "";
        monthButtons?.querySelectorAll(".btn").forEach(x=>x.classList.remove("active"));
        monthButtons?.querySelector('button[data-mk="ALL"]')?.classList.add("active");
        customRange.style.display = "none";
        if (dateStart) dateStart.value = ""; if (dateEnd) dateEnd.value = "";
        render();
      });

      // primer render
      render();
    } catch (e){
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="4" class="muted">Error al cargar. Revisa la consola.</td></tr>`;
    } finally {
      hidePageLoader();
    }
  })();

  // Exponer un método para recargar si cambia el dataset desde otra pestaña
  window.ORDENES = {
    async reload(){
      try{
        const ds = await VMPS.loadDataset();
        if (!ds || !Array.isArray(ds.rows) || !ds.rows.length) return;
        const rows = ds.rows.map(r => {
          const iso = r.FechaISO && /^\d{4}-\d{2}-\d{2}$/.test(r.FechaISO)
            ? r.FechaISO
            : (()=>{ const d = parseToDate(r.Fecha ?? ""); return d ? toISODateUTC(d) : ""; })();
          return {
            OPE: r.OPE ?? r.Produccion ?? r["Producción"] ?? r.OP ?? r.Op
                 ?? r.Orden ?? r["Orden Producción"] ?? r.OrdenProduccion ?? "",
            Linea: r.Linea ?? r["Línea"] ?? "",
            FechaISO: iso,
            CategoriaMP: r.CategoriaMP ?? "",
            CantidadReal: Number(r.CantidadReal ?? 0),
            Merma: Number(r.Merma ?? 0),
          };
        });
        state.rows = rows;
        render();
      }catch(e){ console.warn(e); }
    }
  };
})();
