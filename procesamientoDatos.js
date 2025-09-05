// procesamientoDatos.js — procesa XLSX, clasifica y guarda en sessionStorage (comprimido)

// ================== CATALOGACIÓN DE MATERIA PRIMA ==================
const normalizeMP = (s) => (s ?? "")
  .toString()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().trim();

const CATS = [
  { name: "Adhesivos",  re: /(adhesiv|hot.?melt|euromelt|innocoll|sanyhot)\b/ },
  { name: "Aditivos",   re: /(aditiv|antiyellow|clarificant)/ },
  { name: "Co2",      re: /\bco2\b|gas\s*carbonic/ },
  { name: "Nitrógeno",      re: /gas\s*nitr(o|og|ó)gen/ },
  { name: "Empaque / Bolsas", re: /\bbolsa\b|banda\s+de\s+garant(i|í)a(?!.*co2)|\bpetg\b/ },
  //{ name: "Envases (Vidrio)", re: /(botella.*vidrio|vidrio\s*(nr|no\s*retorn))/ },
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

const SUBCATS = {

  "Concentrados / Jarabes": [
    { name: "Jarabe", re: /\bjarab/ },
    { name: "Concentrado", re: /concentrad/ },
  ],
  "Taparroscas (pzas)": [
    { name: "Rosca 1810", re: /\b1810\b/ },
    { name: "Rosca 1873", re: /\b1873\b/ },
    { name: "26 mm (2622/AP)", re: /\b26(\s*mm)?\b|\b2622\b|\bap\b/ },
    { name: "28 mm", re: /\b28\s*mm\b/ },
    { name: "Twist-off 38 mm", re: /twist\s*off.*\b38\s*mm\b/ },
    { name: "Genérica", re: /.*/ },
  ],


  "Etiquetas": [
    { name: "Coca-Cola", re: /coca\s*cola|cc\b/ },
    { name: "Cristal/Agua", re: /cristal|agua/ },
    { name: "Sprite", re: /\bsprite\b/ },
    { name: "Fanta", re: /\bfanta\b/ },
    { name: "Fresca", re: /\bfresca\b/ },
    { name: "Sidral Mundet", re: /(sidral|mundet)/ },
    { name: "Valle / Té", re: /\bvalle\b|\bt[eé]\b/ },
    { name: "Genérica", re: /.*/ },
  ],
};

// ---------- helpers de clasificación ----------
function classifyCategoriaMP(text) {
  const t = normalizeMP(text);
  for (const rule of CATS) if (rule.re.test(t)) return rule.name;
  return "Otros";
}
function classifySubcategoriaMP(categoria, text) {
  const t = normalizeMP(text);
  const rules = SUBCATS[categoria] || null;
  if (!rules) return "";
  for (const r of rules) if (r.re.test(t)) return r.name;
  return "";
}
function attachCategoriaColumns(row) {
  const materia = row?.MateriaPrima ?? row?.ArticuloDescripcion ?? "";
  const categoria = classifyCategoriaMP(materia);
  const subcategoria = classifySubcategoriaMP(categoria, materia);
  return { ...row, CategoriaMP: categoria, SubcategoriaMP: subcategoria };
}

// ========= utils =========
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

// ========= sessionStorage (comprimido) =========
const SKEY_META = "vmps_meta_v1";
const SKEY_ROWS = "vmps_rows_v1";
async function ensureLZ(){
  if (window.LZString) return;
  await new Promise((res, rej)=>{
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js";
    sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
  });
}
async function saveSessionCompressed(filename, rows){
  await ensureLZ();
  const json = JSON.stringify(rows);
  const compressed = LZString.compressToUTF16(json);
  sessionStorage.setItem(SKEY_META, JSON.stringify({ filename, savedAt: Date.now() }));
  sessionStorage.setItem(SKEY_ROWS, compressed);
}
async function loadSessionCompressed(){
  try{
    const meta = sessionStorage.getItem(SKEY_META);
    const data = sessionStorage.getItem(SKEY_ROWS);
    if (!meta || !data) {
      const legacy = sessionStorage.getItem("vmpsession_v1");
      if (!legacy) return null;
      return JSON.parse(legacy);
    }
    await ensureLZ();
    const rows = JSON.parse(LZString.decompressFromUTF16(data) || "[]");
    const { filename } = JSON.parse(meta);
    return { filename, rows };
  }catch(e){ console.warn("No se pudo restaurar sesión:", e); return null; }
}

// ========= XLSX loader / parser =========
async function ensureXLSX(){
  if (window.XLSX) return;
  await new Promise((res, rej)=>{
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
  });
}

// === Fechas seguras en UTC ===
function excelSerialToISO(val){
  // Devuelve YYYY-MM-DD en UTC a partir de serial Excel, Date o string
  // 1899-12-30 corrige el bug de Excel 1900
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
    // YYYY-MM-DD
    let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m) {
      const y=+m[1], mo=+m[2], d=+m[3];
      if (y>1900 && mo>=1 && mo<=12 && d>=1 && d<=31)
        return new Date(Date.UTC(y, mo-1, d)).toISOString().slice(0,10);
    }
    // DD/MM/YYYY o DD-MM-YYYY (MX primero)
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      let d=+m[1], mo=+m[2], y=+m[3]; if (y<100) y += 2000;
      if (y>1900 && mo>=1 && mo<=12 && d>=1 && d<=31)
        return new Date(Date.UTC(y, mo-1, d)).toISOString().slice(0,10);
    }
    // “YYYY-MM-DD HH:mm:ss” u otros
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

