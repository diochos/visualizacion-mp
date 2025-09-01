// procesamientoDatos.js
document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("fileInput");
  const estadoTag = document.querySelector(".tag strong");
  const tbody = document.querySelector("table tbody");

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    estadoTag.textContent = file.name;

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convertimos toda la hoja en JSON con encabezados
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Buscar fila de encabezados (donde aparezca "Articulo + Descripción")
    const headerRowIndex = raw.findIndex(
      (row) => row && row.includes("Articulo + Descripción")
    );
    if (headerRowIndex === -1) {
      alert("No se encontraron encabezados válidos en el archivo.");
      return;
    }

    const rows = raw.slice(headerRowIndex + 1);

    // Limpiamos tbody
    tbody.innerHTML = "";

    rows.forEach((row) => {
      // Columnas según inspección del Excel
      const articuloDesc = row[0] || ""; // "Articulo + Descripción"
      const recurso = row[1] || ""; // Línea
      const codArtNombre = row[2] || ""; // "Código de artículo + nombre"
      const fecha = row[3] || "";
      const produccion = row[4] || "";
      // row[5] = Cajas Producidas (no usamos)
      const cantTeor = parseFloat(row[6]) || 0;
      const cantReal = parseFloat(row[7]) || 0;
      const merma = parseFloat(row[8]) || 0;
      const costoMerma = parseFloat(row[9]) || 0;

      // Procesamiento de concatenados
      const [codigoMP, materiaPrima] = articuloDesc.split(/-(.+)/); // solo divide en el primer "-"
      const [codArticulo, nombreArticulo] = codArtNombre.split(/-(.+)/);

      // Calculos
      let pctRend = 0;
      let pctMerma = 0;
      if (cantReal > 0) {
        pctRend = (cantTeor / cantReal) * 100;
        pctMerma = (merma / cantReal) * 100;
      }

      // Formato de fecha
      let fechaStr = fecha;
      if (fecha instanceof Date) {
        fechaStr = fecha.toLocaleDateString("es-MX");
      } else if (typeof fecha === "string" && fecha.includes("00:00:00")) {
        fechaStr = fecha.split(" ")[0];
      }

      // Crear fila
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${codigoMP || ""}</td>
        <td>${materiaPrima || ""}</td>
        <td>${recurso || ""}</td>
        <td>${codArticulo || ""}</td>
        <td>${nombreArticulo || ""}</td>
        <td>${fechaStr || ""}</td>
        <td>${produccion || ""}</td>
        <td>${cantTeor.toLocaleString("es-MX")}</td>
        <td>${cantReal.toLocaleString("es-MX")}</td>
        <td>${merma.toLocaleString("es-MX")}</td>
        <td>${costoMerma.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td>${pctRend.toFixed(2)}%</td>
        <td>${pctMerma.toFixed(2)}%</td>
      `;
      tbody.appendChild(tr);
    });
  });
});
