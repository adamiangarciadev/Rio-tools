window.RioTN = (() => {
  'use strict';
  const destination = 'Avellaneda 3249 + Web';
  const canonical = value => String(value ?? '').trim().toUpperCase();
  const code = label => canonical(label).split(/\s+/)[0];
  function indexReport(report) {
    const index = new Map();
    for (const variant of window.RioStockRules.normalize(report)) {
      const sku = [canonical(variant.code), code(variant.color), code(variant.size)].join('#');
      index.set(sku, index.has(sku) ? null : variant);
    }
    return index;
  }

  function readFile(source) {
    const parsed = Papa.parse(source, {header:true, skipEmptyLines:'greedy',
      delimitersToGuess:[';', ',','\t'], transformHeader:canonical});
    if (!['SKU','STOCK'].every(key => parsed.meta.fields?.includes(key)))
      throw Error('El CSV debe incluir las columnas SKU y Stock.');
    if (parsed.errors.length) throw Error('El CSV contiene filas o comillas mal formadas. Volvé a exportarlo.');
    const variants = new Map(), issues = [];
    for (const [i,row] of parsed.data.entries()) {
      const sku = canonical(row.SKU).split('#').map(part => part.trim()).join('#');
      const stockText = row.STOCK.trim();
      const stock = /^-?\d+$/.test(stockText) ? Number(stockText) : NaN;
      if (!/^([^#]+#){2}[^#]+$/.test(sku)) {
        if (!(stock >= 5)) issues.push([sku || 'Fila ' + (i+2), 'Falta un SKU con artículo, color y talle.']);
        continue;
      }
      if (!Number.isSafeInteger(stock) || (variants.has(sku) && variants.get(sku) !== stock)) {
        variants.set(sku, null);
      } else variants.set(sku, stock);
    }
    return {variants, issues};
  }

  function prepare(file, index) {
    const moves = [], issues = file.issues.slice();
    let reviewed = 0;
    for (const [sku, stock] of file.variants) {
      if (stock === null) { issues.push([sku,'Stock indefinido, inválido o contradictorio en el CSV.']); continue; }
      if (stock >= 5) continue;
      reviewed++;
      const variant = index.get(sku);
      if (!variant) {
        issues.push([sku,index.has(sku) ? 'Más de una coincidencia en Río.' : 'Sin coincidencia exacta en Río.']);
        continue;
      }
      const item = window.RioStockRules.compute(variant, true);
      const needed = Math.max(0, item.target[destination] - variant.stock[destination]);
      const eligible = item.moves.filter(m => m.to === destination && !m.from.startsWith('Avellaneda') && m.from !== 'Web');
      const assigned = eligible.reduce((total,m) => total+m.qty, 0);
      for (const move of eligible) moves.push({sku, stock, name:variant.name, ...move});
      if (!needed) issues.push([sku,'Sin traslado según equiparación. Stock en Avellaneda + Web: '+variant.stock[destination]+'.']);
      else if (assigned < needed) issues.push([sku,'Faltan '+(needed-assigned)+' u. para alcanzar el objetivo con los locales habilitados.']);
      else if (item.target[destination] < 5) issues.push([sku,'Stock total insuficiente para alcanzar 5 u. en destino.']);
    }
    moves.sort((a,b) => a.from.localeCompare(b.from,'es') || a.sku.localeCompare(b.sku,'es',{numeric:true}));
    return {moves,issues,reviewed};
  }
  return {readFile,indexReport,prepare};
})();
