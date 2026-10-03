// fileTransfer.js – chunking, backpressure, progress metering, reassembly, download.
// Wire protocol (PeerJS binary serialization):
//   {type:'meta',  id, name, size, mime, total}
//   {type:'chunk', id, index, data:ArrayBuffer}
//   {type:'done',  id}

export const CHUNK_SIZE = 64 * 1024;      // 64 KB per chunk
const MAX_BUFFERED = 4 * 1024 * 1024;     // pause sending above 4 MB queued in the data channel

const readSlice = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const fmtBytes = (n) => {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
};

export const fmtEta = (s) => {
  if (!isFinite(s)) return "calculating…";
  if (s < 1) return "<1s";
  const m = Math.floor(s / 60);
  return m ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
};

/** Smoothed throughput + ETA tracker. */
class Meter {
  constructor(total) {
    this.total = total;
    this.last = performance.now();
    this.lastBytes = 0;
    this.speed = 0; // bytes/s
  }
  update(bytes) {
    const now = performance.now();
    const dt = now - this.last;
    if (dt >= 250 || bytes >= this.total) {
      const inst = ((bytes - this.lastBytes) / dt) * 1000;
      this.speed = this.speed ? this.speed * 0.6 + inst * 0.4 : inst;
      this.last = now;
      this.lastBytes = bytes;
    }
    return {
      bytes,
      pct: this.total ? (bytes / this.total) * 100 : 100,
      speed: this.speed,
      eta: this.speed > 0 ? (this.total - bytes) / this.speed : Infinity,
    };
  }
}

/** Reads the file slice by slice so memory stays flat on the sender. */
export async function sendFile(conn, file, id, onProgress) {
  const total = Math.ceil(file.size / CHUNK_SIZE);
  const meter = new Meter(file.size);
  conn.send({ type: "meta", id, name: file.name, size: file.size, mime: file.type, total });

  for (let i = 0; i < total; i++) {
    if (!conn.open) throw new Error("Connection lost");
    // Backpressure: wait for the RTCDataChannel send buffer to drain.
    while (conn.dataChannel && conn.dataChannel.bufferedAmount > MAX_BUFFERED) await sleep(15);

    const data = await readSlice(file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    conn.send({ type: "chunk", id, index: i, data });
    onProgress(meter.update(Math.min((i + 1) * CHUNK_SIZE, file.size)));
  }
  conn.send({ type: "done", id });
  onProgress(meter.update(file.size));
}

/** Collects chunks and rebuilds each file as a Blob. */
export class Receiver {
  /** @param {{start(meta), progress(id, stats), done(id, blob, name), fail(id, text)}} cb */
  constructor(cb) {
    this.cb = cb;
    this.items = new Map();
  }

  handle(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "meta") {
      this.items.set(msg.id, { ...msg, parts: new Array(msg.total), got: 0, bytes: 0, meter: new Meter(msg.size) });
      this.cb.start(msg);
      return;
    }
    const t = this.items.get(msg.id);
    if (!t) return;

    if (msg.type === "chunk") {
      t.parts[msg.index] = msg.data;
      t.got++;
      t.bytes += msg.data.byteLength;
      this.cb.progress(msg.id, t.meter.update(t.bytes));
    } else if (msg.type === "done") {
      this.items.delete(msg.id);
      if (t.got !== t.total) return this.cb.fail(msg.id, "Transfer incomplete – chunks were missing.");
      this.cb.progress(msg.id, t.meter.update(t.size));
      this.cb.done(msg.id, new Blob(t.parts, { type: t.mime || "application/octet-stream" }), t.name);
    }
  }

  abortAll(text) {
    for (const id of this.items.keys()) this.cb.fail(id, text);
    this.items.clear();
  }
}

/** Creates an object URL for the finished file. Caller can attach it to a link or click it. */
export function blobUrl(blob) {
  return URL.createObjectURL(blob);
}

export function triggerDownload(url, name) {
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
}
