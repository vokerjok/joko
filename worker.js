// --- worker.js ---
// Worker yang terhubung ke bridge dan jalankan ./joko
import WebSocket from "ws";
import { spawn } from "child_process";

const BRIDGE_URL = "ws://43.132.135.39:8080"; // Ganti dengan IP VPS bridge kamu

console.log("🔗 Connecting to bridge:", BRIDGE_URL);
const ws = new WebSocket(BRIDGE_URL);

ws.on("open", () => console.log("✅ Connected to bridge server"));
ws.on("close", () => console.log("❌ Bridge connection closed, retrying..."));
ws.on("error", e => console.error("⚠️ Bridge error:", e.message));

ws.on("message", data => {
  try {
    const msg = JSON.parse(data);
    if (msg.type === "job") {
      console.log("📦 Received new job from bridge:", msg.job.job_id);

      // Jalankan miner binary dengan config.json (lokal)
      const miner = spawn("./joko", ["-c", "config.json"], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      miner.stdout.on("data", d => process.stdout.write(`[joko] ${d}`));
      miner.stderr.on("data", d => process.stderr.write(`[joko-err] ${d}`));

      miner.on("close", code => console.log(`Miner stopped (${code})`));
    }
  } catch (err) {
    console.error("Parse error:", err.message);
  }
});
