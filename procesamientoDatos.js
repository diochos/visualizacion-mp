// procesamientoDatos.js — parser XLSX, normalización y persistencia en IndexedDB (con fallback a sessionStorage)

/* ================== CATALOGACIÓN DE MATERIA PRIMA ================== */
const normalizeMP = (s) => (s ?? "")
  .toString()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().trim();

const CATS = [
  { name: "Adhesivos",  re: /(adhesiv|hot.?melt|euromelt|innocoll|sanyhot)\b/ },
  { name: "Aditivos",   re: /(aditiv|antiyellow|clarificant)/ },
  { name: "Co2",        re: /\bco2\b|gas\s*carbonic/ },
  { name: "Nitrógeno",  re: /gas\s*nitr(o|og|ó)gen/ },
  { name: "Empaque / Bolsas", re: /\bbolsa\b|banda\s+de\s+garant(i|í)a(?!.*co2)|\bpetg\b/ },
  { name: "Concentrados / Jarabes", re: /\bjarab|concentrad/ },
  { name: "Etiquetas",  re: /\betiqu/ },
  { name: "Tapas Metálicas (Hermetapas)", re: /(hermetapa|pry[ -]?off|tapon\s*corona|chapa\b)/ },
  { name: "Termoencogible", re: /(termoencog|sleeve)/ },
  { name: "Stretch Film / Emplaye", re: /(stretch\s*film|emplaye|x\s*pack)/ },
  { name: "Preformas PET", re: /\bpreform|prefo\b/ },
  { name: "Resinas PET", re: /\bresin|pcr001|mb\+?912|recuperad/ },
  { name: "Separadores / Cartón", re: /(separador|carton|corrugad|charola|bandeja|division)/ },
  { name: "Taparroscas (pzas)", re: /(taparrosc|twist\s*off\s*metalica|cap\b)/ },
];

function classifyCategoriaMP(text) {
  const t = normalizeMP(text);
  for (const rule of CATS) if (rule.re.test(t)) return rule.name;
  return "Otros";
}

function attachCategoriaColumns(row) {
  const materia = row?.MateriaPrima ?? row?.ArticuloDescripcion ?? "";
  const categoria = classifyCategoriaMP(materia);
  return { ...row, CategoriaMP: categoria };
}

/* ================== UTILS ================== */
const num = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (/[.,]\d{1,3}$/.test(s)) s = s.replace(/\./g, "").replace(/,/g, ".");
  else s = s.replace(/[.,\s]/g, "");
  s = s.replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};
const normOPE = (s) => String(s ?? "").trim().toUpperCase();

/* ================== LIBS DINÁMICAS ================== */
async function ensureXLSX(){
  if (window.XLSX) return;
  await new Promise((res, rej)=>{
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
  });
}
async function ensureLZ(){
  if (window.LZString) return;
  await new Promise((res, rej)=>{
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js";
    sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
  });
}

