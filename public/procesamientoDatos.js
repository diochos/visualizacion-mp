// procesamientoDatos.js — usa sessionStorage para compartir entre páginas

// ================== CATALOGACIÓN DE MATERIA PRIMA ==================
const normalizeMP = (s) => (s ?? "")
  .toString()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().trim();

// ---------- CATEGORÍAS MADRE ----------
const CATS = [
  { name: "Adhesivos",  re: /(adhesiv|hot.?melt|euromelt|innocoll|sanyhot)\b/ },
  { name: "Aditivos",   re: /(aditiv|antiyellow|clarificant)/ },
  { name: "Azúcar",     re: /\bazucar\b/ },
  { name: "Gases",      re: /\bco2\b|gas\s*carbonic|gas\s*nitr(o|og|ó)gen/ },
  { name: "Empaque / Bolsas", re: /\bbolsa\b|banda\s+de\s+garant(i|í)a(?!.*co2)|\bpetg\b/ },
  { name: "Envases (Vidrio)", re: /(botella.*vidrio|vidrio\s*(nr|no\s*retorn))/ },
  { name: "Concentrados / Jarabes", re: /\bjarab|concentrad/ },
  { name: "Etiquetas",  re: /\betiqu/ },
  { name: "Tapas Metálicas (Hermetapas)", re: /(hermetapa|pry[ -]?off|tapon\s*corona|chapa\b)/ },
  { name: "Películas / Films (Emplaye / Termoencogible / Stretch)", re: /(pelicul|sleeve|termoencog|stretch\s*film|emplaye|x\s*pack)/ },
  { name: "Preformas PET", re: /\bpreform|prefo\b/ },
  { name: "Resinas PET", re: /\bresin|pcr001|mb\+?912|recuperad/ },
  { name: "Separadores / Cartón", re: /(separador|carton|corrugad|charola|bandeja|division)/ },
  { name: "Taparroscas", re: /(taparrosc|twist\s*off\s*metalica|cap\b)/ },
];

// ---------- SUBCATEGORÍAS ----------
const SUBCATS = {
  "Películas / Films (Emplaye / Termoencogible / Stretch)": [
    { name: "Termoencogible", re: /(termoencog|sleeve)/ },
    { name: "Stretch Film / Emplaye", re: /(stretch\s*film|emplaye|x\s*pack)/ },
  ],
  "Concentrados / Jarabes": [
    { name: "Jarabe", re: /\bjarab/ },
    { name: "Concentrado", re: /concentrad/ },
  ],
  "Taparroscas": [
    { name: "Rosca 1810", re: /\b1810\b/ },
    { name: "Rosca 1873", re: /\b1873\b/ },
    { name: "26 mm (2622/AP)", re: /\b26(\s*mm)?\b|\b2622\b|\bap\b/ },
    { name: "28 mm", re: /\b28\s*mm\b/ },
    { name: "Twist-off 38 mm", re: /twist\s*off.*\b38\s*mm\b/ },
    { name: "Genérica", re: /.*/ },
  ],
  "Preformas PET": [
    { name: "Peso 11–20 g", re: /\b(1[1-9](?:\.\d)?)\s*g[r]?\b/ },
    { name: "Peso 21–35 g", re: /\b(2[1-9]|3[0-5])(?:\.\d)?\s*g[r]?\b/ },
    { name: "Peso 36–60 g", re: /\b(3[6-9]|[4-5]\d|60)(?:\.\d)?\s*g[r]?\b/ },
    { name: "Boca 26 mm / 2622", re: /\b26\s*mm\b|\b2622\b/ },
    { name: "Boca 28 mm / 1873", re: /\b28\s*mm\b|\b1873\b/ },
    { name: "Proveedor / Maquila", re: /(alpla|petstar|maquila)/ },
    { name: "Genérica", re: /.*/ },
  ],
  "Resinas PET": [
    { name: "Virgen (MB+912)", re: /(virgen|mb\+?912)/ },
    { name: "Reciclada PCR (PCR001)", re: /(pcr001|recicl)/ },
    { name: "Recuperada / Granel", re: /(recuperad|granel)/ },
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

// ---------- Clasificación ----------
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

// ========= Utils =========
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

// ========= Persistencia con sessionStorage =========
const SKEY = "vmpsession_v1";
function saveSession(meta){ try{ sessionStorage.setItem(SKEY, JSON.stringify(meta)); }catch(e){} }
function loadSession(){ try{ const s = sessionStorage.getItem(SKEY); return s ? JSON.parse(s) : null; }catch{ return null; } }
function clearSession(){ try{ sessionStorage.removeItem(SKEY); }catch{} }

// ========= XLSX loader =========
async function ensureXLSX(){
  if (window.XLSX) return;
  await new Promise((res, rej)=>{
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
  });
}
async function parseArrayBufferToRows(ab){
  await ensureXLSX();
  const wb = XLSX.read(ab, { type:"array" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, { defval: "" });
  return rows.map(r => attachCategoriaColumns({
    CodigoMP: r.CodigoMP ?? r["Código MP"] ?? "",
    MateriaPrima: r["Materia Prima"] ?? r.MateriaPrima ?? r.ArticuloDescripcion ?? "",
    Linea: r["Línea"] ?? r.Linea ?? r.Recurso ?? "",
    CodigoArticulo: r["Código de artículo"] ?? r.CodigoArticulo ?? "",
    NombreArticulo: r["Nombre de artículo"] ?? r.NombreArticulo ?? "",
    Fecha: r["Fecha"] ?? r.Fecha ?? "",
    Produccion: num(r["Producción"] ?? r.Produccion),
    CantidadTeorica: num(r["Cantidad Teórica"] ?? r.CantidadTeorica),
    CantidadReal: num(r["Cantidad Real"] ?? r.CantidadReal),
    Merma: num(r["Merma"] ?? r.Merma),
    CostoMerma: num(r["Costo Merma"] ?? r.CostoMerma),
    RendPct: num(r["% Rendimiento"] ?? r.RendPct),
    MermaPct: num(r["% Merma"] ?? r.MermaPct),
  }));
}

// ========= UI principal =========
document.addEventListener("DOMContentLoaded", () => {
  const fileInput  = document.getElementById("fileInput");
  const estadoTag  = document.querySelector(".tag strong");
  const tbody      = document.querySelector("table tbody");
  const loader     = document.getElementById("loader");

  const showLoader = (on) => { if (!loader) return; loader.style.display = on ? "grid" : "none"; };

  // restaurar sesión si existe
  const sess = loadSession();
  if (sess) {
    estadoTag && (estadoTag.textContent = sess.filename || "Sesión restaurada");
    // aquí puedes dibujar la tabla con sess.rows si quieres mostrar previa
    return;
  }

  // flujo por input de archivo
  fileInput && fileInput.addEventListener("change", async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try{
      showLoader(true);
      const ab = await f.arrayBuffer();
      const rows = await parseArrayBufferToRows(ab);
      const meta = { filename: f.name, rows };
      saveSession(meta);
      estadoTag && (estadoTag.textContent = f.name);
      // pinta la tabla con rows si quieres mostrar previa
    }catch(e){
      console.error(e);
      estadoTag && (estadoTag.textContent = "Error al procesar");
    }finally{
      showLoader(false);
    }
  });
});
