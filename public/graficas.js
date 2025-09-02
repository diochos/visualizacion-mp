// graficas.js — Pareto % Merma por MP (escucha a consumo-por-linea.js)
(function(){
  // === Config: "pct" usa %Merma (merma/real*100). "share" usa participación de merma sobre el total ===
  const MODE = "pct"; // "pct" | "share"
  const MAX_LABELS = 40; // opcional: limita cantidad para legibilidad

  let chart; // instancia Chart.js

  // graficas.js
function ensureContainer(){
  let card = document.getElementById("paretoCard");
  if (!card){
    card = document.createElement("div");
    card.id = "paretoCard";
    card.className = "card";
    card.style.marginTop = "16px";
    card.innerHTML = `

      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">
        <h3 style="margin:0;font-weight:600">Pareto de % merma por Materia Prima</h3>
        <small id="paretoMeta" style="opacity:.75"></small>
      </div>
      <div id="paretoWrap" style="position:relative;height:320px;width:100%;">
        <canvas id="paretoMP" style="width:100%;height:100%;display:block;"></canvas>
      </div>
     
    `;
    const detalle = document.querySelector("#tablaLinea")?.closest(".card") || document.body;
    detalle.parentNode.insertBefore(card, detalle.nextSibling);
  }
  return document.getElementById("paretoMP");
}

  // Arma datos de Pareto desde el agregado que publica VMPS (agg = [{mp, teo, real, merma}, ...])
  function buildPareto(agg){
    // 1) Calcula métrica base por MP
    let totalMerma = agg.reduce((s,a)=> s + (Number(a.merma)||0), 0);
    const rows = agg.map(a=>{
      const real  = Number(a.real)||0;
      const merma = Number(a.merma)||0;
      const pctMerma = real>0 ? (merma/real*100) : 0; // % de la tabla
      const share   = totalMerma>0 ? (merma/totalMerma*100) : 0; // participación de merma
      return {
        mp: a.mp,
        pct: pctMerma,  // base para "pct"
        share,          // base para "share"
      };
    });

    // 2) Ordena mayor→menor según modo
    const key = (MODE === "share") ? "share" : "pct";
    rows.sort((a,b)=> b[key] - a[key]);

    // (opcional) limitar cantidad de barras
    const limited = rows.slice(0, MAX_LABELS);

    // 3) Acumulado (cap a 100 para línea)
    let acc = 0;
    const labels = [];
    const bars   = [];
    const line   = [];
    for (const r of limited){
      const val = r[key];
      acc += val;
      const acc100 = Math.min(acc, 100);
      labels.push(truncate(r.mp, 32));
      bars.push(+val.toFixed(2));
      line.push(+acc100.toFixed(2));
    }
    return { labels, bars, line, mode: key, totalMerma };
  }

  function truncate(s, n){
    s = String(s || "");
    return (s.length > n) ? (s.slice(0, n-1) + "…") : s;
  }

  function drawPareto(detail){
    const canvas = ensureContainer();
    const meta = document.getElementById("paretoMeta");

    // 1) Preferimos el agregado que expone VMPS; si no, intentamos reconstruir del DOM
    let agg = detail?.agg;
    if (!agg || !agg.length){
      agg = readAggFromTable(); // fallback
    }
    const { labels, bars, line, mode, totalMerma } = buildPareto(agg);

    // 2) Chart.js
    if (chart){ chart.destroy(); }
    chart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: (mode === "share" ? "Participación merma (%)" : "% Merma"),
            data: bars,
            yAxisID: "yBar",
          },
          {
            type: "line",
            label: "Acumulado (%)",
            data: line,
            yAxisID: "yLine",
            tension: 0.2,
            pointRadius: 2,
            fill: false,
          }
        ]
      },
      options: {
        responsive: true,
        resizeDelay: 120,  
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#ddd" } },
          tooltip: {
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
            ticks: { color: "#cfd3da", maxRotation: 0, autoSkip: true },
            grid: { color: "rgba(255,255,255,0.06)" }
          },
          yBar: {
            type: "linear",
            position: "left",
            min: 0,
            suggestedMax: 100,
            ticks: { color: "#cfd3da", callback: v => v + "%" },
            grid: { color: "rgba(255,255,255,0.06)" }
          },
          yLine: {
            type: "linear",
            position: "right",
            min: 0,
            max: 100,
            ticks: { color: "#cfd3da", callback: v => v + "%" },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    if (meta){
      meta.textContent =
        (mode === "share")
          ? `Modo: participación de merma total · Total merma: ${Number(totalMerma||0).toLocaleString("es-MX")}`
          : "Modo: % Merma (merma/real · ordenado desc) · Línea acum. cap 100%";
    }
  }

  // Fallback: lee la tabla #tablaLinea si por alguna razón no hay VMPS
  function readAggFromTable(){
    const rows = [];
    document.querySelectorAll("#tablaLinea tbody tr").forEach(tr=>{
      const tds = tr.querySelectorAll("td");
      if (tds.length < 5) return;
      const mp    = tds[0]?.textContent?.trim() || "";
      const real  = parseNumber(tds[2]?.textContent);
      const merma = parseNumber(tds[3]?.textContent);
      rows.push({ mp, real, merma });
    });
    return rows.map(r => ({ mp: r.mp, teo: 0, real: r.real, merma: r.merma }));
  }
  function parseNumber(s){
    if (!s) return 0;
    return Number(String(s).replace(/[^\d.-]/g,"").replace(/,/g,"")) || 0;
  }

  // 1) Dibuja con el estado actual si ya está listo
  if (window.VMPS?.getAgg){
    drawPareto({
      agg: window.VMPS.getAgg(),
      rows: window.VMPS.getFilteredRows(),
      kpis: window.VMPS.getKPIs()
    });
  }
  // 2) Redibuja al cambiar filtros
  window.addEventListener("vmps:update", (e)=> drawPareto(e.detail));
  // 3) Primera carga (por si quieres hacer algo con todo el archivo)
  window.addEventListener("vmps:ready", ()=> {
    // no hacemos nada extra aquí; el primer render ya dispara vmps:update
  });
})();
