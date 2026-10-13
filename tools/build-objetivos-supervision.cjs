// Genera un Code.gs independiente copiando SOLO configuración de cálculo y funciones puras.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'apps/objetivos-ventas/apps-script.gs'), 'utf8');
const config = vm.runInNewContext(source.slice(0, source.indexOf('function doGet')) + '\nAPP;');
const accessSource = fs.readFileSync(path.join(root, 'assets/rio-access.js'), 'utf8');
const password = accessSource.match(/const ACCESS_PASS = "([^"]+)";/)?.[1];
if (!password) throw new Error('No se encontró la configuración común de Supervisores.');
const readConfig = { dataFileId: config.dataFileId, timezone: config.timezone, dayWeights: config.dayWeights, holidays: config.holidays, stores: config.stores.map(({id,name,monthlyGoal,weekdayWeights}) => ({id,name,monthlyGoal,weekdayWeights})) };
const functions = ['monthPlan_', 'remainingWeight_', 'dayWeight_', 'dayType_', 'parseLocalDate_', 'percent_', 'safeEquals_', 'goalForStore_'];
function extract(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Falta función de cálculo: ' + name);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? source.length : next).trim();
}
const hash = crypto.createHash('sha256').update(password).digest('hex');
const core = fs.readFileSync(path.join(root, 'apps/objetivos-ventas-supervision/api-core.gs'), 'utf8');
const output = '// Generado con node tools/build-objetivos-supervision.cjs.\n// Proyecto NUEVO de Apps Script; no reemplaza Objetivos de ventas.\n\nconst APP = Object.freeze(' + JSON.stringify(readConfig, null, 2) + ');\nconst SUPERVISION_PASSWORD_HASH = "' + hash + '";\n\n' + core + '\n\n' + functions.map(extract).join('\n\n') + '\n';
fs.writeFileSync(path.join(root, 'apps/objetivos-ventas-supervision/apps-script.gs'), output);
console.log('Script independiente generado: solo lectura, misma distribución de objetivos.');
