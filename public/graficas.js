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

    if (meta){
      // ej.: “Total % merma (eje izq máx): 27.14% · Modo: % Merma…”
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
