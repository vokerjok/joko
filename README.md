
```markdown
# 💽 JOKO Worker Client
--

## ⚙️ Fitur
✅ Auto menjalankan miner (CLI binary)  
✅ Kirim log miner ke Bridge (WebSocket)  
✅ Parsing log & statistik langsung oleh Bridge  
✅ Auto reconnect jika koneksi ke Bridge terputus  
✅ Bisa dijalankan via PM2 untuk auto restart

---

## 📦 Instalasi Worker

### 1️⃣ Install dependencies dasar
```bash
sudo apt update
sudo apt install -y nodejs npm pm2 git


---

2️⃣ Struktur folder worker

/root/joko/
 ├── worker.js
 ├── joko
 ├── config.json
 ├── package.json
 └── node_modules/


---

3️⃣ Contoh file config.json

Isi konfigurasi pool publik:

{
  "url": "stratum+tcp://51.79.215.200:7022",
  "user": "walletMU",
  "pass": "x",
  "algo": "power2b",
  "threads": 8
}




node worker.js

Mode PM2

pm2 start worker.js --name worker
pm2 save
pm2 startup


---

🧩 Lisensi

MIT License © 2025 — Designed for scalable decentralized mining.

