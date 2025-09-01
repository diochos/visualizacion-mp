// procesamientoDatos.js
// - Muestra overlay de carga mientras procesa
// - Persiste sesión en sessionStorage para sobrevivir REFRESH (F5)
// - Pierde datos al CERRAR la pestaña (como pediste)

document.addEventListener("DOMContentLoaded", () => {
  const fileInput  = document.getElementById("fileInput");
  const estadoTag  = document.querySelector(".tag strong");
  const tbody      = document.querySelector("table tbody");
  const loader     = document.getElementById("loader");

  const SKEY = "vmpsession_v1"; // clave de la sesión

  // ---------- Utils ----------
  const showLoader = (on) => { if (!loader) return; loader.style.display = on ? "grid" : "none"; };

  const num = (v) => {
    if (v == null) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    let s = String(v).trim();
    // normalizar separadores: si parece tener decimales al final con coma/punto
    if (/[.,]\d{1,3}$/.test(s)) {
      s = s.replace(/\./g, "").replace(/,/g, "."); // 6,042,729.00 => 6042729.00
    } else {
      s = s.replace(/[.,\s]/g, ""); // enteros con separadores
    }
    s = s.replace(/[^\d.-]/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const formatDate = (val) => {
    // Excel date serial number
    if (typeof val === "number") {
      // Excel base: 1899-12-30
      const ms = Math.round((val - 25569) * 86400 * 1000);
      const d  = new Date(ms);
      return d.toLocaleDateString("es-MX");
    }
    if (val instanceof Date) return val.toLocaleDateString("es-MX");
    if (typeof val === "string") {
      const s = val.trim();
      if (s.includes("00:00:00")) return s.split(" ")[0];
      // Dejar tal cual si viene en formato dd/mm/yyyy u otro
      return s;
    }
    return "";
  };

  const splitOnce = (txt) => {
    const s = (txt || "").toString();
    const m = s.match(/^(.*?)\s*-\s*(.*)$/);
    return m ? [m[1], m[2]] : [s, ""];
  };

  const clearTbody = () => { tbody.innerHTML = ""; };

  const renderRows = (rows) => {
    clearTbody();
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.CodigoMP}</td>
        <td>${r.MateriaPrima}</td>
        <td>${r.Linea}</td>
        <td>${r.CodigoArticulo}</td>
        <td>${r.NombreArticulo}</td>
        <td>${r.Fecha}</td>
        <td>${r.Produccion}</td>
        <td>${Number(r.CantidadTeorica||0).toLocaleString("es-MX")}</td>
        <td>${Number(r.CantidadReal||0).toLocaleString("es-MX")}</td>
        <td>${Number(r.Merma||0).toLocaleString("es-MX")}</td>
        <td>${Number(r.CostoMerma||0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td>${Number(r.PctRend||0).toFixed(2)}%</td>
        <td>${Number(r.PctMerma||0).toFixed(2)}%</td>
      `;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="14" class="muted">Sin filas válidas…</td></tr>`;
    }
  };

  const saveSession = (meta) => {
    // Guardamos solo lo necesario para re-render:
    // - nombre de archivo (display)
    // - filas procesadas (objetos ya limpios)
    try {
      sessionStorage.setItem(SKEY, JSON.stringify(meta));
    } catch (e) {
      console.warn("No se pudo guardar la sesión:", e);
    }
  };

  const loadSession = () => {
    try {
      const s = sessionStorage.getItem(SKEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  };

  const restoreIfAny = () => {
    const sess = loadSession();
    if (!sess || !Array.isArray(sess.rows)) return;
    estadoTag.textContent = sess.filename || "Sesión restaurada";
    renderRows(sess.rows);
  };

  // Restaurar al cargar (sobrevive a F5)
  restoreIfAny();

  // ---------- Handler de carga de archivo ----------
  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    estadoTag.textContent = file.name;
    showLoader(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Hoja -> matriz (header:1 nos da array de arrays)
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      // Buscar fila de encabezados (donde aparezca "Articulo + Descripción")
      const headerRowIndex = raw.findIndex(
        (row) => row && row.includes("Articulo + Descripción")
      );
      if (headerRowIndex === -1) {
        alert("No se encontraron encabezados válidos en el archivo.");
        showLoader(false);
        return;
      }

      const rowsRaw = raw.slice(headerRowIndex + 1);

      const rowsProcessed = [];
      for (const row of rowsRaw) {
        // Columnas según inspección:
        const articuloDesc   = row[0] ?? ""; // "Articulo + Descripción"
        const recurso        = row[1] ?? ""; // Línea (texto completo)
        const codArtNombre   = row[2] ?? ""; // "Código de artículo + nombre"
        const fecha          = row[3] ?? "";
        const produccion     = row[4] ?? "";
        // row[5] = Cajas Producidas (NO usamos)
        const cantTeor       = num(row[6]);
        const cantReal       = num(row[7]);
        const merma          = num(row[8]);
        const costoMerma     = num(row[9]);

        // ---- NUEVO: descartar filas si "Artículo + Descripción" está vacío o es "-"
        const articuloTrim = (articuloDesc || "").toString().trim();
        if (articuloTrim === "" || articuloTrim === "-") {
          continue; // saltar esta fila, no sirve
        }

        // Si además viene toda la fila "vacía", también la saltamos
        if (!articuloDesc && !recurso && !codArtNombre) {
          continue;
        }

        // Partidos por el primer "-"
        const [codigoMP, materiaPrima] = splitOnce(articuloDesc);
        const [codArticulo, nombreArt] = splitOnce(codArtNombre);

        // Cálculos (% sobre cantidades agregadas a nivel fila)
        let pctRend = 0, pctMerma = 0;
        if (cantReal > 0) {
          pctRend  = (cantTeor / cantReal) * 100;
          pctMerma = (merma / cantReal) * 100; // equivalente a 100 - pctRend si merma = real - teorica
        }

        rowsProcessed.push({
          CodigoMP: codigoMP || "",
          MateriaPrima: materiaPrima || "",
          Linea: recurso || "",
          CodigoArticulo: codArticulo || "",
          NombreArticulo: nombreArt || "",
          Fecha: formatDate(fecha),
          Produccion: (produccion || "").toString(),
          CantidadTeorica: cantTeor,
          CantidadReal: cantReal,
          Merma: merma,
          CostoMerma: costoMerma,
          PctRend: pctRend,
          PctMerma: pctMerma
        });
      }

      renderRows(rowsProcessed);
      // Guardar sesión para sobrevivir a refresh
      saveSession({ filename: file.name, rows: rowsProcessed });

    } catch (err) {
      console.error(err);
      alert("Ocurrió un error al procesar el archivo.");
    } finally {
      showLoader(false);
    }
  });
});
