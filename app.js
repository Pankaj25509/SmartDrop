// app.js – entry point: UI state, events, and glue between webrtc.js and fileTransfer.js.
import { PeerLink } from "./webrtc.js";
import { Receiver, sendFile, fmtBytes, fmtEta, blobUrl, triggerDownload } from "./fileTransfer.js";

const $ = (id) => document.getElementById(id);
const el = { status: $("status"), myId: $("myId"), qr: $("qr"), copy: $("copyBtn"), target: $("targetId"),
  connect: $("connectBtn"), msg: $("msg"), drop: $("drop"), note: $("dropNote"), input: $("fileInput"), list: $("transfers") };

const state = { connected: false, queue: Promise.resolve(), cards: new Map() };

const STATUS_TEXT = { disconnected: "Disconnected", connecting: "Connecting…", connected: "Connected" };

function setMsg(text, isError = false) {
  el.msg.textContent = text;
  el.msg.classList.toggle("err", isError);
}

function setStatus(s, remote) {
  state.connected = s === "connected";
  el.status.dataset.state = s;
  el.status.querySelector("b").textContent = s === "connected" ? `Connected to ${remote}` : STATUS_TEXT[s];
  el.drop.setAttribute("aria-disabled", String(!state.connected));
  el.note.textContent = state.connected ? "Any file type, any size" : "Connect to a device first";
  if (state.connected) setMsg("");
}

/* ---------- Transfer cards ---------- */
function addCard(id, name, size, dir) {
  const li = document.createElement("li");
  li.className = "xfer";
  li.innerHTML = `<div class="head"><span class="name"></span><span class="dir"></span></div>
    <div class="bar"><span></span></div>
    <div class="stats"><span class="pct">0%</span><span class="size"></span><span class="speed">0 MB/s</span><span class="eta">ETA –</span></div>
    <div class="action"></div>`;
  li.querySelector(".name").textContent = name;
  li.querySelector(".dir").textContent = dir;
  li.querySelector(".size").textContent = fmtBytes(size);
  el.list.prepend(li);
  state.cards.set(id, li);
}

function updateCard(id, s) {
  const li = state.cards.get(id);
  if (!li) return;
  li.querySelector(".bar span").style.width = `${s.pct.toFixed(1)}%`;
  li.querySelector(".pct").textContent = `${Math.floor(s.pct)}%`;
  li.querySelector(".speed").textContent = `${(s.speed / 1048576).toFixed(2)} MB/s`;
  li.querySelector(".eta").textContent = `ETA ${s.pct >= 100 ? "done" : fmtEta(s.eta)}`;
}

function finishCard(id, { blob, name, error } = {}) {
  const li = state.cards.get(id);
  if (!li) return;
  li.classList.add(error ? "fail" : "done");
  li.querySelector(".eta").textContent = error || "Complete";
  if (blob) {
    const url = blobUrl(blob);
    const a = Object.assign(document.createElement("a"), { className: "dl", href: url, download: name, textContent: "Download" });
    li.querySelector(".action").append(a);
    triggerDownload(url, name); // instant save; the button remains for re-download
  }
}

/* ---------- Networking ---------- */
const receiver = new Receiver({
  start: (m) => addCard(m.id, m.name, m.size, "Receiving"),
  progress: updateCard,
  done: (id, blob, name) => finishCard(id, { blob, name }),
  fail: (id, error) => finishCard(id, { error }),
});

const link = new PeerLink({
  onReady(id) {
    el.myId.textContent = id;
    const url = `${location.origin}${location.pathname}#${id}`;
    el.qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(url)}`;
    el.qr.hidden = false;
    const target = location.hash.slice(1); // opened via QR code → auto-connect
    if (target && target !== id) { el.target.value = target; link.connect(target); }
  },
  onStatus(s, remote) {
    setStatus(s, remote);
    if (s === "disconnected") receiver.abortAll("Connection closed mid-transfer.");
  },
  onData: (msg) => receiver.handle(msg),
  onError: (text) => setMsg(text, true),
});

function enqueue(files) {
  for (const file of files) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    addCard(id, file.name, file.size, "Sending");
    // Send files one after another so chunks never interleave.
    state.queue = state.queue.then(async () => {
      try {
        await sendFile(link.conn, file, id, (s) => updateCard(id, s));
        finishCard(id);
      } catch (e) {
        finishCard(id, { error: e.message });
      }
    });
  }
}

function handleFiles(fileList) {
  if (!state.connected) return setMsg("Connect to a device before sending files.", true);
  enqueue([...fileList]);
}

/* ---------- UI events ---------- */
el.connect.addEventListener("click", () => { setMsg(""); link.connect(el.target.value); });
el.target.addEventListener("keydown", (e) => { if (e.key === "Enter") el.connect.click(); });

el.copy.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(el.myId.textContent); el.copy.textContent = "Copied"; }
  catch { el.copy.textContent = "Press Ctrl+C"; }
  setTimeout(() => (el.copy.textContent = "Copy"), 1500);
});

el.drop.addEventListener("click", () => state.connected ? el.input.click() : setMsg("Connect to a device before sending files.", true));
el.drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.drop.click(); } });
el.input.addEventListener("change", () => { handleFiles(el.input.files); el.input.value = ""; });

["dragenter", "dragover"].forEach((t) => el.drop.addEventListener(t, (e) => { e.preventDefault(); if (state.connected) el.drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.remove("over"); }));
el.drop.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));
// Stop the browser from navigating to a file dropped outside the zone.
["dragover", "drop"].forEach((t) => window.addEventListener(t, (e) => e.preventDefault()));

setStatus("disconnected");
link.init();