async function parseArrayBufferToRows(ab){
  await ensureXLSX();
  const wb = XLSX.read(ab, { type:"array" });
  const sh = wb.Sheets[wb.SheetNames[0]];

  // Leer como matriz y detectar headers reales (en medio de la hoja)
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
  const iTeo          = idx(/cantidad\s*te[oó]rica/);
  const iReal         = idx(/cantidad\s*real(\s*total)?/);
  const iMerma = header.findIndex(c => is(c, /\bmerma\b/) && !is(c, /costo/));
  const iCostoMerma = idx(/costo.*merma|merma.*costo/);        // "Costo de merma", "Costo total merma", etc.
  const iCostoUnit  = idx(/(costo|precio).*(unitario|kg|pza|pieza)/); // "Costo unitario", "Costo kg", "Precio unitario"

  const splitOnce = (txt) => {
    const s = String(txt || "");
    const m = s.match(/^(.*?)\s*-\s*(.*)$/);
    return m ? [m[1], m[2]] : [s, ""];
  };

  const out = [];
  for (let r = headerRowIndex + 1; r < raw.length; r++){
    const row = raw[r];
    const articuloDesc = row[iArticuloDesc] || "";
    const articuloTrim = String(articuloDesc).trim();
    if (!articuloTrim || articuloTrim === "-") continue;

    const recurso    = row[iRecurso]    ?? "";
    const codNombre  = row[iCodNombre]  ?? "";
    const fecha      = row[iFecha]      ?? "";
    const produccion = row[iProd]       ?? "";

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

    // ✅ calcular ISO (UTC) ANTES de armar la fila
    const ISO = excelSerialToISO(fecha);

    out.push(attachCategoriaColumns({
      CodigoMP: codigoMP || "",
      MateriaPrima: materiaPrima || "",
      Linea: recurso || "",
      CodigoArticulo: codArticulo || "",
      NombreArticulo: nombreArt || "",
      FechaISO: ISO,
      Fecha: isoToHumanMX(ISO),
      Produccion: String(produccion || ""),
      CantidadTeorica: cantTeor,
      CantidadReal: cantReal,
      Merma: merma,
      CostoMerma:      costoCalc,        // <<< usa el calculado
      CostoUnitario: isFinite(costoUnit) ? costoUnit : 0, 
      RendPct:  cantReal > 0 ? (cantTeor / cantReal) * 100 : 0,
      MermaPct: cantReal > 0 ? (merma   / cantReal) * 100 : 0,
    }));
  }

  // Ordena por fecha (más antigua → reciente) desde el parser
  out.sort((a,b)=> (a.FechaISO||"") < (b.FechaISO||"") ? -1 : ((a.FechaISO||"") > (b.FechaISO||"") ? 1 : 0));
  return out;
}

// ========= render previa en la tabla =========
function renderRowsInTable(rows){
  const tbody = document.querySelector("#tablaMP tbody") || document.querySelector("table tbody");
  if(!tbody) return;

  // Si ya hay DataTable, destruir antes de reinyectar
  if (window.jQuery && $.fn.dataTable && $.fn.dataTable.isDataTable("#tablaMP")) {
    $("#tablaMP").DataTable().destroy();
  }

  tbody.innerHTML = "";

  if(!rows || rows.length === 0){
    tbody.innerHTML = `<tr><td colspan="15" class="muted">Cargue un archivo para ver datos…</td></tr>`;
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
      <td style="text-align:right">${(r.Produccion ?? 0).toLocaleString("es-MX")}</td>
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

  // Inicia/ajusta DataTables con paginación y orden asc por Fecha
  window.ensureDataTable && window.ensureDataTable();
}

// ========= UI principal =========
document.addEventListener("DOMContentLoaded", async () => {
  const fileInput  = document.getElementById("fileInput");
  const estadoTag  = document.querySelector(".tag strong");
  const loader     = document.getElementById("loader");
  const showLoader = (on) => { if (loader) loader.style.display = on ? "grid" : "none"; };

  // Restaurar sesión comprimida
  const sess = await loadSessionCompressed();
  if (sess && Array.isArray(sess.rows)) {
    if (estadoTag) estadoTag.textContent = sess.filename || "Sesión restaurada";
    // Asegura orden por fecha
    const rows = sess.rows.slice().sort((a,b)=> (a.FechaISO||"") < (b.FechaISO||"") ? -1 : ((a.FechaISO||"") > (b.FechaISO||"") ? 1 : 0));
    renderRowsInTable(rows);
  }

  // Carga por input: procesa + guarda + pinta
  fileInput?.addEventListener("change", async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try{
      showLoader(true);
      const ab   = await f.arrayBuffer();
      const rows = await parseArrayBufferToRows(ab);
      // guarda comprimido y actualiza estado
      await saveSessionCompressed(f.name, rows);
      if (estadoTag) estadoTag.textContent = f.name;
      renderRowsInTable(rows);
    }catch(e){
      console.error(e);
      if (estadoTag) estadoTag.textContent = "Error al procesar";
      alert("No se pudo procesar/guardar en sesión. Revisa la consola.");
    }finally{
      showLoader(false);
    }
  });
});
