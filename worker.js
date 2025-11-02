// worker.js
// Run ./joko -c config.json, parse miner output, send stats to bridge via WebSocket
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import WebSocket from "ws";
import os from "os";

const CONFIG_PATH = path.resolve("./config.json");
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("[worker] ❌ config.json not found in current folder");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

// wallet comes from config.user (split before '.' if worker name included)
const rawUser = (config.user || "").toString();
const wallet = rawUser.split(/[.\s]/)[0] || "unknown";

// Bridge WS URL - override by env BRIDGE_WS, default to 49.51.170.51:7070
const BRIDGE_WS = process.env.BRIDGE_WS || "ws://49.51.170.51:7070";

const WORKER_ID = `${os.hostname()}-${Math.floor(Math.random() * 90000 + 10000)}`;

// State
let ws = null;
let connected = false;
let lastSent = 0;
let sendIntervalMs = 5000; // at least every 5s send an update
let pending = { wallet, workerId: WORKER_ID, hashrate: 0, accepted: 0, source: "worker" };
let lastSentSnapshot = JSON.stringify(pending);

// Miner process
function spawnMiner() {
  console.log(`[worker] 🚀 starting miner: ./joko -c config.json`);
  const miner = spawn("./joko", ["-c", "config.json"], { stdio: ["ignore", "pipe", "pipe"] });

  miner.stdout.on("data", (buf) => {
    const s = buf.toString();
    s.split(/\r?\n/).forEach(handleMinerLine);
    // also print to worker stdout so user sees miner logs
    process.stdout.write(`[miner] ${s}`);
  });

  miner.stderr.on("data", (buf) => {
    const s = buf.toString();
    process.stderr.write(`[miner err] ${s}`);
    s.split(/\r?\n/).forEach(handleMinerLine);
  });

  miner.on("close", (code, signal) => {
    console.log(`[worker] miner exited (code=${code} signal=${signal}), restarting in 3s...`);
    setTimeout(spawnMiner, 3000);
  });

  miner.on("error", (err) => {
    console.error("[worker] miner spawn error:", err.message);
    setTimeout(spawnMiner, 5000);
  });
}

// Parse miner log lines to extract hashrate and accepted
function handleMinerLine(line) {
  if (!line || !line.trim()) return;
  const text = line.trim();

  // accepted patterns (several miner variants)
  // examples:
  // "accepted: 32/35", "Accepted 32/35", "accepted (share): true", "result: true"
  const acceptedMatch = text.match(/accepted[:\s]*\s*(\d+)\s*\/\s*(\d+)/i)
    || text.match(/accepted[:\s]*\s*(\d+)/i);
  if (acceptedMatch) {
    // prefer total accepted if provided as second group, else single number
    const total = acceptedMatch[2] ? parseInt(acceptedMatch[2], 10) : parseInt(acceptedMatch[1], 10);
    if (!Number.isNaN(total)) {
      pending.accepted = total;
    }
  } else {
    // some miners print "accepted" with single number elsewhere
    const singleAccepted = text.match(/\baccepted[:\s]*\s*(\d+)\b/i);
    if (singleAccepted) pending.accepted = parseInt(singleAccepted[1], 10);
  }

  // result:true style (some miners)
  const resultMatch = text.match(/"result"\s*:\s*(true|1)/i) || text.match(/\bresult[:=]\s*(true|1)\b/i);
  if (resultMatch) {
    // if result true, we can increment accepted by 1 as fallback (but safer to trust explicit counts)
    pending.accepted = (pending.accepted || 0);
  }

  // hashrate patterns:
  // "2.35 khash/s", "2350 H/s", "2.35 kH/s", "2.35 khash/s", "2.35 kh/s"
  const hashMatch = text.match(/([0-9]*\.?[0-9]+)\s*(k?)(h(?:ash)?\/s|H\/s|kh\/s|khash\/s|KH\/s)/i);
  if (hashMatch) {
    let val = parseFloat(hashMatch[1]);
    const kilo = hashMatch[2] && hashMatch[2].toLowerCase() === "k";
    if (kilo) val = val * 1000;
    // convert to H/s (samples may vary); store in H/s
    pending.hashrate = Number.isFinite(val) ? Number(val) : pending.hashrate;
  } else {
    // some miners print "khash/s" but captured differently; try generic "khash" or "kh/s"
    const alt = text.match(/([0-9]*\.?[0-9]+)\s*(k?)(hash|kh|khash)/i);
    if (alt) {
      let val = parseFloat(alt[1]);
      if (alt[2] && alt[2].toLowerCase() === "k") val *= 1000;
      pending.hashrate = Number.isFinite(val) ? Number(val) : pending.hashrate;
    }
  }

  // If the line contains the wallet (some miners echo it), update wallet
  const walletMatch = text.match(/([a-zA-Z0-9]{20,})/);
  if (walletMatch && walletMatch[1] && wallet === "unknown") {
    // avoid overwriting if config provided wallet already
    // we only set if unknown
    // NOTE: we'll keep wallet from config if present
    // (this clause is here just in case)
    // wallet = walletMatch[1];
  }

  // schedule send (throttle)
  maybeSendUpdate();
}

// WebSocket connection to bridge with reconnect
function connectBridge() {
  try {
    ws = new WebSocket(BRIDGE_WS);

    ws.on("open", () => {
      connected = true;
      console.log(`[worker] 🔗 Connected to bridge ${BRIDGE_WS}`);
      // immediately send current state
      sendUpdate(true);
    });

    ws.on("message", (msg) => {
      // optional: bridge can send commands back (not used now)
      // console.log("[worker] recv:", msg.toString());
    });

    ws.on("close", () => {
      connected = false;
      console.log("[worker] ❌ Bridge connection closed, reconnect in 5s");
      setTimeout(connectBridge, 5000);
    });

    ws.on("error", (err) => {
      connected = false;
      // suppress frequent errors
      if (err && err.message) console.error("[worker] ws error:", err.message);
      ws.close();
    });
  } catch (e) {
    connected = false;
    console.error("[worker] connect error:", e.message);
    setTimeout(connectBridge, 5000);
  }
}
connectBridge();

// Send update if changed or forced
function sendUpdate(force = false) {
  const now = Date.now();
  if (!force && (now - lastSent) < sendIntervalMs) {
    // throttle to at most once per sendIntervalMs unless changed significantly
    const snapshot = JSON.stringify(pending);
    if (!force && snapshot === lastSentSnapshot) return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    const payload = {
      wallet: pending.wallet || wallet,
      workerId: pending.workerId || WORKER_ID,
      hashrate: pending.hashrate || 0,
      accepted: pending.accepted || 0,
      source: "worker"
    };
    try {
      ws.send(JSON.stringify(payload));
      lastSent = now;
      lastSentSnapshot = JSON.stringify(pending);
      // console.log("[worker] sent", payload);
    } catch (e) {
      console.error("[worker] send error:", e.message);
    }
  }
}

// If miners produce changes frequently, call this to debounce sends
let sendTimer = null;
function maybeSendUpdate() {
  if (sendTimer) clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    sendUpdate();
    sendTimer = null;
  }, 300); // small debounce to accumulate a few lines
}

// periodic forced send (in case no changes but want heartbeat)
setInterval(() => sendUpdate(false), sendIntervalMs);

// start miner
spawnMiner();
