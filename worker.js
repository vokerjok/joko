import WebSocket from "ws";
import { spawn } from "child_process";
import fs from "fs";
// === KONFIGURASI ===
const BRIDGE_URL = "ws://43.132.135.39:8080"; // Ganti sesuai IP VPS bridge kamu
const CONFIG_PATH = "./config.json";           // File konfigurasi miner
const MINER_BIN = "./joko";                    // File binary miner hasil build
let currentMiner = null;
// === KONEKSI KE BRIDGE ===
const ws = new WebSocket(BRIDGE_URL);
ws.on("open", () => {
  console.log(`🔗 Connected to bridge: ${BRIDGE_URL}`);
  console.log("🚀 Starting local miner automatically...");
  runMiner(); // Langsung jalankan miner begitu connect
});
ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data.toString());
    // Kalau bridge kirim instruksi restart miner
    if (msg.type === "restart") {
      console.log("♻️ Restart signal received from bridge!");
      restartMiner();
    }
  } catch (err) {
    console.error("⚠️ Error parsing message from bridge:", err.message);
  }
});
ws.on("close", () => {
  console.log("❌  Disconnected from bridge. Reconnecting in 10s...");
  setTimeout(() => process.exit(1), 10000);
});
ws.on("error", (err) => {
  console.error("⚠️ WebSocket error:", err.message);
});
// === JALANKAN MINER ===
function runMiner() {
  if (!fs.existsSync(MINER_BIN)) {
    console.error(`❌  Miner binary not found: ${MINER_BIN}`);
    return;
  }
  console.log("💽 Launching miner process...");
  currentMiner = spawn(MINER_BIN, ["-c", CONFIG_PATH]);
  currentMiner.stdout.on("data", (data) => {
    const output = data.toString().trim();
    console.log("🧠", output);
    // Kirim log ke bridge
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "log", log: output }));
    }
  });
  currentMiner.stderr.on("data", (data) => {
    console.error("❗  Miner error:", data.toString());
  });
  currentMiner.on("close", (code) => {
    console.log(`💤 Miner exited with code ${code}`);
    setTimeout(runMiner, 5000); // Restart otomatis setelah 5 detik
  });
}
// === RESTART MINER SECARA MANUAL ===
function restartMiner() {
  if (currentMiner) {
    console.log("🧹 Killing existing miner...");
    currentMiner.kill("SIGTERM");
    setTimeout(runMiner, 3000);
  } else {
    runMiner();
  }
}
