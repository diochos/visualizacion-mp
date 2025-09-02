// consumo-por-linea.js
// Toma las filas ya guardadas en sessionStorage ("vmpsession_v1") por procesamientoDatos.js
// y permite filtrar por Línea / Categoría / Subcategoría / Mes, agregando por Materia Prima.

(function(){
  const SKEY = "vmpsession_v1";
  const $ = (sel) => document.querySelector(sel);

  const fileTag = $("#fileTag");
  const selLinea = $("#selLinea");
  const selCategoria = $("#selCategoria");
  const selSubcat = $("#selSubcat");
  const timeline = $("#timeline");
  const tbody = $("#tablaLinea tbody");

  const kTeo = $("#kTeo");
  const kReal = $("#kReal");
  const kMerma = $("#kMerma");

  // ---- utilidades
  const fmt = (n, d=0) => Number(n||0).toLocaleString("es-MX", {minimumFractionDigits:d, maximumFractionDigits:d});
  const pct = (n) => Number(n||0).toFixed(2) + "%";

  function loadSession(){
    try{
      const s = sessionStorage.getItem(SKEY);
      if(!s) return null;
      const obj = JSON.parse(s);
      if(!Array.isArray(obj.rows)) return null;
      return obj;
    }catch{ return null; }
  }

  function unique(arr, key){
    const set = new Set();
    for(const r of arr) set.add(r[key]);
    return [...set].filter(v => v != null && String(v).trim() !== "").sort();
  }

  function monthKey(fechaStr){
    // soporta "dd/mm/aaaa" o "m/d/aaaa" etc -> yyyy-mm
    if(!fechaStr) return "";
    const parts = fechaStr.split(/[\/\-]/).map(s=>parseInt(s,10));
    // heurística: si primer token > 12, asumimos dd/mm/yyyy
    let d=1,m=1,y=2000;
    if(parts.length>=3){
      if(parts[0]>12){ d=parts[0]; m=parts[1]; y=parts[2]; }
      else if(parts[1]>12){ m=parts[0]; d=parts[1]; y=parts[2]; }
      else { m=parts[1]; d=parts[2]; y=parts[0]; } // yyyy-mm-dd
    }
    const mm = String(m).padStart(2,"0");
    return `${y}-${mm}`;
  }

  function buildTimeline(rows){
    timeline.innerHTML = "";
    const months = unique(rows.map(r => ({ mk: monthKey(r.Fecha) })), "mk")
      .filter(Boolean)
      .sort();
    if(months.length === 0){
      timeline.innerHTML = `<span class="muted">Sin meses detectados</span>`;
      return;
    }
    // botón "Todos"
    const btnAll = document.createElement("button");
    btnAll.className = "btn";
    btnAll.textContent = "Todos";
    btnAll.dataset.mk = "";
    timeline.appendChild(btnAll);

    months.forEach(mk=>{
      const b = document.createElement("button");
      b.className = "btn";
      const [y,mm] = mk.split("-");
      const nombre = new Date(`${y}-${mm}-01`).toLocaleString("es-MX",{month:"short"}).toUpperCase();
      b.textContent = `${nombre} ${y}`;
      b.dataset.mk = mk;
      timeline.appendChild(b);
    });

    timeline.addEventListener("click", (ev)=>{
      const t = ev.target.closest("button.btn");
      if(!t) return;
      // marcar activo
      timeline.querySelectorAll("button.btn").forEach(x=>x.style.borderColor="var(--c-border)");
      t.style.borderColor = "var(--c-brand)";
      state.monthKey = t.dataset.mk || "";
      render();
    });
  }

  function fillSelect(sel, values, placeholder){
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder || "Todos";
    sel.appendChild(opt0);
    values.forEach(v=>{
      const o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  }

  // ---- estado
  const state = {
    rows: [],
    monthKey: "", // yyyy-mm o vacío para todos
  };

  // ---- render principal
  function render(){
    const linea = selLinea.value || "";
    const cat   = selCategoria.value || "";
    const sub   = selSubcat.value || "";

    // filtrar
    let rows = state.rows.slice();
    if(linea) rows = rows.filter(r => r.Linea === linea);
    if(cat)   rows = rows.filter(r => r.CategoriaMP === cat);
    if(sub)   rows = rows.filter(r => (r.SubcategoriaMP||"") === sub);
    if(state.monthKey){
      rows = rows.filter(r => monthKey(r.Fecha) === state.monthKey);
    }

    // agregar por Materia Prima
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

    // KPIs
    const sumTeo = agg.reduce((s,a)=>s+a.teo,0);
    const sumReal= agg.reduce((s,a)=>s+a.real,0);
    const sumMer = agg.reduce((s,a)=>s+a.merma,0);
    const pMerma = sumReal>0 ? (sumMer/sumReal*100) : 0;

    kTeo.textContent   = fmt(sumTeo);
    kReal.textContent  = fmt(sumReal);
    kMerma.textContent = `${fmt(sumMer)}  (${pct(pMerma)})`;

    // tabla
    const frag = document.createDocumentFragment();
    if(agg.length===0){
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin datos para los filtros seleccionados…</td></tr>`;
    }else{
      tbody.innerHTML = "";
      for(const a of agg){
        const tr = document.createElement("tr");
        const p = a.real>0 ? (a.merma/a.real*100) : 0;
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

    // DataTables (simple, si quieres)
    if ($.fn && $.fn.dataTable){
      if ($.fn.dataTable.isDataTable("#tablaLinea")) {
        $("#tablaLinea").DataTable().destroy();
      }
      $("#tablaLinea").DataTable({
        pageLength: 25,
        autoWidth: false,
        order: [[3, "desc"]],
        language: { url: "https://cdn.datatables.net/plug-ins/1.13.7/i18n/es-MX.json" }
      });
    }
  }

  // ---- init
  const sess = loadSession();
  if(!sess){
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No hay sesión. Ve a <a href="index.html">Concentrado</a>, carga el archivo y vuelve.</td></tr>`;
    return;
  }

  fileTag.textContent = sess.filename || "Sesión restaurada";
  state.rows = Array.isArray(sess.rows) ? sess.rows.slice() : [];

  // selects
  const lineas = unique(state.rows, "Linea");
  const cats   = unique(state.rows, "CategoriaMP");

  fillSelect(selLinea, lineas, "Todas las líneas");
  fillSelect(selCategoria, cats, "Todas las categorías");
  fillSelect(selSubcat, [], "Todas las subcategorías");

  // al cambiar categoría, poblar subcategorías visibles
  selCategoria.addEventListener("change", ()=>{
    const cat = selCategoria.value || "";
    const subs = cat
      ? unique(state.rows.filter(r=>r.CategoriaMP===cat), "SubcategoriaMP").filter(s=>s && s.trim()!=="")
      : [];
    fillSelect(selSubcat, subs, subs.length? "Todas las subcategorías" : "(sin subcategorías)");
    render();
  });

  selLinea.addEventListener("change", render);
  selSubcat.addEventListener("change", render);

  // timeline
  buildTimeline(state.rows);

  // exportar CSV
  $("#btnCSV").addEventListener("click", ()=>{
    // genera CSV de la tabla actual
    const rows = [...document.querySelectorAll("#tablaLinea tbody tr")]
      .map(tr => [...tr.children].map(td => td.textContent));
    if(rows.length===0) return;
    const header = ["Materia Prima","Cantidad Teórica","Cantidad Real","Merma","% Merma"];
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "consumo_por_linea.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // render inicial
  render();
})();
