// consumo-por-linea.js — lee sessionStorage comprimido y renderiza filtros/KPIs/tabla

(function(){
  const SKEY_META = "vmps_meta_v1";
  const SKEY_ROWS = "vmps_rows_v1";
  const $ = (sel) => document.querySelector(sel);

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
  const fileTag = $("#fileTag");
  const selLinea = $("#selLinea");
  const selCategoria = $("#selCategoria");
  const selSubcat = $("#selSubcat");
  const timeline = $("#timeline");
  const tbody = $("#tablaLinea tbody");
  const kTeo = $("#kTeo");
  const kReal = $("#kReal");
  const kMerma = $("#kMerma");

  // --------- utils ---------
  const fmt = (n, d=0) => Number(n||0).toLocaleString("es-MX",{minimumFractionDigits:d, maximumFractionDigits:d});
  const pct = (n) => Number(n||0).toFixed(2) + "%";
  function uniqueBy(arr, key){
    const set = new Set(arr.map(r => r[key]));
    return [...set].filter(v => v!=null && String(v).trim()!=="").sort();
  }
  function monthKey(fechaStr){
    if(!fechaStr) return "";
    const parts = String(fechaStr).split(/[\/\-]/).map(s=>parseInt(s,10));
    let d=1,m=1,y=2000;
    if(parts.length>=3){
      if(parts[0]>12){ d=parts[0]; m=parts[1]; y=parts[2]; }
      else if(parts[1]>12){ m=parts[0]; d=parts[1]; y=parts[2]; }
      else { m=parts[1]; d=parts[2]; y=parts[0]; }
    }
    const mm = String(m).padStart(2,"0");
    return `${y}-${mm}`;
  }
  function buildTimeline(rows){
    timeline.innerHTML = "";
    const months = uniqueBy(rows.map(r => ({mk:monthKey(r.Fecha)})), "mk").filter(Boolean);
    if(months.length===0){ timeline.innerHTML = `<span class="muted">Sin meses detectados</span>`; return; }
    const btnAll = document.createElement("button");
    btnAll.className = "btn"; btnAll.textContent = "Todos"; btnAll.dataset.mk = "";
    timeline.appendChild(btnAll);
    months.forEach(mk=>{
      const b = document.createElement("button");
      b.className = "btn";
      const [y,mm] = mk.split("-");
      const nombre = new Date(`${y}-${mm}-01`).toLocaleString("es-MX",{month:"short"}).toUpperCase();
      b.textContent = `${nombre} ${y}`; b.dataset.mk = mk; timeline.appendChild(b);
    });
    timeline.addEventListener("click",(ev)=>{
      const t = ev.target.closest("button.btn"); if(!t) return;
      timeline.querySelectorAll("button.btn").forEach(x=>x.style.borderColor="var(--c-border)");
      t.style.borderColor="var(--c-brand)"; state.monthKey = t.dataset.mk || ""; render();
    });
  }
  function fillSelect(sel, values, placeholder){
    sel.innerHTML = "";
    const o0 = document.createElement("option"); o0.value=""; o0.textContent = placeholder||"Todos"; sel.appendChild(o0);
    values.forEach(v=>{ const o=document.createElement("option"); o.value=v; o.textContent=v; sel.appendChild(o); });
  }

  // --------- estado y render ---------
  const state = { rows: [], monthKey: "" };

  function render(){
    const linea = selLinea.value || "";
    const cat   = selCategoria.value || "";
    const sub   = selSubcat.value || "";

    let rows = state.rows.slice();
    if(linea) rows = rows.filter(r => (r.Linea||"") === linea);
    if(cat)   rows = rows.filter(r => (r.CategoriaMP||"") === cat);
    if(sub)   rows = rows.filter(r => (r.SubcategoriaMP||"") === sub);
    if(state.monthKey) rows = rows.filter(r => monthKey(r.Fecha) === state.monthKey);

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
  }

  // --------- init ---------
  (async ()=>{
    const sess = await loadSessionCompressed();
    if(!sess || !Array.isArray(sess.rows) || sess.rows.length===0){
      tbody.innerHTML = `<tr><td colspan="5" class="muted">No hay datos. Sube un archivo en <a href="index.html">Concentrado</a> (misma pestaña).</td></tr>`;
      return;
    }
    if (fileTag) fileTag.textContent = sess.filename || "Sesión restaurada";

    state.rows = sess.rows.map(r => ({
      MateriaPrima: r.MateriaPrima ?? r["Materia Prima"] ?? "",
      CantidadTeorica: Number(r.CantidadTeorica ?? 0),
      CantidadReal: Number(r.CantidadReal ?? 0),
      Merma: Number(r.Merma ?? 0),
      Linea: r.Linea ?? r["Línea"] ?? "",
      Fecha: r.Fecha ?? "",
      CategoriaMP: r.CategoriaMP ?? "",
      SubcategoriaMP: r.SubcategoriaMP ?? "",
    }));

    const lineas = uniqueBy(state.rows, "Linea");
    const cats   = uniqueBy(state.rows, "CategoriaMP");

    fillSelect(selLinea, lineas, "Todas las líneas");
    fillSelect(selCategoria, cats, "Todas las categorías");
    fillSelect(selSubcat, [], "Todas las subcategorías");

    selCategoria.addEventListener("change", ()=>{
      const cat = selCategoria.value || "";
      const subs = cat ? uniqueBy(state.rows.filter(r=> (r.CategoriaMP||"")===cat), "SubcategoriaMP").filter(Boolean) : [];
      fillSelect(selSubcat, subs, subs.length ? "Todas las subcategorías" : "(sin subcategorías)");
      render();
    });
    selLinea.addEventListener("change", render);
    selSubcat.addEventListener("change", render);

    buildTimeline(state.rows);
    render();
  })();
})();
