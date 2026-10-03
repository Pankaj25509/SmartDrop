// webrtc.js – PeerJS setup, pairing and connection lifecycle.
// Relies on the global `Peer` from the PeerJS CDN script.

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alike characters
const makeId = () =>
  "sd-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join("");

export class PeerLink {
  /**
   * @param {{onReady(id), onStatus(state, remoteId?), onData(msg), onError(text)}} handlers
   */
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conn = null;
    this.timer = null;
  }

  init(attempt = 0) {
    this.peer = new Peer(makeId(), { debug: 1 });

    this.peer.on("open", (id) => this.h.onReady(id));

    this.peer.on("connection", (c) => {
      if (this.conn && this.conn.open) { // already paired: reject extras
        c.on("open", () => c.close());
        return;
      }
      this._bind(c);
    });

    // Signalling server dropped us; existing P2P links keep working, so just re-register.
    this.peer.on("disconnected", () => { if (!this.peer.destroyed) this.peer.reconnect(); });

    this.peer.on("error", (e) => {
      if (e.type === "unavailable-id" && attempt < 5) {
        this.peer.destroy();
        this.init(attempt + 1);
      } else if (e.type === "peer-unavailable") {
        this._clearTimer();
        this.h.onStatus("disconnected");
        this.h.onError("No device found with that code. Check it and try again.");
      } else {
        this.h.onError(`Connection error (${e.type}).`);
      }
    });
  }

  connect(targetId) {
    const id = targetId.trim().toLowerCase();
    if (!id) return this.h.onError("Enter the code shown on the other device.");
    if (id === this.peer?.id) return this.h.onError("That's your own code.");
    if (this.conn && this.conn.open) this.conn.close();

    this.h.onStatus("connecting");
    this._bind(this.peer.connect(id, { reliable: true }));
    this.timer = setTimeout(() => {
      if (!this.conn || !this.conn.open) {
        this.h.onStatus("disconnected");
        this.h.onError("Timed out. Make sure both devices are online and try again.");
      }
    }, 15000);
  }

  _bind(c) {
    this.h.onStatus("connecting");
    c.on("open", () => {
      this._clearTimer();
      this.conn = c;
      this.h.onStatus("connected", c.peer);
    });
    c.on("data", (d) => this.h.onData(d));
    c.on("close", () => {
      if (this.conn === c) this.conn = null;
      this.h.onStatus("disconnected");
    });
    c.on("error", () => this.h.onError("The data connection failed."));
  }

  disconnect() { if (this.conn) this.conn.close(); }
  _clearTimer() { clearTimeout(this.timer); this.timer = null; }
}
