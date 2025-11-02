// =======================================================
// worker.js v1.5 — Kirim Wallet, Pool, TTF, Diff (Real)
// =======================================================

import { spawn } from "child_process";
import WebSocket from "ws";
import os from "os";
import fs from "fs";

const CONFIG = JSON.parse(fs.readFileSync("./config.json"));
const BRIDGE_WS = "ws://49.51.170.51:7070";

const poolHost = CONFIG.url.split(":")[0];
const poolPort = parseInt(CONFIG.url.split(":")[1]);
const wallet = CONFIG.user;
const algo = CONFIG.algo || "power2b";
const threads = CONFIG.threads || os.cpus().length;

let accepted = 0;
let lastAcceptedTime = Date.now();
let diff = 0;
let ws;

function connectWS() {
  ws = new WebSocket(BRIDGE_WS);
  ws.on("open", () => console.log("[worker] 🔗 Terhubung ke bridge"));
  ws.on("close", () => setTimeout(connectWS, 5000));
  ws.on("error", () => {});
}
connectWS();

// Jalankan miner
const miner = spawn("./joko", ["-c", "config.json"]);

miner.stdout.on("data", d => handleMinerLine(d.toString()));
miner.stderr.on("data", d => handleMinerLine(d.toString()));

function handleMinerLine(line) {
  if (!line || !line.trim()) return;
  const text = line.trim();

  // Deteksi difficulty
  const diffMatch = text.match(/diff[=:]\s*(\d+(\.\d+)?)/i);
  if (diffMatch) diff = parseFloat(diffMatch[1]);

  // Deteksi share accepted
  if (/accepted/i.test(text) || /result.*true/i.test(text)) {
    accepted++;
    const now = Date.now();
    const ttf = (now - lastAcceptedTime) / 1000;
    lastAcceptedTime = now;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        source: "worker",
        wallet,
        pool: { host: poolHost, port: poolPort },
        accepted,
        ttf,
        diff: diff || 0
      }));
    }
  }
}

miner.on("close", code => console.log("[worker] Miner berhenti:", code));
