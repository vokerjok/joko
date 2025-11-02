// ========================================================
// worker.js v1.3 — Sinkronisasi penuh dengan bridge.js terbaru
// ========================================================

import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import WebSocket from "ws";
import path from "path";

// ---------------- CONFIG ----------------
const CONFIG_PATH = path.resolve("./config.json");
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("[worker] ❌ File config.json tidak ditemukan.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const rawUser = (config.user || "").toString();
const wallet = rawUser.split(/[.\s]/)[0] || "unknown";
const poolHost = (config.url || "").split(":")[0].replace("stratum+tcp://", "").replace("tcp://", "");
const poolPort = parseInt((config.url || "").split(":")[1]) || 7022;

// Ganti IP berikut dengan IP VPS Bridge kamu
const BRIDGE_WS = process.env.BRIDGE_WS || "ws://49.51.170.51:7070";

const WORKER_ID = `${os.hostname()}-${Math.floor(Math.random() * 9000 + 1000)}`;
const LOCAL_IP = (() => {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "0.0.0.0";
})();

// ---------------- STATE ----------------
let ws = null;
let accepted = 0;
let connected = false;
let lastShareTime = Date.now();

// ---------------- START MINER ----------------
function spawnMiner() {
  console.log(`[worker] 🚀 Menjalankan ./joko -c config.json`);

  const miner = spawn("./joko", ["-c", "config.json"], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  miner.stdout.on("data", buf => {
    const text = buf.toString();
    process.stdout.write(`[miner] ${text}`);
    text.split(/\r?\n/).forEach(handleMinerLine);
  });

  miner.stderr.on("data", buf => {
    const text = buf.toString();
    process.stderr.write(`[miner err] ${text}`);
    text.split(/\r?\n/).forEach(handleMinerLine);
  });

  miner.on("close", code => {
    console.log(`[worker] ⚠️ Miner berhenti (code=${code}), restart dalam 5 detik...`);
    setTimeout(spawnMiner, 5000);
  });
}

// ---------------- HANDLE MINER OUTPUT ----------------
function handleMinerLine(line) {
  if (!line || !line.trim()) return;
  const text = line.trim();

  // Deteksi share accepted (Stratum output)
  if (/accepted/i.test(text) || /result.*true/i.test(text)) {
    accepted++;
    lastShareTime = Date.now();
  }
}

// ---------------- BRIDGE CONNECTION ----------------
function connectBridge() {
  try {
    ws = new WebSocket(BRIDGE_WS);

    ws.on("open", () => {
      connected = true;
      console.log(`[worker] 🟢 Terhubung ke bridge ${BRIDGE_WS}`);
      sendUpdate(true);
    });

    ws.on("close", () => {
      connected = false;
      console.log("[worker] 🔴 Terputus dari bridge. Reconnect dalam 5 detik...");
      setTimeout(connectBridge, 5000);
    });

    ws.on("error", err => {
      connected = false;
      console.error("[worker] ⚠️ WS error:", err.message);
      try { ws.close(); } catch {}
    });
  } catch (err) {
    console.error("[worker] ❌ Gagal konek ke bridge:", err.message);
    setTimeout(connectBridge, 5000);
  }
}

connectBridge();

// ---------------- HEARTBEAT ----------------
function sendUpdate(force = false) {
  if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;

  const payload = {
    source: "worker",
    wallet,
    ip: LOCAL_IP,
    workerId: WORKER_ID,
    accepted,
    lastShareAgo: Math.floor((Date.now() - lastShareTime) / 1000),
    pool: { host: poolHost, port: poolPort }
  };

  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    console.error("[worker] ⚠️ Gagal kirim data:", err.message);
  }
}

// Kirim data setiap 5 detik
setInterval(() => sendUpdate(), 5000);

// ---------------- RUN MINER ----------------
spawnMiner();
