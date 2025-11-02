import WebSocket from "ws";
import { spawn } from "child_process";
import fs from "fs";

// === KONFIGURASI ===
const CONFIG_PATH = "./config.json";        // File konfigurasi miner
const MINER_BIN = "./joko";                 // Binary miner
let currentMiner = null;
let config = {};
let BRIDGE_URL = "";                        // Akan diambil dari config otomatis

// === LOAD CONFIG.JSON ===
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  console.log("✅ Loaded config.json successfully!");

  // Jika bridge tidak ditentukan di config.json, fallback manual
  BRIDGE_URL = config.bridge || "ws://43.132.135.39:8080";
} catch (err) {
  console.error("⚠️ Gagal membaca config.json, gunakan default!");
  config = {
    algo: "power2b",
    pool: "stratum+tcp://51.79.215.200:7022",
    wallet: "default_wallet",
    threads: 2,
  };
  BRIDGE_URL = "ws://43.132.135.39:8080";
}

// === KONEKSI KE BRIDGE ===
console.log(`🔗 Connecting to bridge: ${BRIDGE_URL}`);
const ws = new WebSocket(BRIDGE_URL);

ws.on("open", () => {
  console.log(`✅ Connected to bridge: ${BRIDGE_URL}`);
  console.log("🚀 Sending worker configuration...");
  
  // Kirim konfigurasi worker ke bridge.js
  ws.send(
    JSON.stringify({
      type: "hello",
      config: {
        pool: config.url || config.pool,
        wallet: config.user || config.wallet,
        algo: config.algo || "power2b",
        threads: config.threads || 1,
      },
    })
  );

  console.log("⚙️ Starting local miner automatically...");
  runMiner(); // Jalankan miner setelah terhubung
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data.toString());

    // === Restart miner dari bridge.js ===
    if (msg.type === "restart") {
      console.log("♻️ Restart signal received from bridge!");
      restartMiner();
    }
  } catch (err) {
    console.error("⚠️ Error parsing message from bridge:", err.message);
  }
});

ws.on("close", () => {
  console.log("❌ Disconnected from bridge. Reconnecting in 10s...");
  setTimeout(() => process.exit(1), 10000);
});

ws.on("error", (err) => {
  console.error("⚠️ WebSocket error:", err.message);
});

// === JALANKAN MINER ===
function runMiner() {
  if (!fs.existsSync(MINER_BIN)) {
    console.error(`❌ Miner binary not found: ${MINER_BIN}`);
    return;
  }

  console.log("💽 Launching miner process...");
  currentMiner = spawn(MINER_BIN, ["-c", CONFIG_PATH]);

  currentMiner.stdout.on("data", (data) => {
    const output = data.toString().trim();
    console.log("🧠", output);

    // Kirim log ke bridge untuk parsing kH/s & accepted share
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "log", log: output }));
    }

    // Cek kalau output menunjukkan share accepted, kirim submit ke bridge
    if (output.includes("Accepted")) {
      ws.send(
        JSON.stringify({
          type: "submit",
          submit: {
            id: "submit_" + Date.now(),
            method: "mining.submit",
            params: [config.wallet, "share", "00000001"],
          },
        })
      );
    }
  });

  currentMiner.stderr.on("data", (data) => {
    console.error("❗ Miner error:", data.toString());
  });

  currentMiner.on("close", (code) => {
    console.log(`💤 Miner exited with code ${code}`);
    setTimeout(runMiner, 5000); // Restart otomatis 5 detik
  });
}

// === RESTART MINER ===
function restartMiner() {
  if (currentMiner) {
    console.log("🧹 Killing existing miner...");
    currentMiner.kill("SIGTERM");
    setTimeout(runMiner, 3000);
  } else {
    runMiner();
  }
}
