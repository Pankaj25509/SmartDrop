# SmartDrop ⚡

An aesthetic, responsive, zero-server-storage Peer-to-Peer (P2P) file sharing web application. SmartDrop enables direct browser-to-browser file transfers of any size using WebRTC datachannels, complete with real-time transfer progress tracking and QR code connection pairing.

---

## ✨ Features

- **Direct P2P Transfer:** Files stream directly between browsers via WebRTC—never stored on external servers.
- **Memory-Optimized Binary Streaming:** Uses `ArrayBuffer` chunking (16KB–64KB buffers) to transfer large files without exceeding browser memory limits.
- **Aesthetic Glassmorphism UI:** Modern single-page interface with dynamic glowing accents, dark mode default, and smooth CSS transitions.
- **QR Code Pairing:** Generates a real-time QR code for fast mobile-to-desktop pairing.
- **Live Transfer Metrics:** Displays progress percentage, active transfer speed (MB/s), and file assembly status.

---

## 🛠️ Project Structure

```text
├── index.html        # App layout, UI elements, and script links
├── styles.css        # Responsive glassmorphism styling & animations
├── app.js            # Main application state, DOM events, UI updates
├── webrtc.js         # PeerJS connection lifecycle & signaling
└── fileTransfer.js   # Binary chunking, ArrayBuffer reading & blob reassembly
```

---

## 🚀 Quick Start

1. Clone this repository:
   ```bash
   git clone [https://github.com/Pankaj25509/smartdrop-p2p.git](https://github.com/Pankaj25509/smartdrop-p2p.git)
   ```
2. Open the project using VS Code Live Server or run a local HTTP server:
   ```bash
   npx serve .
   ```
3. Open `http://localhost:3000` on two separate tabs or devices to test file transfers!

---

## 📝 License

Distributed under the MIT License.
