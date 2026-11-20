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
    const variants = new Map(), brands = new Map(), productBrands = new Map(), issues = [];
    for (const row of parsed.data) {
      const product = row['IDENTIFICADOR DE URL']?.trim();
      if (product && canonical(row.MARCA)) productBrands.set(product,canonical(row.MARCA));
    }
    for (const [i,row] of parsed.data.entries()) {
      const sku = canonical(row.SKU).split('#').map(part => part.trim()).join('#');
      const brand = canonical(row.MARCA) || productBrands.get(row['IDENTIFICADOR DE URL']?.trim()) || '';
      const stockText = row.STOCK.trim();
      const stock = /^-?\d+$/.test(stockText) ? Number(stockText) : NaN;
      if (!/^([^#]+#){2}[^#]+$/.test(sku)) {
        if (!(stock >= 5)) issues.push([sku || 'Fila ' + (i+2), 'Falta un SKU con artículo, color y talle.', brand, stock]);
        continue;
      }
      if (brand) brands.set(sku,brand);
      if (!Number.isSafeInteger(stock) || (variants.has(sku) && variants.get(sku) !== stock)) {
        variants.set(sku, null);
      } else variants.set(sku, stock);
    }
    return {variants, brands, issues};
  }

  function attributes(brand, variant, stock) {
    const classification = canonical(variant?.classification);
    let status = 'Sin determinar';
    if (/\b(DISC|DISCONTINU[OA]S?)\b/.test(classification)) status = 'Discontinuo';
    else if (/^(LINEA|PROMO)\b/.test(classification)) status = 'Sin marca de discontinuidad';
    return {brand:brand || 'Sin marca', status, classification:classification || 'Sin clasificación',
      unit:canonical(variant?.unit) || 'Sin unidad de medida',
      stockBand:stock == null || !Number.isFinite(stock) ? 'Indefinido' : stock < 0 ? 'Negativo' : stock === 0 ? 'Cero' : 'De 1 a 4'};
  }

  function prepare(file, index, filters = {}) {
    const options = {brand:new Set(),status:new Set(),classification:new Set(),unit:new Set(),stockBand:new Set()};
    const matches = values => {
      for (const key of Object.keys(options)) options[key].add(values[key]);
      return Object.entries(filters).every(([key,value]) => !value || values[key] === value);
    };
    const moves = [], issues = [];
    for (const [sku,reason,brand,stock] of file.issues) {
      if (matches(attributes(brand,null,stock))) issues.push([sku,reason]);
    }
    let reviewed = 0;
    for (const [sku, stock] of file.variants) {
      if (stock >= 5) continue;
      const variant = index.get(sku);
      if (!matches(attributes(file.brands.get(sku),variant,stock))) continue;
      if (stock === null) { issues.push([sku,'Stock indefinido, inválido o contradictorio en el CSV.']); continue; }
      reviewed++;
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
    return {moves,issues,reviewed,options};
  }
  return {readFile,indexReport,prepare};
})();
