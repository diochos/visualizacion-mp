// graficas.js — Pareto % Merma por MP (estilo Bepensa, dentro de panel redondeado)
(function(){
  const MODE = "pct";     // "pct" = usa %Merma de la tabla (merma/real*100)
  const MAX_LABELS = 40;

  let chart;

  // -------- UI: panel y canvas --------
  function ensureContainer(){
    let card = document.getElementById("paretoCard");
    if (!card){
      card = document.createElement("section");
      card.id = "paretoCard";
      card.className = "panel panel--chart";
      card.innerHTML = `
        <header class="panel__head">
          <div class="panel__title">
            <span class="dot"></span>
            <h3>Pareto de % merma por Materia Prima</h3>
          </div>
          <small id="paretoMeta" class="panel__meta"></small>
        </header>
        <div id="paretoWrap" class="chart-wrap">
          <canvas id="paretoMP"></canvas>
        </div>
      `;
      const detalle = document.querySelector("#tablaLinea")?.closest(".panel, .card") || document.body;
      detalle.parentNode.insertBefore(card, detalle.nextSibling);
    }
    return document.getElementById("paretoMP");
  }

  // -------- helpers --------
  const trunc = (s,n)=> (s||"").length>n ? (s.slice(0,n-1)+"…") : (s||"");
  function getVar(name, el=document.documentElement){ return getComputedStyle(el).getPropertyValue(name).trim(); }
  function hexA(hex, a){
    const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return hex;
    const n = parseInt(m[1],16);
    const r = (n>>16)&255, g=(n>>8)&255, b=n&255;
    return `rgba(${r},${g},${b},${a})`;
  }
  // “nice” ceiling para la escala del eje izquierdo
  function niceCeil(x){
    if (!isFinite(x) || x<=0) return 1;
    if (x < 5)  return Math.ceil(x*2)/2;    // pasos de 0.5
    if (x < 10) return Math.ceil(x);        // pasos de 1
    if (x < 20) return Math.ceil(x/2)*2;    // pasos de 2
    if (x < 50) return Math.ceil(x/5)*5;    // pasos de 5
    return Math.ceil(x/10)*10;              // pasos de 10
  }

  // -------- Datos: arma el pareto desde el agregado de VMPS --------
  function buildPareto(agg){
    let totalMerma = agg.reduce((s,a)=> s + (Number(a.merma)||0), 0);
    const rows = agg.map(a=>{
      const real  = Number(a.real)||0;
      const merma = Number(a.merma)||0;
      const pctMerma = real>0 ? (merma/real*100) : 0;   // <- %Merma de la tabla
      const share   = totalMerma>0 ? (merma/totalMerma*100) : 0;
      return { mp:a.mp, pct:pctMerma, share };
    });

    // Ordenamos mayor→menor según MODE (seguimos usando "pct")
    const key = (MODE === "share") ? "share" : "pct";
    rows.sort((a,b)=> b[key]-a[key]);

    // Limitar cantidad de barras (si quieres)
    const limited = rows.slice(0, MAX_LABELS);

    // Suma total de la métrica de barras (p.ej., suma de %Merma)
    const sumBars = limited.reduce((s,r)=> s + r[key], 0);
    const yLeftMax = niceCeil(sumBars);   // eje izquierdo 0–SUMA(%)

    // Acumulado relativo para la línea (0–100%)
    let acc = 0;
    const labels=[], bars=[], accumRel=[];
    for (const r of limited){
      const v = r[key];
      acc += v;
      labels.push(trunc(r.mp, 34));
      bars.push(+v.toFixed(2));                             // valores reales en %
      const rel = (sumBars>0) ? (acc/sumBars*100) : 0;      // relativo a la suma
      accumRel.push(+Math.min(rel,100).toFixed(2));
    }

    return { labels, bars, accumRel, yLeftMax, totalMerma, mode:key, sumBars };
  }

  // -------- Dibujo --------
  function drawPareto(detail){
    if (!detail || !Array.isArray(detail.agg) || detail.agg.length===0) return;

    const canvas = ensureContainer();
    const ctx    = canvas.getContext("2d");
    const meta   = document.getElementById("paretoMeta");

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0,  getVar("--c-brand"));
    grad.addColorStop(1,  hexA(getVar("--c-brand"), .25));
    const barBorder = getVar("--c-brand");
    const lineColor = getVar("--c-brand-300") || "#FFA366";
    const gridColor = "rgba(255,255,255,.08)";
    const tickColor = getVar("--c-text-dim") || "#cfd3da";

    const { labels, bars, accumRel, yLeftMax, totalMerma, mode, sumBars } = buildPareto(detail.agg);

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: (mode==="share" ? "Participación merma (%)" : "% Merma"),
            data: bars,                 // % reales por MP
            backgroundColor: grad,
            borderColor: barBorder,
            borderWidth: 1.2,
            borderRadius: 8,
            yAxisID: "yBar",
            order: 2
          },
          {
            type: "line",
            label: "Acumulado (%)",
            data: accumRel,             // 0–100% relativo a la suma
            borderColor: lineColor,
            backgroundColor: lineColor,
            yAxisID: "yLine",
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 3,
            borderWidth: 2,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        resizeDelay: 120,
        maintainAspectRatio: false,
        layout: { padding: { top: 6, right: 10, bottom: 0, left: 4 } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            labels: { color: tickColor, usePointStyle: true, boxWidth: 10, boxHeight: 10 }
          },
          tooltip: {
            backgroundColor: "rgba(0,0,0,.75)",
            borderColor: gridColor,
            borderWidth: 1,
            titleColor: "#fff",
            bodyColor: "#fff",
            callbacks: {
              label: (ctx)=>{
                const v = ctx.parsed.y;
                return `${ctx.dataset.label}: ${v?.toFixed?.(2) ?? v}%`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: tickColor, maxRotation: 0, autoSkip: true },
            grid:  { color: gridColor },
          },
          // ⬅️ EJE IZQUIERDO: 0–SUMA(%Merma)
          yBar: {
            type: "linear",
            position: "left",
            min: 0,
            max: yLeftMax,                           // fijamos el tope a la suma bonita
            ticks: { color: tickColor, callback: v => v + "%" },
            grid:  { color: gridColor }
          },
          // ➡️ EJE DERECHO: 0–100% acumulado relativo
          yLine: {
            type: "linear",
            position: "right",
            min: 0,
            max: 100,
            ticks: { color: tickColor, callback: v => v + "%" },
            grid:  { drawOnChartArea: false }
          }
        }
      }
    });
    // === Botones export Pareto ===
    __addExportButtons("paretoCard", {
      onPNG: ()=> __exportCanvasPNG(document.getElementById("paretoMP"), "pareto_mp"),
      onCSV: ()=> {
        const headers = ["Materia Prima", "% Merma (barra)", "% Acumulado relativo"];
        const rows    = labels.map((mp,i)=> [mp, bars[i], accumRel[i]]);
        __exportArrayToCSV(headers, rows, "pareto_mp");
      }
    });

    if (meta){
      meta.textContent =
        `Total % merma (eje izq máx): ${sumBars.toFixed(2)}% · ` +
        ((mode==="share")
          ? `Modo: participación de merma · Total merma abs: ${Number(totalMerma||0).toLocaleString("es-MX")}`
          : `Modo: % Merma (merma/real · ordenado desc) · línea acum. cap 100%`);
    }
  }

  // Redibuja en tiempo real cuando consumo-por-linea publica cambios
  window.addEventListener("vmps:update", (e)=> drawPareto(e.detail));

  // Si ya hay estado al cargar (por navegación entre pestañas)
  if (window.VMPS?.getAgg){
    drawPareto({
      agg: window.VMPS.getAgg(),
      rows: window.VMPS.getFilteredRows(),
      kpis: window.VMPS.getKPIs()
    });
  }
})();