/* ================== FECHAS (UTC) ================== */
function excelSerialToISO(val){
  if (typeof val === "number" && Number.isFinite(val)) {
    const baseUTC = Date.UTC(1899, 11, 30);
    const ms = baseUTC + Math.round(val) * 86400000;
    return new Date(ms).toISOString().slice(0,10);
  }
  if (val instanceof Date) {
    const d = new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate()));
    return d.toISOString().slice(0,10);
  }
  if (typeof val === "string") {
    const s = val.trim();
    let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m) {
      const y=+m[1], mo=+m[2], d=+m[3];
      if (y>1900 && mo>=1 && mo<=12 && d>=1 && d<=31)
        return new Date(Date.UTC(y, mo-1, d)).toISOString().slice(0,10);
    }
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      let d=+m[1], mo=+m[2], y=+m[3]; if (y<100) y += 2000;
      if (y>1900 && mo>=1 && mo<=12 && d>=1 && d<=31)
        return new Date(Date.UTC(y, mo-1, d)).toISOString().slice(0,10);
    }
    const d = new Date(s);
    if (!isNaN(d)) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0,10);
    return "";
  }
  return "";
}
function isoToHumanMX(iso){
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d.padStart(2,"0")}/${m.padStart(2,"0")}/${y}`;
}

/* ================== INDEXEDDB (sin backend) ================== */
const IDB_NAME = "vmps_db_v1";
const IDB_VERSION = 1; // si cambias schema, sube versión
let __idbDB = null;

function idbOpen(){
  return new Promise((resolve, reject)=>{
    if (__idbDB) return resolve(__idbDB);
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (ev)=>{
      const db = ev.target.result;
      if (!db.objectStoreNames.contains("dataset")) db.createObjectStore("dataset"); // key: "current"
      if (!db.objectStoreNames.contains("blob"))    db.createObjectStore("blob");    // key: "xlsx"
    };
    req.onsuccess = ()=>{ __idbDB = req.result; resolve(__idbDB); };
    req.onerror   = ()=> reject(req.error);
  });
}
function idbPut(store, key, value){
  return idbOpen().then(db=> new Promise((res, rej)=>{
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = ()=> res(true);
    tx.onerror = ()=> rej(tx.error);
  }));
}
function idbGet(store, key){
  return idbOpen().then(db=> new Promise((res, rej)=>{
    const tx = db.transaction(store, "readonly");
    const rq = tx.objectStore(store).get(key);
    rq.onsuccess = ()=> res(rq.result ?? null);
    rq.onerror   = ()=> rej(rq.error);
  }));
}

/* ============ Fallback: sessionStorage (compat mientras migras) ============ */
const SKEY_META   = "vmps_meta_v1";
const SKEY_ROWS   = "vmps_rows_v1";
const SKEY_CAJAS  = "vmps_cajasByOpe_v1";

async function saveSessionCompressed(filename, rows, cajasByOpeArr){
  await ensureLZ();
  const compressed = LZString.compressToUTF16(JSON.stringify(rows));
  sessionStorage.setItem(SKEY_META, JSON.stringify({ filename, savedAt: Date.now() }));
  sessionStorage.setItem(SKEY_ROWS, compressed);
  if (Array.isArray(cajasByOpeArr)) {
    sessionStorage.setItem(SKEY_CAJAS, JSON.stringify(cajasByOpeArr));
  }
}
async function loadSessionCompressed(){
  try{
    const meta = sessionStorage.getItem(SKEY_META);
    const data = sessionStorage.getItem(SKEY_ROWS);
    if (!meta || !data) return null;
    await ensureLZ();
    const rows = JSON.parse(LZString.decompressFromUTF16(data) || "[]");
    const { filename } = JSON.parse(meta);
    let cajasByOpe = [];
    try { cajasByOpe = JSON.parse(sessionStorage.getItem(SKEY_CAJAS)||"[]"); } catch(_){}
    const opsDisponibles = Array.from(new Set(rows.map(r => r.OPE).filter(Boolean)));
    return { filename, rows, cajasByOpe, opsDisponibles, builtAt: Date.now() };
  }catch(e){ console.warn("No se pudo restaurar sesión:", e); return null; }
}

/* ================== PARSER XLSX → ROWS NORMALIZADOS ================== */
async function parseArrayBufferToRows(ab){
  await ensureXLSX();
  const wb = XLSX.read(ab, { type:"array" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });

  const is = (v, rx) => typeof v === "string" && rx.test(v.trim().toLowerCase());
  const headerRowIndex = raw.findIndex(row =>
    row.some(c => is(c, /art[ií]culo\s*\+\s*descrip/)) &&
    row.some(c => is(c, /c[oó]digo\s*de\s*art[ií]culo\s*\+\s*nombre/))
  );
  if (headerRowIndex === -1) throw new Error("No se encontraron encabezados típicos en la hoja.");

  const header = raw[headerRowIndex];
  const idx = (regex) => header.findIndex(c => is(c, regex));

  const iArticuloDesc = idx(/art[ií]culo\s*\+\s*descrip/);
  const iRecurso      = idx(/\brecurso\b|\bl[ií]nea\b/);
  const iCodNombre    = idx(/c[oó]digo\s*de\s*art[ií]culo\s*\+\s*nombre/);
  const iFecha        = idx(/\bfecha\b/);
  const iProd         = idx(/producci[oó]n/);
  const iCajas        = idx(/cajas\s*(producid|produc)/i);
  const iTeo          = idx(/cantidad\s*te[oó]rica/);
  const iReal         = idx(/cantidad\s*real(\s*total)?/);
  const iMerma        = header.findIndex(c => is(c, /\bmerma\b/) && !is(c, /costo/));
  const iCostoMerma   = idx(/costo.*merma|merma.*costo/);
  const iCostoUnit    = idx(/(costo|precio).*(unitario|kg|pza|pieza)/);

  const splitOnce = (txt) => {
    const s = String(txt || "");
    const m = s.match(/^(.*?)\s*-\s*(.*)$/);
    return m ? [m[1], m[2]] : [s, ""];
  };

  // Acumulador de cajas por OPE
  const cajasByOpe = new Map();
  const isTotalRow = (s)=> /^\s*total\s+op_/i.test(s || "") || /^\s*total\s+general/i.test(s || "");
  const numSoft = (v)=>{
    if (v == null) return 0;
    const s = String(v).replace(/\s/g,"").replace(/,/g,"").replace(/[^0-9.\-]/g,"");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  const out = [];
  for (let r = headerRowIndex + 1; r < raw.length; r++){
    const row = raw[r];

    const articuloDesc = row[iArticuloDesc] || "";
    const articuloTrim = String(articuloDesc).trim();

    const produccion = (row[iProd]  ?? "").toString().trim();
    const OPE = normOPE(produccion);
    const cajasCell  = iCajas >= 0 ? numSoft(row[iCajas]) : 0;

    // Fila cabecera o "Total OP_..." → cachea cajas y salta
    if ((!articuloTrim || articuloTrim === "-") || isTotalRow(articuloTrim)) {
      if (OPE && cajasCell > 0) cajasByOpe.set(OPE, cajasCell);
      continue;
    }

    // Campos normales
    const recurso    = row[iRecurso]    ?? "";
    const codNombre  = row[iCodNombre]  ?? "";
    const fecha      = row[iFecha]      ?? "";
    const cantTeor   = num(row[iTeo]);
    const cantReal   = num(row[iReal]);
    const merma      = num(row[iMerma]);
    const costoMerma = num(iCostoMerma >= 0 ? row[iCostoMerma] : 0);
    const costoUnit  = num(iCostoUnit  >= 0 ? row[iCostoUnit ] : 0);
    const costoCalc  = (isFinite(costoMerma) && costoMerma !== 0)
      ? costoMerma
      : (isFinite(costoUnit) ? merma * costoUnit : 0);

    const [codigoMP, materiaPrima] = splitOnce(articuloDesc);
    const [codArticulo, nombreArt] = splitOnce(codNombre);
    const ISO = excelSerialToISO(fecha);

    const rObj = attachCategoriaColumns({
      OPE,                               // ← clave canónica para filtrar en Detalle
      Produccion: produccion || "",      // (compat)
      CodigoMP: codigoMP || "",
      MateriaPrima: materiaPrima || "",
      Linea: recurso || "",
      CodigoArticulo: codArticulo || "",
      NombreArticulo: nombreArt || "",
      FechaISO: ISO,
      Fecha: isoToHumanMX(ISO),
      CajasProducidas: (cajasCell > 0 ? cajasCell : (cajasByOpe.get(OPE) || 0)),
      CantidadTeorica: cantTeor,
      CantidadReal:    cantReal,
      Merma:           merma,
      CostoMerma:      costoCalc,
      CostoUnitario:   isFinite(costoUnit) ? costoUnit : 0,
      RendPct:  cantReal > 0 ? (cantTeor / cantReal) * 100 : 0,
      MermaPct: cantReal > 0 ? (merma   / cantReal) * 100 : 0,
    });
    out.push(rObj);
  }

  // Backfill de cajas por si el total vino abajo
  for (const r of out){
    if ((r.CajasProducidas ?? 0) === 0 && r.OPE){
      const v = cajasByOpe.get(r.OPE);
      if (v) r.CajasProducidas = v;
    }
  }

  // Ordenar por fecha asc
  out.sort((a,b)=> (a.FechaISO||"") < (b.FechaISO||"") ? -1 : ((a.FechaISO||"") > (b.FechaISO||"") ? 1 : 0));

  return out; // ← compat: sigue regresando rows
}

/* ================== DATASET: construir y persistir ================== */
function buildDataset(rows, meta = {}){
  const opsDisponibles = Array.from(new Set(rows.map(r => r.OPE).filter(Boolean)));
  // Extraer mapa de cajas por OPE (preferir máximo visto por OPE)
  const agg = new Map();
  for (const r of rows){
    if (!r.OPE) continue;
    const prev = agg.get(r.OPE) || 0;
    const val = Number(r.CajasProducidas || 0);
    if (val > prev) agg.set(r.OPE, val);
  }
  const cajasByOpe = Array.from(agg.entries()).map(([ope, cajas]) => ({ ope, cajas:Number(cajas||0) }));

  return {
    rows,
    cajasByOpe,
    opsDisponibles,
    filename: meta.filename || "",
    builtAt: Date.now(),
  };
}

async function saveDatasetIndexedDB(dataset, fileBlob){
  // dataset: { rows, cajasByOpe, opsDisponibles, filename?, builtAt? }
  if (!dataset || !Array.isArray(dataset.rows)) throw new Error("Dataset inválido");
  await idbPut("dataset", "current", dataset);
  if (fileBlob instanceof Blob) await idbPut("blob", "xlsx", fileBlob);
  // Notificar (si alguna otra pestaña escucha)
  try { new BroadcastChannel("vmps").postMessage({ type:"dataset-ready" }); } catch(_){}
  return true;
}
async function loadDatasetIndexedDB(){
  const ds = await idbGet("dataset", "current");
  if (!ds || !Array.isArray(ds.rows)) return null;
  return ds;
}

/* ================== API PÚBLICA (window.VMPS) ================== */
window.VMPS = window.VMPS || {};

VMPS.parseArrayBufferToRows = parseArrayBufferToRows; // compat

VMPS.parseArrayBufferToDataset = async function(ab, meta = {}){
  const rows = await parseArrayBufferToRows(ab);
  return buildDataset(rows, meta);
};

VMPS.saveDataset = async function(dataset, fileBlob){
  // Guarda en IndexedDB + fallback a sessionStorage
  try {
    await saveDatasetIndexedDB(dataset, fileBlob);
  } catch(e){
    console.warn("IndexedDB falló, guardando en sessionStorage:", e);
    await saveSessionCompressed(dataset.filename || "", dataset.rows, dataset.cajasByOpe);
  }
};

VMPS.loadDataset = async function(){
  // Intenta IDB → fallback session
  let ds = null;
  try { ds = await loadDatasetIndexedDB(); } catch(_){}
  if (ds) return ds;

  const sess = await loadSessionCompressed();
  if (sess) return {
    rows: sess.rows,
    cajasByOpe: Array.isArray(sess.cajasByOpe) ? sess.cajasByOpe : [],
    opsDisponibles: Array.isArray(sess.opsDisponibles) ? sess.opsDisponibles : [],
    filename: sess.filename || "",
    builtAt: sess.builtAt || Date.now(),
  };
  return null;
};

VMPS.getAllRows = async function(){
  const ds = await VMPS.loadDataset();
  return ds?.rows || [];
};

VMPS.getCajasMap = async function(){
  const ds = await VMPS.loadDataset();
  const map = new Map();
  (ds?.cajasByOpe || []).forEach(({ope, cajas}) => map.set(normOPE(ope), Number(cajas||0)));
  return map;
};

VMPS.getOpsDisponibles = async function(){
  const ds = await VMPS.loadDataset();
  return ds?.opsDisponibles || [];
};

VMPS.saveFromFileInputEvent = async function(file){
  if (!file) return;
  const ab   = await file.arrayBuffer();
  const rows = await parseArrayBufferToRows(ab);
  const dataset = buildDataset(rows, { filename: file.name });
  await VMPS.saveDataset(dataset, file);
  return dataset;
};

/* ================== UI OPCIONAL (solo si hay #fileInput) ================== */
document.addEventListener("DOMContentLoaded", async () => {
  const fileInput  = document.getElementById("fileInput");
  const estadoTag  = document.querySelector(".tag strong");
  const loader     = document.getElementById("loader");
  const showLoader = (on) => { if (loader) loader.style.display = on ? "grid" : "none"; };

  // Si la página NO tiene input, no hacemos UI (el módulo queda “pasivo”)
  if (!fileInput) return;

  // Intentar restaurar dataset (sirve para recarga de página)
  try{
    const ds = await VMPS.loadDataset();
    if (ds?.rows?.length) {
      if (estadoTag) estadoTag.textContent = ds.filename || "Dataset restaurado";
      // Si tienes una tabla previa en esta página, puedes pintarla aquí:
      renderRowsInTable && renderRowsInTable(ds.rows);

      const seen = localStorage.getItem("vmps_rendered_builtAt");
      if (String(seen) !== String(ds.builtAt)) {
        renderRowsInTable && renderRowsInTable(ds.rows);
        localStorage.setItem("vmps_rendered_builtAt", String(ds.builtAt));
      }
    }
  }catch(e){ console.warn(e); }

  // Carga por input: procesa + guarda (IDB) + pinta (si tienes tabla)
  fileInput.addEventListener("change", async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try{
      showLoader(true);
      const dataset = await VMPS.saveFromFileInputEvent(f);
      if (estadoTag) estadoTag.textContent = dataset.filename;
      renderRowsInTable && renderRowsInTable(dataset.rows);
      localStorage.setItem("vmps_rendered_builtAt", String(dataset.builtAt));
    }catch(e){
      console.error(e);
      if (estadoTag) estadoTag.textContent = "Error al procesar";
      alert("No se pudo procesar/guardar. Revisa la consola.");
    }finally{
      showLoader(false);
    }
  });
});

/* ================== (OPCIONAL) Helper de render tabla local ==================
   Deja esto si en alguna página quieres render previo; si no, puedes borrarlo.
*/
function renderRowsInTable(rows){
  const tbody = document.querySelector("#tablaMP tbody") || document.querySelector("table tbody");
  if(!tbody) return;

  if (window.jQuery && $.fn.dataTable && $.fn.dataTable.isDataTable("#tablaMP")) {
    $("#tablaMP").DataTable().destroy();
  }
  tbody.innerHTML = "";

  if(!rows || rows.length === 0){
    tbody.innerHTML = `<tr><td colspan="16" class="muted">Cargue un archivo para ver datos…</td></tr>`;
    window.ensureDataTable && window.ensureDataTable();
    return;
  }

  const frag = document.createDocumentFragment();
  for(const r of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.CodigoMP ?? ""}</td>
      <td>${r.MateriaPrima ?? ""}</td>
      <td>${r.Linea ?? ""}</td>
      <td>${r.CodigoArticulo ?? ""}</td>
      <td>${r.NombreArticulo ?? ""}</td>
      <td data-order="${r.FechaISO || ""}">${r.Fecha || ""}</td>
      <td>${r.OPE ?? r.Produccion ?? ""}</td>
      <td style="text-align:right">${(r.CajasProducidas ?? 0).toLocaleString("es-MX")}</td>
      <td style="text-align:right">${(r.CantidadTeorica ?? 0).toLocaleString("es-MX")}</td>
      <td style="text-align:right">${(r.CantidadReal ?? 0).toLocaleString("es-MX")}</td>
      <td style="text-align:right">${(r.Merma ?? 0).toLocaleString("es-MX")}</td>
      <td style="text-align:right">${(r.CostoMerma ?? 0).toLocaleString("es-MX",{minimumFractionDigits:2, maximumFractionDigits:2})}</td>
      <td style="text-align:right">${Number(r.RendPct ?? 0).toFixed(2)}%</td>
      <td style="text-align:right">${Number(r.MermaPct ?? 0).toFixed(2)}%</td>
      <td>${r.CategoriaMP ?? ""}</td>
      <td>${r.SubcategoriaMP ?? ""}</td>
    `;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
  window.ensureDataTable && window.ensureDataTable();
}
