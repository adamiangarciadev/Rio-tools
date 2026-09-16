(() => {
  'use strict';
  const API_URL = 'https://script.google.com/macros/s/AKfycbyjV61vxornSXgFNt10L-IohoU2Bp002flTPV7LMjCr-PFGA98rFx_sgBQbB72zfEvR/exec';
  const DB_NAME = 'rio-operational-cache';
  const STORE = 'transit-remitos';
  const pending = new Map();
  let dbPromise;

  function openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (!dbPromise) dbPromise = new Promise(resolve => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  async function read(branch) {
    const db = await openDb();
    if (!db) return null;
    return new Promise(resolve => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(branch);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async function write(branch, value) {
    const db = await openDb();
    if (!db) return;
    return new Promise(resolve => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(value, branch);
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    });
  }

  function refresh(branch) {
    if (!branch) return Promise.reject(new Error('Falta la sucursal'));
    if (pending.has(branch)) return pending.get(branch);
    const job = (async () => {
      const response = await fetch(`${API_URL}?accion=listar&sucursal=${encodeURIComponent(branch)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.remitos)) throw new Error(data.error || 'No se pudieron cargar los remitos');
      const snapshot = { remitos: data.remitos, updatedAt: Date.now() };
      await write(branch, snapshot);
      return snapshot;
    })();
    pending.set(branch, job);
    job.finally(() => pending.delete(branch)).catch(() => {});
    return job;
  }

  window.RioTransitCache = { read, refresh };
})();