// ===== % Merma diario (línea de tiempo) — debajo del Pareto =====
(function(){
  let trendChart;

  // ---------------- helpers ----------------
  function getVar(name, el=document.documentElement){
    return getComputedStyle(el).getPropertyValue(name).trim();
  }
  function niceCeil(x){
    if (!isFinite(x) || x<=0) return 1;
    if (x < 5)  return Math.ceil(x*2)/2;
    if (x < 10) return Math.ceil(x);
    if (x < 20) return Math.ceil(x/2)*2;
    if (x < 50) return Math.ceil(x/5)*5;
    return Math.ceil(x/10)*10;
  }
  function niceFloor(x){
    if (!isFinite(x)) return 0;
    if (x < 0){
      const ax = Math.abs(x);
      if (ax < 5)  return -Math.ceil(ax*2)/2;
      if (ax < 10) return -Math.ceil(ax);
      if (ax < 20) return -Math.ceil(ax/2)*2;
      if (ax < 50) return -Math.ceil(ax/5)*5;
      return -Math.ceil(ax/10)*10;
    }
    if (x < 5)  return Math.floor(x*2)/2;
    if (x < 10) return Math.floor(x);
    if (x < 20) return Math.floor(x/2)*2;
    if (x < 50) return Math.floor(x/5)*5;
    return Math.floor(x/10)*10;
  }

  // Contenedor del trend debajo del pareto
  function ensureTrendContainer(){
    const area = document.getElementById("chartsArea") || (function(){
      const a = document.createElement("div"); a.id = "chartsArea";
      const after = document.querySelector(".container > section.panel:last-of-type");
      (after?.parentNode || document.body).insertBefore(a, after?.nextSibling || null);
      return a;
    })();

    // si el pareto existe y está fuera, muévelo primero
    const pareto = document.getElementById("paretoCard");
    if (pareto && pareto.parentNode !== area) area.appendChild(pareto);

    let card = document.getElementById("trendCard");
    if (!card){
      card = document.createElement("section");
      card.id = "trendCard";
      card.className = "panel panel--chart";
      card.innerHTML = `
        <header class="panel__head">
          <div class="panel__title"><span class="dot"></span><h3>% merma diario (según filtros)</h3></div>
          <small id="trendMeta" class="panel__meta"></small>
        </header>
        <div class="chart-wrap">
          <div id="trendStatus" class="muted" style="display:none;text-align:center;padding:16px;">—</div>
          <canvas id="trendPctMerma"></canvas>
        </div>`;
      area.appendChild(card);
    }
    return {
      canvas: document.getElementById("trendPctMerma"),
      status: document.getElementById("trendStatus"),
      meta:   document.getElementById("trendMeta")
    };
  }

  const showStatus = (el,msg)=>{ if(el){ el.textContent=msg; el.style.display="block"; } };
  const hideStatus = (el)=>{ if(el){ el.style.display="none"; } };

  // Agrupa por fecha ISO -> Σ(teo), Σ(real), % merma diario y OPE(s)
  function buildDailySeries(rows){
    const map = new Map(); // fecha -> { teo, real, opes:Set }
    for (const r of rows){
      const d = r.FechaISO;
      if (!d) continue;
      const acc = map.get(d) || { teo:0, real:0, opes: new Set() };
      acc.teo  += Number(r.CantidadTeorica || 0);
      acc.real += Number(r.CantidadReal   || 0);

      // Trata de leer el código de producción desde varios nombres posibles
      const op =
        r.Produccion ?? r["Producción"] ?? r.OP ?? r.Op ??
        r.Orden ?? r["Orden Producción"] ?? r.OrdenProduccion ?? "";
      if (op) acc.opes.add(String(op).trim());

      map.set(d, acc);
    }
    const dates  = [...map.keys()].sort();
    const labels = dates.map(iso => iso.slice(8)); // “DD”
    const pct    = dates.map(iso => {
      const { teo, real } = map.get(iso);
      const merma = real - teo;
      return real > 0 ? +(merma / real * 100).toFixed(2) : 0;
    });
    // ⬇️ devuelve array de OPEs (no string con comas)
    const opes   = dates.map(iso => [...(map.get(iso).opes || [])]);
    return { dates, labels, pct, opes };
  }

  function drawTrend(detail){
    const { canvas, status, meta } = ensureTrendContainer();
    const rows = detail?.rows || [];

    try{
      if (!rows.length){
        if (trendChart) { trendChart.destroy(); trendChart = null; }
        showStatus(status, "Gráfica sin datos");
        if (meta) meta.textContent = "";
        return;
      }

      const { dates, labels, pct, opes } = buildDailySeries(rows);

      if (!dates.length){
        if (trendChart) { trendChart.destroy(); trendChart = null; }
        showStatus(status, "Gráfica sin datos");
        if (meta) meta.textContent = "";
        return;
      }

      hideStatus(status);
      const ctx       = canvas.getContext("2d");
      const lineColor = getVar("--c-brand-300")   || "#FFA366";
      const metaColor = getVar("--c-success-400") || "#7bd88f";
      const zeroColor = getVar("--c-danger-400")  || "#ff6b6b";
      const gridColor = "rgba(255,255,255,.08)";
      const tickColor = getVar("--c-text-dim")    || "#cfd3da";

      // Rango Y auto y línea objetivo 2%
      const meta2  = 2;
      const minPct = Math.min(...pct);
      const maxPct = Math.max(...pct);
      const ymin   = niceFloor(Math.min(minPct, meta2));
      const ymax   = niceCeil (Math.max(maxPct, meta2));
      const metaLine = new Array(labels.length).fill(meta2);
      const zeroLine = new Array(labels.length).fill(0);

      if (trendChart) trendChart.destroy();
      trendChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Merma",
              data: pct,
              borderColor: lineColor,
              backgroundColor: lineColor,
              tension: 0.25,
              pointRadius: 3,
              pointHoverRadius: 4,
              fill: false,
              order: 1
            },
            {
              label: "Meta",
              data: metaLine,
              borderColor: metaColor,
              borderDash: [6,6],
              pointRadius: 0,
              pointHoverRadius: 0,
              borderWidth: 1.5,
              fill: false,
              order: 0
            },
            {
              label: "Cero",
              data: zeroLine,
              borderColor: zeroColor,
              backgroundColor: zeroColor,
              pointRadius: 0,
              pointHoverRadius: 0,
              borderWidth: 1,
              fill: false,
              order: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { labels: { color: tickColor } },
            tooltip: {
              backgroundColor: "rgba(0,0,0,.75)",
              borderColor: gridColor,
              borderWidth: 1,
              titleColor: "#fff",
              bodyColor: "#fff",
              callbacks: {
                title: (items)=> dates[items[0].dataIndex] || "",
                label: (ctx)=>{
                  const y = ctx.parsed.y;
                  const lab = ctx.dataset.label || "";
                  if (lab.includes("Merma")) return `Merma: ${y.toFixed(2)}%`;
                  if (lab.includes("Meta"))  return `Meta: 2.00%`;
                  if (lab.includes("Cero"))  return `Cero: 0.00%`;
                  return `${lab}: ${y?.toFixed?.(2) ?? y}%`;
                },
                afterBody: (items)=>{
                  if (!items?.length) return [];
                  const idx = items[0].dataIndex;
                  const arr = Array.isArray(opes?.[idx]) ? opes[idx] : [];
                  return arr.length ? ["OPE(s):", ...arr.map(c => `• ${c}`)] : [];
                }
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: "Día", color: tickColor },
              ticks: { color: tickColor, maxRotation: 0, autoSkip: true },
              grid:  { color: gridColor }
            },
            y: {
              min: ymin,
              max: ymax,
              ticks: {
                color: tickColor,
                callback: v => v + "%"
              },
              grid: { color: gridColor }
            }
          }
        }
      });

      // Guardar datos para menú contextual
      trendChart.$ctxData = { dates, opes, pct };
      attachContextMenu(trendChart);

      __addExportButtons("trendCard", {
        onPNG: ()=> __exportCanvasPNG(document.getElementById("trendPctMerma"), "trend_%merma"),
        onCSV: ()=> {
          const headers = ["Fecha", "% merma"];
          const rows = dates.map((d,i)=> [d, pct[i]]);
          __exportArrayToCSV(headers, rows, "trend_%merma");
        }
      });

      if (meta){
        const first = dates[0], last = dates[dates.length-1];
        meta.textContent = `${first} → ${last} · ${labels.length} días`;
      }
    }catch(err){
      console.error("[trend] error:", err);
      if (trendChart) { trendChart.destroy(); trendChart = null; }
      showStatus(status, "Error al generar la gráfica");
      if (meta) meta.textContent = "";
    }
  }

  // ======= Menú contextual (clic derecho) con OPE(s) =======
  function attachContextMenu(chart){
    const id = "chartCtxMenu";
    let menu = document.getElementById(id);
    if (!menu){
      // crear contenedor
      menu = document.createElement("div");
      menu.id = id;
      menu.className = "ctxmenu hidden";
      document.body.appendChild(menu);
      // estilos mínimos
      const style = document.createElement("style");
      style.textContent = `
        .ctxmenu{position:fixed;z-index:9999;background:#111;color:#fff;border:1px solid #333;
                 border-radius:10px;min-width:240px;box-shadow:0 8px 24px rgba(0,0,0,.35);
                 padding:6px; user-select:none}
        .ctxmenu.hidden{display:none}
        .ctxmenu__title{font-weight:600;padding:8px 12px;border-bottom:1px solid #2a2a2a;margin-bottom:4px}
        .ctxmenu__item{display:block;width:100%;text-align:left;background:transparent;border:0;color:#fff;
                       padding:10px 12px;cursor:pointer;font:inherit}
        .ctxmenu__item:hover{background:rgba(255,255,255,.08)}
        .ctxmenu__empty{opacity:.7;padding:10px 12px}
      `;
      document.head.appendChild(style);
    }

    const hideMenu = ()=> menu.classList.add("hidden");
    document.addEventListener("click", (e)=>{ if (!menu.contains(e.target)) hideMenu(); });
    document.addEventListener("keydown", (e)=>{ if (e.key === "Escape") hideMenu(); });

    const canvas = chart.canvas;
    if (!canvas) return;
    canvas.__ctxChart = chart; // 👈 SIEMPRE actualizar al chart más reciente

    // abrir con clic derecho
    if (!canvas.__ctxBound){
      canvas.addEventListener("contextmenu", (ev)=>{
        ev.preventDefault();
        const ch = ev.currentTarget.__ctxChart;  // 👈 usa el chart vigente
        if (!ch) return;

        const hits = ch.getElementsAtEventForMode(ev, "nearest", { intersect: true }, true);
        if (!hits.length) { menu.classList.add("hidden"); return; }

        ch.setActiveElements(hits);
        ch.tooltip?.setActiveElements?.(hits, { x: ev.clientX, y: ev.clientY });
        ch.update();

        const idx = hits[0].index;
        const { dates, opes } = ch.$ctxData || {};
        const ops = Array.isArray(opes?.[idx]) ? opes[idx] : [];

        let html = `<div class="ctxmenu__title">OPE(s) — ${dates?.[idx] || ""}</div>`;
        if (!ops.length){
          html += `<div class="ctxmenu__empty">Sin OPE registradas</div>`;
        } else {
          html += ops.map(op => `<button class="ctxmenu__item" data-ope="${op}">${op}</button>`).join("");
        }
        menu.innerHTML = html;
        menu.style.left = ev.clientX + "px";
        menu.style.top  = ev.clientY + "px";
        menu.classList.remove("hidden");
      });
      canvas.__ctxBound = true;
    }

    // navegación al dar clic en una OPE
    if (!menu.__ctxBound){
      menu.addEventListener("click", (e)=>{
        const btn = e.target.closest('.ctxmenu__item[data-ope]');
        if (!btn) return;
        const ope = btn.dataset.ope;
        // 🚀 Página de detalle (placeholder):
        // antes: location.href = `detalle-ope.html?ope=${encodeURIComponent(ope)}`;
        window.open(`detalle-ope.html?ope=${encodeURIComponent(ope)}`, "_blank", "noopener");

        
        hideMenu();
      });
      menu.__ctxBound = true;
    }
  }

  // escucha el evento que publica consumo-por-linea
  window.addEventListener("vmps:update", (e)=> drawTrend(e.detail));

  // si ya hay estado, intenta pintar una vez
  if (window.VMPS?.getFilteredRows) {
    const seed = window.VMPS.getFilteredRows();
    if (seed?.length) drawTrend({ rows: seed });
  }
})();


