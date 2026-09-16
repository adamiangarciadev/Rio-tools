const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const values = new Map([
  ["pickeo_meta_v1", JSON.stringify({ responsable: "DIEGO", origen: "DEPOSITO", destino: "AV2", bultos: "2" })],
  ["pickeo_scans_v1", JSON.stringify([{ id: 1, code: "7790001", ok: true, time: new Date().toISOString() }])]
]);

const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const listeners = {};
    elements.set(id, {
      id,
      value: "",
      textContent: "",
      innerHTML: "",
      placeholder: "",
      disabled: false,
      readOnly: false,
      className: "",
      classList: { add() {}, remove() {} },
      addEventListener(type, fn) { listeners[type] = fn; },
      setAttribute() {},
      appendChild() {},
      focus() {},
      closest() { return null; },
      get offsetWidth() { return 1; },
      listeners
    });
  }
  return elements.get(id);
}

let ready;
let cuadernilloCalls = 0;
let txtCalls = 0;
const document = {
  querySelector(selector) { return element(selector.replace(/^#/, "")); },
  createElement() { return element(`created-${elements.size}`); },
  addEventListener(type, fn) { if (type === "DOMContentLoaded") ready = fn; }
};

const context = {
  console: { ...console, error() {} },
  document,
  navigator: {},
  localStorage: {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  },
  fetch: async url => {
    if (String(url).startsWith("./")) return { ok: true, text: async () => "codigo;articulo\n7790001;A1" };
    if (String(url).includes("AKfycbyAlP7")) {
      cuadernilloCalls++;
      return { ok: true, json: async () => ({ ok: true, remito: "4321" }) };
    }
    txtCalls++;
    if (txtCalls === 1) return { ok: false, status: 404 };
    return { ok: true, json: async () => ({ ok: true }) };
  },
  setTimeout(fn, ms) { if (ms < 600) fn(); return 1; },
  clearTimeout() {},
  Date,
  Map,
  JSON,
  String,
  Number,
  Boolean,
  Math,
  RegExp,
  Object,
  Array,
  Error,
  Promise
};
context.window = context;

vm.runInNewContext(fs.readFileSync("apps/picking-salida/app.js", "utf8"), context);
ready();

async function run() {
  const guardar = element("downloadBtn").listeners.click;
  await guardar();

  const pending = JSON.parse(values.get("pickeo_pending_txt_v1"));
  assert.equal(pending.remito, "4321");
  assert.equal(cuadernilloCalls, 1);
  assert.equal(txtCalls, 1);

  await guardar();
  assert.equal(cuadernilloCalls, 1, "el reintento no debe crear otro remito");
  assert.equal(txtCalls, 2);
  assert.equal(values.has("pickeo_pending_txt_v1"), false);
  console.log("OK: un 404 del TXT conserva el remito y el reintento no crea otro.");
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
