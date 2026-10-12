;(() => {
  "use strict";

  const assetsUrl = new URL("../../assets/", document.currentScript.src);
  const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
  const colors = { coral: "#ff5f5c", ink: "#302b2a", muted: "#716762", line: "#e9e2de", mint: "#d9f4eb" };

  window.RioDepositReport = { open };

  async function open(rows) {
    const report = window.open("", "_blank");
    if (!report) {
      window.alert("El navegador bloqueo la ventana del reporte.");
      return;
    }
    report.opener = null;
    report.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Depositos pendientes - RIO</title>
      <style>*{box-sizing:border-box}body{margin:0;background:#faf9f7;color:#302b2a;font-family:Arial,sans-serif}.wrap{max-width:960px;margin:auto;padding:24px}header{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-bottom:18px}h1{font-size:20px;margin:0}.actions{display:flex;gap:8px;flex-wrap:wrap}button{min-height:44px;padding:10px 14px;border:1px solid #cfc1ba;border-radius:6px;background:white;color:#302b2a;font:inherit;cursor:pointer}button.primary{background:#ff5f5c;border-color:#ff5f5c}button:disabled{opacity:.5;cursor:wait}canvas{display:block;width:100%;height:auto;background:white;margin-bottom:20px}#status{font-size:14px;color:#716762;min-height:22px;margin:0 0 14px}@media(max-width:600px){.wrap{padding:12px}}</style></head><body><main class="wrap"><header><h1>Depositos pendientes</h1><div class="actions"><button id="copy" disabled>Copiar imagen</button><button id="download" class="primary" disabled>Descargar imagen</button><button id="share" disabled>Compartir</button></div></header><p id="status" role="status">Preparando imagen...</p><div id="images"></div></main></body></html>`);
    report.document.close();
    const doc = report.document;
    const status = doc.getElementById("status");
    try {
      await Promise.all([["gotham-book.woff2", "400"], ["gotham-bold.woff2", "700"]].map(async ([name, weight]) => {
        const response = await fetch(new URL(`identity/${name}`, assetsUrl));
        if (!response.ok) throw new Error("No se pudo cargar la tipografia RIO.");
        const font = new FontFace("Gotham RIO", await response.arrayBuffer(), { weight });
        doc.fonts.add(await font.load());
      }));
      status.textContent = "Preparando logo...";
      const logo = new Image();
      logo.src = new URL("identity/rio-logo-coral.svg", assetsUrl).href;
      await logo.decode();
      status.textContent = "Generando imagen...";
      const date = new Date().toLocaleDateString("es-AR", { timeZone: "America/Buenos_Aires" });
      const pageSize = 20;
      const pageCount = Math.ceil(rows.length / pageSize);
      const total = rows.reduce((sum, row) => sum + row.amount, 0);
      const files = [];
      for (let page = 0; page < pageCount; page++) {
        const canvas = drawPage(doc, rows.slice(page * pageSize, (page + 1) * pageSize), { logo, date, page, pageCount, total, count: rows.length, accounts: new Set(rows.map(row => row.account)).size });
        doc.getElementById("images").appendChild(canvas);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("No se pudo generar la imagen.");
        files.push(new report.File([blob], `rio-depositos-${date.replaceAll("/", "-")}-${page + 1}.png`, { type: "image/png" }));
      }
      doc.getElementById("download").disabled = false;
      doc.getElementById("download").onclick = () => {
        files.forEach(file => {
          const url = report.URL.createObjectURL(file);
          const link = doc.createElement("a");
          link.href = url;
          link.download = file.name;
          link.click();
          report.setTimeout(() => report.URL.revokeObjectURL(url), 60000);
        });
      };
      const copy = doc.getElementById("copy");
      copy.disabled = !report.navigator.clipboard?.write || !report.ClipboardItem;
      copy.textContent = files.length > 1 ? "Copiar primera imagen" : "Copiar imagen";
      copy.onclick = async () => {
        try {
          await report.navigator.clipboard.write([new report.ClipboardItem({ "image/png": files[0] })]);
          status.textContent = "Imagen copiada.";
        } catch (_) { status.textContent = "No se pudo copiar. Descarga la imagen para enviarla."; }
      };
      const share = doc.getElementById("share");
      share.hidden = !report.navigator.canShare?.({ files });
      share.disabled = share.hidden;
      share.onclick = async () => {
        try { await report.navigator.share({ files }); }
        catch (error) { if (error.name !== "AbortError") status.textContent = "No se pudo compartir. Descarga la imagen para enviarla."; }
      };
      status.textContent = files.length > 1 ? `${files.length} imagenes · ${rows.length} depositos` : `${rows.length} depositos`;
    } catch (error) {
      console.error(error);
      status.textContent = "No se pudo preparar la imagen. Cierra esta ventana y vuelve a intentarlo.";
    }
  }

  function drawPage(doc, rows, info) {
    const canvas = doc.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const width = 1000;
    const left = 36;
    const right = width - left;
    const columns = [left, 210, 734, right];
    const cellWidth = columns[2] - columns[1] - 28;
    ctx.font = '400 20px "Gotham RIO"';
    const wrapped = rows.map(row => wrapText(ctx, row.account, cellWidth));
    const heights = wrapped.map(lines => Math.max(58, lines.length * 28 + 24));
    const height = 180 + heights.reduce((sum, value) => sum + value, 0) + 130;
    canvas.width = width * 2;
    canvas.height = height * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = colors.coral;
    ctx.fillRect(0, 0, width, 8);
    ctx.drawImage(info.logo, right - 98, 26, 98, 68);
    ctx.fillStyle = colors.ink;
    ctx.font = '700 28px "Gotham RIO"';
    ctx.fillText("Depositos pendientes", left, 66);
    ctx.fillStyle = colors.muted;
    ctx.font = '400 17px "Gotham RIO"';
    ctx.fillText(`Al ${info.date}`, left, 98);
    let y = 126;
    ctx.fillStyle = colors.coral;
    ctx.fillRect(left, y, right - left, 54);
    ctx.fillStyle = "#3d1d1b";
    ctx.font = '700 20px "Gotham RIO"';
    ctx.fillText("Fecha", left + 14, y + 34);
    ctx.fillText("Cuenta", columns[1] + 14, y + 34);
    ctx.textAlign = "right";
    ctx.fillText("Monto", right - 14, y + 34);
    ctx.textAlign = "left";
    y += 54;
    rows.forEach((row, index) => {
      const rowHeight = heights[index];
      ctx.fillStyle = index % 2 ? "#f0f0f0" : "#fff";
      ctx.fillRect(left, y, right - left, rowHeight);
      ctx.fillStyle = colors.ink;
      ctx.font = '400 20px "Gotham RIO"';
      ctx.fillText(row.date || "-", left + 14, y + 36, columns[1] - left - 28);
      wrapped[index].forEach((line, lineIndex) => ctx.fillText(line, columns[1] + 14, y + 36 + lineIndex * 28));
      ctx.textAlign = "right";
      ctx.font = '700 20px "Gotham RIO"';
      ctx.fillText(currency.format(row.amount), right - 14, y + 36, right - columns[2] - 28);
      ctx.textAlign = "left";
      grid(ctx, columns, y, rowHeight);
      y += rowHeight;
    });
    ctx.fillStyle = colors.mint;
    ctx.fillRect(left, y, right - left, 58);
    ctx.fillStyle = "#1b6452";
    ctx.font = '700 20px "Gotham RIO"';
    ctx.fillText(info.pageCount > 1 ? "Total de esta imagen" : "Total pendiente", left + 14, y + 37);
    ctx.textAlign = "right";
    const subtotal = rows.reduce((sum, row) => sum + row.amount, 0);
    ctx.fillText(currency.format(subtotal), right - 14, y + 37);
    ctx.textAlign = "left";
    ctx.fillStyle = colors.muted;
    ctx.font = '400 16px "Gotham RIO"';
    ctx.fillText(`${info.count} depositos · ${info.accounts} cuentas${info.pageCount > 1 ? ` · Total general: ${currency.format(info.total)}` : ""}`, left, y + 94);
    ctx.textAlign = "right";
    ctx.fillText(`${info.page + 1} / ${info.pageCount}`, right, y + 94);
    return canvas;
  }

  function grid(ctx, columns, y, height) {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    columns.forEach(x => { ctx.moveTo(x, y); ctx.lineTo(x, y + height); });
    ctx.moveTo(columns[0], y + height);
    ctx.lineTo(columns[columns.length - 1], y + height);
    ctx.stroke();
  }

  function wrapText(ctx, value, width) {
    const lines = [];
    let line = "";
    for (const word of String(value || "Sin cuenta").split(/\s+/)) {
      for (const part of word.match(/.{1,28}/g) || []) {
        const next = line ? `${line} ${part}` : part;
        if (line && ctx.measureText(next).width > width) { lines.push(line); line = part; }
        else line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
})();