// ===== COSTO: 3 paneles financieros (debajo del % merma diario) =====
(function(){
  let costoDailyChart, costoParetoChart, riskChart;

  // ---------- helpers ----------
  const getVar = (name, el=document.documentElement)=> getComputedStyle(el).getPropertyValue(name).trim();
  const hexA   = (hex, a)=>{
    const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return hex;
    const n = parseInt(m[1],16);
    const r = (n>>16)&255, g=(n>>8)&255, b=n&255;
    return `rgba(${r},${g},${b},${a})`;
  };
  const fmtMXN = (n)=> (Number(n)||0).toLocaleString("es-MX",{ style:"currency", currency:"MXN", maximumFractionDigits:0 });
  const fmtK   = (n)=> {
    const x = Math.abs(n);
    if (x >= 1e9) return (n/1e9).toFixed(1)+" B";
    if (x >= 1e6) return (n/1e6).toFixed(1)+" M";
    if (x >= 1e3) return (n/1e3).toFixed(0)+" K";
    return Math.round(n).toString();
  };
  function niceCeilNum(x){
    x = Number(x)||0;
    if (x<=0) return 1;
    const exp = Math.floor(Math.log10(x));
    const base = Math.pow(10, Math.max(exp-1,0));
    const scaled = Math.ceil(x / base);
    const steps = [1,2,5,10,20,50,100];
    const step = steps.find(s => s >= scaled) ?? scaled;
    return step * base;
  }
  function niceCeilPct(x){
    if (!isFinite(x) || x<=0) return 1;
    if (x < 5)  return Math.ceil(x*2)/2;
    if (x < 10) return Math.ceil(x);
    if (x < 20) return Math.ceil(x/2)*2;
    if (x < 50) return Math.ceil(x/5)*5;
    return Math.ceil(x/10)*10;
  }
  function niceFloorPct(x){
    if (!isFinite(x)) return 0;
    if (x < 0){
      const ax = Math.abs(x);
      if (ax < 5)  return -Math.ceil(ax*2)/2;
      if (ax < 10) return -Math.ceil(ax);
      if (ax < 20) return -Math.ceil(ax/2)*2;
      if (ax < 50) return -Math.ceil(ax/5)*5;
      return -Math.ceil(ax/10)*10;
    }
    if (x < 5)  return Math.floor(x*2)/2;
    if (x < 10) return Math.floor(x);
    if (x < 20) return Math.floor(x/2)*2;
    if (x < 50) return Math.floor(x/5)*5;
    return Math.floor(x/10)*10;
  }
  const quantile = (arr, q)=>{
    const a = arr.filter(v=>isFinite(v)).slice().sort((x,y)=>x-y);
    if (!a.length) return 0;
    const pos = (a.length-1)*q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo===hi) return a[lo];
    const h = pos-lo;
    return a[lo]*(1-h) + a[hi]*h;
  };
  const trunc = (s,n)=> (s||"").length>n ? (s.slice(0,n-1)+"…") : (s||"");

  // === util: zona única para TODAS las gráficas ===
  function ensureChartsArea(){
    let area = document.getElementById("chartsArea");
    if (!area){
      area = document.createElement("div");
      area.id = "chartsArea";
      // colócalo después del último <section class="panel"> del HTML (tabla)
      const after = document.querySelector(".container > section.panel:last-of-type");
      (after?.parentNode || document.body).insertBefore(area, after?.nextSibling || null);
    }
    return area;
  }

  // Orden canónico: Pareto → Trend → Grid financiero
  function normalizeChartsOrder(){
    const area   = ensureChartsArea();
    const pareto = document.getElementById("paretoCard");
    const trend  = document.getElementById("trendCard");
    const grid   = document.getElementById("financeGrid");
    if (pareto) area.appendChild(pareto);
    if (trend)  area.appendChild(trend);
    if (grid)   area.appendChild(grid);
  }

  // === Banner global "Generando gráficas…" ===
  let _loaderUseCount = 0, _loaderHideTimer = null;

  function ensureChartsLoader(){
    const area = ensureChartsArea();
    let b = document.getElementById("chartsLoader");
    if (!b){
      b = document.createElement("div");
      b.id = "chartsLoader";
      b.innerHTML = `<div class="box"><span class="spin"></span><span class="title">Generando gráficas…</span></div>`;
      area.parentNode.insertBefore(b, area);
    }
    return b;
  }

  function showChartsLoader(){
    const b = ensureChartsLoader();
    _loaderUseCount++;
    clearTimeout(_loaderHideTimer);
    b.classList.add("is-active");
  }
  function hideChartsLoader(){
    _loaderUseCount = Math.max(0, _loaderUseCount - 1);
    if (_loaderUseCount === 0){
      const b = ensureChartsLoader();
      _loaderHideTimer = setTimeout(()=> b.classList.remove("is-active"), 250);
    }
  }

  // === colgar SIEMPRE el grid en el mismo sitio
  function ensureFinanceGrid(){
    const area = ensureChartsArea();

    let g = document.getElementById("financeGrid");
    if (!g){
      g = document.createElement("div");
      g.id = "financeGrid";
      g.className = "grid grid--2";
      area.appendChild(g);
    }

    normalizeChartsOrder();
    return g;
  }

  // crea panel genérico dentro de la cuadrícula financiera
  function ensureCard(id, title){
    let card = document.getElementById(id);
    if (!card){
      card = document.createElement("section");
      card.id = id;
      card.className = "panel panel--chart";
      card.innerHTML = `
        <header class="panel__head">
          <div class="panel__title">
            <span class="dot"></span>
            <h3>${title}</h3>
          </div>
          <small id="${id}Meta" class="panel__meta"></small>
        </header>
        <div class="chart-wrap">
          <div id="${id}Status" class="muted" style="display:none;text-align:center;padding:16px;">—</div>
          <canvas id="${id}Canvas"></canvas>
        </div>
      `;
      const host = ensureFinanceGrid();
      host.appendChild(card);
      if (id === "riskMapCard") { card.style.gridColumn = "1 / -1"; }
    }
    return {
      canvas: document.getElementById(`${id}Canvas`),
      status: document.getElementById(`${id}Status`),
      meta:   document.getElementById(`${id}Meta`)
    };
  }

  const showStatus = (el,msg)=>{ if(el){ el.textContent=msg; el.style.display="block"; } };
  const hideStatus = (el)=>{ if(el){ el.style.display="none"; } };

  // ---------- 1) Costo de merma diario ----------
  function buildCostoDaily(rows){
    const map = new Map(); // fecha -> sum costo
    for (const r of rows){
      const d = r.FechaISO;
      if (!d) continue;
      const c = getCostoMerma(r);
      map.set(d, (map.get(d)||0) + (Number(c)||0));
    }
    const dates = [...map.keys()].sort();
    const labels = dates.map(iso => iso.slice(8)); // "DD"
    const vals = dates.map(iso => +(map.get(iso)||0));
    return { dates, labels, vals };
  }
  function drawCostoDaily(rows){
    const { canvas, status, meta } = ensureCard("costoDailyCard", "Costo de merma diario (MXN)");
    try{
      if (!rows?.length){
        if (costoDailyChart){ costoDailyChart.destroy(); costoDailyChart = null; }
        showStatus(status, "Gráfica sin datos");
        if (meta) meta.textContent = "";
        return;
      }
      const { dates, labels, vals } = buildCostoDaily(rows);
      if (!dates.length){
        if (costoDailyChart){ costoDailyChart.destroy(); costoDailyChart = null; }
        showStatus(status, "Gráfica sin datos");
        if (meta) meta.textContent = "";
        return;
      }
      hideStatus(status);
      const ctx = canvas.getContext("2d");
      const lineColor = getVar("--c-brand-300") || "#FFA366";
      const gridColor = "rgba(255,255,255,.08)";
      const tickColor = getVar("--c-text-dim") || "#cfd3da";
      const ymax = niceCeilNum(Math.max(...vals));

      if (costoDailyChart) costoDailyChart.destroy();
      costoDailyChart = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{
          label: "Costo de merma (MXN)",
          data: vals,
          borderColor: lineColor,
          backgroundColor: lineColor,
          tension: 0.25,
          pointRadius: 3,
          pointHoverRadius: 4,
          fill: false
        }]},
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { labels: { color: tickColor } },
            tooltip: {
              backgroundColor: "rgba(0,0,0,.75)", borderColor: gridColor, borderWidth: 1,
              titleColor: "#fff", bodyColor: "#fff",
              callbacks: {
                title: (items)=> dates[items[0].dataIndex] || "",
                label: (ctx)=> `Costo: ${fmtMXN(ctx.parsed.y)}`
              }
            }
          },
          scales: {
            x: { ticks:{ color: tickColor, maxRotation:0, autoSkip:true }, grid:{ color: gridColor }, title:{display:true,text:"Día",color:tickColor} },
            y: { min: 0, max: ymax, ticks:{ color: tickColor, callback:v=>fmtK(v) }, grid:{ color: gridColor } }
          }
        }
      });
      if (meta){
        const total = vals.reduce((s,v)=>s+v,0);
        meta.textContent = `${dates[0]} → ${dates[dates.length-1]} · Total: ${fmtMXN(total)}`;
      }

      __addExportButtons("costoDailyCard", {
        onPNG: ()=> __exportCanvasPNG(document.querySelector("#costoDailyCard canvas"), "costo_diario"),
        onCSV: ()=> {
          const headers = ["Fecha", "Costo de merma (MXN)"];
          const rows = dates.map((d,i)=> [d, vals[i]]);
          __exportArrayToCSV(headers, rows, "costo_diario");
        }
      });

    }catch(err){
      console.error("[costoDaily] error:", err);
      if (costoDailyChart){ costoDailyChart.destroy(); costoDailyChart = null; }
      showStatus(status, "Error al generar la gráfica");
      if (meta) meta.textContent = "";
    }
  }

  // ---------- 2) Pareto de costo (MP cuando hay una sola categoría) ----------
  function getCostoMerma(r){
    let v = Number(r.CostoMerma ?? r.Costo_Merma ?? r.Costo ?? 0);
    if (!isFinite(v) || v===0){
      const real = Number(r.CantidadReal ?? r.Real ?? 0);
      const teo  = Number(r.CantidadTeorica ?? r.Teorica ?? 0);
      const unit = Number(r.CostoUnitario ?? r.Costo_Unitario ?? r.CostoKg ?? 0);
      const merma = real - teo;
      if (isFinite(unit) && unit !== 0) v = merma * unit;
      else if (!isFinite(v)) v = 0;
    }
    return v;
  }
  function buildCostoPareto(rows){
    const cats = new Set(rows.map(r => (r.CategoriaMP ?? r.Categoria ?? "").trim()).filter(Boolean));
    const groupByMP = cats.size <= 1; // <<< clave

    const keyOf = (r) => groupByMP
      ? (r.MateriaPrima ?? r.MP ?? r["Materia Prima"] ?? "SIN MATERIA")
      : (r.CategoriaMP ?? r.Categoria ?? "SIN CATEGORÍA");

    const map = new Map(); // clave -> costo
    for (const r of rows){
      const k = keyOf(r);
      map.set(k, (map.get(k)||0) + getCostoMerma(r));
    }

    const entries = [...map.entries()]
      .map(([k,v])=>({ label: k, costo: Number(v)||0 }))
      .sort((a,b)=> b.costo - a.costo);

    const MAX = 40;
    const limited = entries.slice(0, MAX);
    const total   = entries.reduce((s,e)=>s+e.costo, 0);

    let acc = 0;
    const labels=[], bars=[], accum=[];
    for (const e of limited){
      labels.push(trunc(e.label, 34));
      bars.push(e.costo);
      acc += e.costo;
      accum.push(total>0 ? +(acc/total*100).toFixed(2) : 0);
    }
    return { labels, bars, accum, total, groupByMP };
  }

  function drawCostoPareto(rows){
    const { canvas, status, meta } = ensureCard("costoParetoCard", "Pareto de costo de merma por Categoría");
    try{
      if (!rows?.length){
        if (costoParetoChart){ costoParetoChart.destroy(); costoParetoChart = null; }
        showStatus(status, "Gráfica sin datos");
        if (meta) meta.textContent = "";
        return;
      }
      const { labels, bars, accum, total, groupByMP } = buildCostoPareto(rows);
      if (!labels.length){
        if (costoParetoChart){ costoParetoChart.destroy(); costoParetoChart = null; }
        showStatus(status, "Gráfica sin datos");
        if (meta) meta.textContent = "";
        return;
      }

      // título dinámico según el nivel
      const cardEl = document.getElementById("costoParetoCard");
      if (cardEl){
        const h3 = cardEl.querySelector("h3");
        if (h3) h3.textContent = groupByMP
          ? "Pareto de costo de merma por Materia Prima"
          : "Pareto de costo de merma por Categoría";
      }

      hideStatus(status);
      const ctx = canvas.getContext("2d");
      const brand = getVar("--c-brand") || "#ff8a00";
      const grad = ctx.createLinearGradient(0,0,0,canvas.height);
      grad.addColorStop(0, brand);
      grad.addColorStop(1, hexA(brand, .25));
      const barBorder = brand;
      const lineColor = getVar("--c-brand-300") || "#FFA366";
      const gridColor = "rgba(255,255,255,.08)";
      const tickColor = getVar("--c-text-dim") || "#cfd3da";
      const yLeftMax = niceCeilNum(Math.max(...bars)); // máximo

      if (costoParetoChart) costoParetoChart.destroy();
      costoParetoChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              type: "bar",
              label: "Costo (MXN)",
              data: bars,
              backgroundColor: grad,
              borderColor: barBorder,
              borderWidth: 1.2,
              borderRadius: 8,
              yAxisID: "yBar",
              order: 2
            },
            {
              type: "line",
              label: "Acumulado (%)",
              data: accum,
              borderColor: lineColor,
              backgroundColor: lineColor,
              yAxisID: "yLine",
              tension: 0.3,
              pointRadius: 2,
              pointHoverRadius: 3,
              borderWidth: 2,
              order: 1
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { labels: { color: tickColor, usePointStyle: true, boxWidth: 10, boxHeight: 10 } },
            tooltip: {
              backgroundColor: "rgba(0,0,0,.75)", borderColor: gridColor, borderWidth: 1,
              titleColor: "#fff", bodyColor: "#fff",
              callbacks: {
                label: (ctx)=>{
                  const ds = ctx.dataset.label;
                  const v  = ctx.parsed.y;
                  return ds.includes("Costo") ? `${ds}: ${fmtMXN(v)}` : `${ds}: ${v.toFixed(2)}%`;
                }
              }
            }
          },
          scales: {
            x: { ticks:{ color: tickColor, maxRotation:0, autoSkip:true }, grid:{ color: gridColor } },
            yBar: {
              type:"linear", position:"left",
              min:0, max:yLeftMax,
              ticks:{ color: tickColor, callback:v=>fmtK(v) },
              grid:{ color: gridColor }
            },
            yLine: {
              type:"linear", position:"right",
              min:0, max:100,
              ticks:{ color: tickColor, callback:v=>v+"%" },
              grid:{ drawOnChartArea:false }
            }
          }
        }
      });
      if (meta){
        meta.textContent = `Total periodo: ${fmtMXN(total)} · Top ${labels.length} · ${groupByMP ? "MP" : "categorías"}`;
      }
    }catch(err){
      console.error("[costoPareto] error:", err);
      if (costoParetoChart){ costoParetoChart.destroy(); costoParetoChart = null; }
      showStatus(status, "Error al generar la gráfica");
      if (meta) meta.textContent = "";
    }
  }

  function buildRisk(rows){
    const map = new Map(); // fecha -> {real, teo, costo, mp: Map}
    for (const r of rows){
      const d = r.FechaISO;
      if (!d) continue;
      const real  = Number(r.CantidadReal ?? 0);
      const teo   = Number(r.CantidadTeorica ?? 0);
      const costo = getCostoMerma(r);
      const mp    = (r.MateriaPrima ?? r.MP ?? r["Materia Prima"] ?? "SIN MATERIA").toString();

      const acc = map.get(d) || { real:0, teo:0, costo:0, mp: new Map() };
      acc.real += real; acc.teo += teo; acc.costo += costo;
      acc.mp.set(mp, (acc.mp.get(mp)||0) + costo);
      map.set(d, acc);
    }
    const points = [];
    let minX = +Infinity, maxX = -Infinity, minY = +Infinity, maxY = -Infinity;
    for (const [fecha,{real,teo,costo,mp}] of map){
      const merma = real - teo;
      const pct   = real>0 ? (merma/real*100) : 0;

      // MPs ordenadas por costo desc (nombres completos)
      const mps = [...mp.entries()].sort((a,b)=>b[1]-a[1]).map(([name])=>name);

      points.push({ fecha, pct, costo, vol: real, mps });
      if (pct   < minX) minX = pct;
      if (pct   > maxX) maxX = pct;
      if (costo < minY) minY = costo;
      if (costo > maxY) maxY = costo;
    }
    return { points, minX, maxX, minY, maxY };
  }

  function drawRisk(rows){
    const { canvas, status, meta } = ensureCard("riskMapCard", "Mapa de riesgo: % merma vs costo (burbuja)");
    try{
      if (!rows?.length){
        if (riskChart){ riskChart.destroy(); riskChart = null; }
        showStatus(status, "Gráfica sin datos");
        if (meta) meta.textContent = "";
        return;
      }
      const { points, minX, maxX, minY, maxY } = buildRisk(rows);
      if (!points.length){
        if (riskChart){ riskChart.destroy(); riskChart = null; }
        showStatus(status, "Gráfica sin datos");
        if (meta) meta.textContent = "";
        return;
      }
      hideStatus(status);

      // escala radio por volumen (real)
      const vols = points.map(p=>p.vol);
      const vmin = Math.min(...vols), vmax = Math.max(...vols);
      const rScale = (v)=>{
        if (!isFinite(v) || v<=0 || vmin===vmax) return 8;
        const t = (v - vmin) / (vmax - vmin);
        return 6 + t*14; // 6..20 px
      };

      const xMeta = 2; // 2% meta
      const yP80  = quantile(points.map(p=>p.costo), 0.80);

      const xMin = niceFloorPct(Math.min(minX, xMeta));
      const xMax = niceCeilPct (Math.max(maxX, xMeta));
      const yMax = niceCeilNum (Math.max(maxY, yP80));
      const yMin = 0; // costos no negativos

      const dataBubbles = points.map(p => ({
        x: p.pct,
        y: p.costo,
        r: rScale(p.vol),
        _fecha: p.fecha,
        _mps: p.mps,     // nombres de MP del día (ordenadas por costo)
        _vol: p.vol
      }));

      const ctx = canvas.getContext("2d");
      const pointColor = getVar("--c-brand-300") || "#FFA366";
      const gridColor  = "rgba(255,255,255,.08)";
      const tickColor  = getVar("--c-text-dim") || "#cfd3da";
      const lineMeta   = getVar("--c-success-400") || "#7bd88f";
      const lineWarn   = getVar("--c-danger-400")  || "#ff6b6b";

      if (riskChart) riskChart.destroy();
      riskChart = new Chart(ctx, {
        type: "bubble",
        data: {
          datasets: [
            { // puntos
              label: "Días",
              data: dataBubbles,
              backgroundColor: hexA(pointColor, .35),
              borderColor: pointColor,
              borderWidth: 1
            },
            { // línea vertical x=2%
              type: "scatter",
              label: "Meta 2%",
              data: [{x:xMeta, y: yMin}, {x:xMeta, y:yMax}],
              showLine: true,
              borderColor: lineMeta,
              borderDash: [6,6],
              pointRadius: 0,
              borderWidth: 1.5,
              yAxisID: "y"
            },
            { // línea horizontal y=p80 costo
              type: "line",
              label: "P80 costo",
              data: [{x:xMin, y:yP80}, {x:xMax, y:yP80}],
              borderColor: lineWarn,
              borderDash: [6,6],
              pointRadius: 0,
              borderWidth: 1.5,
              xAxisID: "x"
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "nearest", intersect: true },
          plugins: {
            legend: { labels: { color: tickColor, usePointStyle: true, boxWidth: 10, boxHeight: 10 } },
            tooltip: {
              backgroundColor: "rgba(0,0,0,.75)", borderColor: gridColor, borderWidth: 1,
              titleColor: "#fff", bodyColor: "#fff",
              callbacks: {
                title: (items)=> (items[0].raw?._fecha) || items[0].raw?.fecha || "",
                label: (ctx) => {
                  if (ctx.dataset.label === "Días"){
                    const p = ctx.raw;
                    const lines = [
                      `% merma: ${p.x.toFixed(2)}%`,
                      `Costo: ${fmtMXN(p.y)}`,
                      `Volumen: ${fmtK(p._vol || 0)}`
                    ];
                    const list = (p._mps || []).slice(0, 8); // muestra hasta 8 MPs
                    if (list.length){
                      lines.push("Materia prima:");
                      for (const name of list) lines.push(`• ${name}`);
                    }
                    return lines;
                  }
                  const lab = ctx.dataset.label || "";
                  if (lab.includes("Meta")) return "x = 2%";
                  if (lab.includes("P80"))  return `y = ${fmtMXN(yP80)}`;
                  return "";
                }
              }
            }

          },
          scales: {
            x: {
              type: "linear",
              min: xMin, max: xMax,
              ticks: { color: tickColor, callback: v=>v+"%" },
              grid:  { color: gridColor },
              title: { display:true, text:"% merma", color: tickColor }
            },
            y: {
              type: "linear",
              min: yMin, max: yMax,
              ticks: { color: tickColor, callback: v=>fmtK(v) },
              grid:  { color: gridColor },
              title: { display:true, text:"Costo de merma (MXN)", color: tickColor }
            }
          }
        }
      });

      if (meta){
        meta.textContent = `Meta vertical: 2% · P80 costo: ${fmtMXN(yP80)} · puntos: ${points.length}`;
      }
    }catch(err){
      console.error("[riskMap] error:", err);
      if (riskChart){ riskChart.destroy(); riskChart = null; }
      showStatus(status, "Error al generar la gráfica");
      if (meta) meta.textContent = "";
    }
  }

  // ---------- orquestación ----------
  function drawAll(detail){
    showChartsLoader();
    const rows = detail?.rows || [];
    drawCostoDaily(rows);
    drawCostoPareto(rows);
    drawRisk(rows);
    normalizeChartsOrder();
    hideChartsLoader();
  }

  // render en cambios de filtros
  window.addEventListener("vmps:update", (e)=>{
    showChartsLoader();
    drawAll(e.detail);
    hideChartsLoader();
  });
  // primer pintado si ya hay estado
  if (window.VMPS?.getFilteredRows){
    showChartsLoader();
    drawAll({ rows: window.VMPS.getFilteredRows() });
    hideChartsLoader();
  }

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
