const BUFFER_TIMEOUT = 10
const MAX_TRANSACTION_SIZE = 200

/**
 * A minimal key-value IndexedDB key-value store.key-value
 * adapted from IDB-Keyval by Jake Archibald
 */
export class Store {
  storeName: string
  _dbp: Promise<IDBDatabase>

  constructor(dbName: string, storeName: string, keyPath?: string) {
    this.storeName = storeName
    this._dbp = this._initialize(dbName, storeName, keyPath)
  }

  _initialize(
    dbName: string,
    storeName: string,
    keyPath?: string,
    version?: number
  ): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const openreq = indexedDB.open(dbName, version)
      const self = this // eslint-disable-line @typescript-eslint/no-this-alias
      let db: IDBDatabase

      openreq.onerror = onerror
      openreq.onupgradeneeded = onupgradeneeded
      openreq.onsuccess = onsuccess

      function onupgradeneeded() {
        // console.log(`"${dbName}" onupgradeneeded: adding "${storeName}"`, e);
        db = openreq.result
        if (keyPath === undefined) db.createObjectStore(storeName)
        else db.createObjectStore(storeName, { keyPath: keyPath })
      }

      function onerror(event) {
        console.log(`"${dbName}" error`, event.target.error)
        reject(event)
      }

      function onsuccess() {
        // console.log(`"${dbName}" success`, event)
        db = openreq.result
        db.onversionchange = onversionchange

        if (db.objectStoreNames.contains(storeName)) resolve(db)
        else {
          // console.log(`"${storeName}" not in "${dbName}". attempting upgrade...`)
          upgrade()
        }
      }

      function onversionchange() {
        // console.log(`"${dbName}" versionchange`);
        upgrade()
      }

      function upgrade() {
        const v = +db.version
        db.close()
        self._dbp = self._initialize(dbName, storeName, keyPath, v + 1)
        self._dbp.then((db) => resolve(db))
      }
    })
  }

  _withIDBStore(
    type: IDBTransactionMode,
    callback: (t: IDBObjectStore) => void
  ) {
    return this._dbp.then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(this.storeName, type)
          transaction.oncomplete = () => resolve()
          transaction.onabort = transaction.onerror = () =>
            reject(transaction.error)
          callback(transaction.objectStore(this.storeName))
        })
    )
  }

  async close() {
    const db = await this._dbp
    return db.close()
  }
}

/**
 * Bulk Transactions
 */

type OpName = "get" | "put" | "del"
type Resolve = (x?: unknown) => void
type Reject = (reason: unknown) => void
type OpList = {
  [key: string]: { resolve: Resolve; reject: Reject; value?: unknown }
}
type Transaction = {
  [key: string]: OpList
}

const pendingTransactions: Map<Store, Transaction> = new Map()

function doBulkGet(store: Store) {
  return store
    ._withIDBStore("readonly", (thisTransactionObjectStore) => {
      // We do one transaction involving queries.count OpNames
      const queries = pendingTransactions.get(store)
      if (!queries) return

      const getQueries = queries.get

      // clear this set of pending transactions so no one will add to it
      queries.get = {}

      // make all the get requests
      for (const [key, { resolve, reject }] of Object.entries(getQueries)) {
        const req = thisTransactionObjectStore.get(key)
        req.onsuccess = (e) => resolve(e.target.result)
        req.onerror = (e) => reject(e)
      }
    })
    .then(() => {
      // console.log(`${store.storeName}: got ${count} in ${Date.now()-t0}ms`)
    })
}

function doBulkPutDel(store: Store) {
  // const t0 = Date.now()
  // let delCount = 0
  // let putCount = 0

  return store
    ._withIDBStore("readwrite", (thisTransactionObjectStore) => {
      // We do one transaction involving queries.count OpNames
      const queries = pendingTransactions.get(store)
      if (!queries) return

      const putQueries = queries.put
      const delQueries = queries.del

      // delete this set of pending transactions so no one will add to them
      queries.put = {}
      queries.del = {}

      // make all put and del requests
      for (const [key, { value, resolve, reject }] of Object.entries(
        putQueries
      )) {
        const req = thisTransactionObjectStore.put(value, key)
        req.onsuccess = () => resolve()
        req.onerror = (e) => reject(e)
      }

      for (const [key, { resolve, reject }] of Object.entries(delQueries)) {
        const req = thisTransactionObjectStore.delete(key)
        req.onsuccess = () => resolve()
        req.onerror = (e) => reject(e)
      }
    })
    .then(() => {
      // console.log(`${store.storeName}: put ${putCount}, del ${delCount} in ${Date.now()-t0}ms`)
    })
}

/**
 * Rather than opening a new transaction for each get OpName, we
 * store the OpNames into a buffer, and perform a batch OpName in
 * one transaction when nothing has been added to the buffer for
 */
function addOp(store: Store, op: OpName, key: string, value?: unknown) {
  return new Promise((resolve, reject) => {
    if (!pendingTransactions.has(store)) {
      pendingTransactions.set(store, {
        get: {},
        put: {},
        del: {},
      })
    }
    const queries = pendingTransactions.get(store)
    queries[op][key] = { value, resolve, reject }
    const myNum = Object.keys(queries[op]).length

    /*
     * Here we set a short timeout to allow for more ops to be added.
     * when we come back, if nothing has been added then we go ahead and
     * perform a bulk transaction.
     */
    setTimeout(() => {
      const opCount = Object.keys(queries.get).length
      if (op === "get") {
        if (opCount > MAX_TRANSACTION_SIZE || opCount === myNum + 1) {
          doBulkGet(store)
        }
        return
      }

      const putDelCount =
        Object.keys(queries.put).length + Object.keys(queries.del).length
      if (putDelCount > MAX_TRANSACTION_SIZE || opCount === myNum + 1) {
        doBulkPutDel(store)
      }
    }, BUFFER_TIMEOUT)
  })
}

export function get(key, store) {
  return addOp(store, "get", key)
}

export function set(key, value, store) {
  return addOp(store, "put", key, value)
}

export function del(key, store) {
  return addOp(store, "del", key)
}

export function clear(store) {
  return store._withIDBStore("readwrite", (store) => {
    store.clear()
  })
}

export function keys(store) {
  const keys = []
  return store
    ._withIDBStore("readonly", (store) => {
      // This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
      // And openKeyCursor isn't supported by Safari.
      ;(store.openKeyCursor || store.openCursor).call(store).onsuccess =
        function () {
          if (!this.result) return
          keys.push(this.result.key)
          this.result.continue()
        }
    })
    .then(() => keys)
}
