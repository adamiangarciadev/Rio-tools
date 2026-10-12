(() => {
  'use strict';
  const assets = new URL('../../assets/identity/', document.currentScript.src);
  const font = '"Gotham RIO", Arial, sans-serif';
  const colors = { coral: '#FF5F5C', violet: '#7F7EFF', mint: '#4CCCAD', ink: '#302B2A', muted: '#716762', paper: '#FAF9F7' };

  async function logo() {
    const img = new Image();
    img.src = new URL('rio-logo-white.svg', assets).href;
    await img.decode();
    return img;
  }

  function wrap(ctx, value, width) {
    const lines = [];
    let line = '';
    for (const word of String(value).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  async function build({ rows, monthlyRows, month, onlyHigh, pageNumber, pageCount }) {
    await Promise.all([document.fonts.load(`400 24px ${font}`), document.fonts.load(`700 32px ${font}`)]);
    const mark = await logo();
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    const ctx = canvas.getContext('2d');
    ctx.font = `500 24px ${font}`;
    const monthlyTotals = new Map(RioValesModel.groups(monthlyRows || rows).map(group => [group.code, group.total]));
    const layout = rows.map(row => ({ row, lines: wrap(ctx, row.staff_name, 510) }));
    canvas.height = 442 + layout.reduce((sum, item) => sum + Math.max(76, item.lines.length * 32 + 30), 0);

    const box = (x, y, w, h, fill, radius = 0) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill(); };
    const text = (value, x, y, size, color, weight = 400, align = 'left') => { ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y); };
    box(0, 0, 1200, canvas.height, colors.paper);
    box(0, 0, 1200, 222, colors.coral);
    ctx.drawImage(mark, 48, 35, 145, 100);
    text('ADMINISTRACIÓN · PERSONAL', 240, 62, 16, '#4B2421', 500);
    text('Vales solicitados', 240, 111, 38, '#3D1D1B', 700);
    const date = new Date(`${month}-01T12:00:00`);
    const period = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date);
    text(period.charAt(0).toUpperCase() + period.slice(1), 240, 153, 23, '#4B2421');
    text(onlyHigh ? 'Solicitudes superiores a $100.000' : 'Todas las solicitudes del mes', 48, 196, 18, '#4B2421');
    box(1050, 0, 150, 10, colors.violet);

    box(40, 246, 1120, 78, '#FFFFFF', 15);
    box(40, 246, 7, 78, colors.mint, 3);
    text(`${rows.length} ${rows.length === 1 ? 'solicitud' : 'solicitudes'} en esta imagen`, 65, 278, 17, colors.muted);
    text('TOTAL SOLICITADO', 65, 305, 15, colors.ink, 500);
    text(RioValesModel.money(rows.reduce((sum, row) => sum + Number(row.requested_cash), 0)), 1135, 295, 29, colors.ink, 700, 'right');

    box(40, 345, 1120, 45, '#E6E5FF', 9);
    text('NOMBRE DEL EMPLEADO', 62, 373, 14, '#43428E', 700);
    text('ACUMULADO DEL MES', 865, 373, 14, '#43428E', 700, 'right');
    text('IMPORTE PEDIDO', 1138, 373, 14, '#43428E', 700, 'right');
    let y = 398;
    layout.forEach(({ row, lines }, index) => {
      const height = Math.max(76, lines.length * 32 + 30);
      const high = RioValesModel.requestAlert(row);
      box(40, y, 1120, height - 6, high ? '#FFE6E2' : (index % 2 ? '#F2EEEA' : '#FFFFFF'), 9);
      if (high) box(40, y + 10, 4, height - 26, colors.coral, 2);
      lines.forEach((line, i) => text(line, 62, y + 43 + i * 32, 24, colors.ink, 500));
      const accumulated = monthlyTotals.get(row.staff_code) || 0;
      text(RioValesModel.money(accumulated), 865, y + 43, 23, accumulated > 500000 ? '#912B29' : '#43428E', 700, 'right');
      text(RioValesModel.money(row.requested_cash), 1138, y + 43, 25, high ? '#912B29' : colors.ink, 700, 'right');
      y += height;
    });
    text('RÍO TOOLS · VALES DE PERSONAL', 48, canvas.height - 16, 12, colors.muted, 500);
    const exportedDate = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    text(`Fecha de exportación: ${exportedDate}`, 600, canvas.height - 16, 13, colors.muted, 500, 'center');
    text(`${pageNumber} / ${pageCount}`, 1152, canvas.height - 16, 12, colors.muted, 500, 'right');
    return canvas;
  }
  window.RioValesImage = { build };
})();
