import WebSocket from "ws";
import { spawn } from "child_process";
import fs from "fs";

const BRIDGE_URL = "ws://YOUR_BRIDGE_IP:8080"; // <--- ganti IP VPS bridge kamu
const CONFIG_PATH = "./config.json"; // pastikan file config.json sudah ada
const MINER_BIN = "./joko"; // pastikan binary kamu build di folder yang sama

// Baca config lokal
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

// Koneksi ke bridge
const ws = new WebSocket(BRIDGE_URL);

ws.on("open", () => {
  console.log("🔗 Connected to bridge", BRIDGE_URL);
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === "job") {
      console.log("📦 Received new job from bridge");
      runMinerJob(msg.job);
    }
  } catch (e) {
    console.error("Parse error:", e.message);
  }
});

ws.on("close", () => {
  console.log("❌ Disconnected from bridge, retrying...");
  setTimeout(() => connect(), 5000);
});

ws.on("error", (err) => {
  console.error("⚠️ Bridge error:", err.message);
});

function runMinerJob(job) {
  console.log("🚀 Starting miner for job...");

  const miner = spawn(MINER_BIN, ["-c", CONFIG_PATH]);

  miner.stdout.on("data", (data) => {
    const out = data.toString().trim();
    console.log("🧠", out);

    // Kirim update ke bridge (opsional)
    ws.send(JSON.stringify({
      type: "result",
      output: out
    }));
  });

  miner.stderr.on("data", (data) => {
    console.error("❗", data.toString());
  });

  miner.on("close", (code) => {
    console.log(`💤 Miner exited with code ${code}`);
  });
}
