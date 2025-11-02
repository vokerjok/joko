
```markdown
# 💽 JOKO Worker Client
Worker.js adalah client yang menjalankan miner lokal (`./joko`) dan mengirimkan hasil log serta konfigurasi ke Bridge.js secara realtime melalui WebSocket.

Setiap VPS worker dapat menambang di pool publik berbeda-beda namun semuanya akan terlihat di satu Bridge Dashboard pusat.

---

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
  "user": "mbc1qh4y316n3w6ptvuyvtqhwmrkld8lacn608tclxv",
  "pass": "x",
  "algo": "power2b",
  "threads": 8
}


---

4️⃣ Contoh file package.json

{
  "name": "joko-worker",
  "version": "1.0.0",
  "type": "module",
  "main": "worker.js",
  "scripts": {
    "start": "node worker.js"
  },
  "dependencies": {
    "ws": "^8.17.0"
  }
}


---

5️⃣ Edit IP Bridge di worker.js

const BRIDGE_URL = "ws://<IP_BRIDGE_VPS>:8080";


---

6️⃣ Jalankan Worker

Mode normal

node worker.js

Mode PM2

pm2 start worker.js --name worker
pm2 save
pm2 startup


---

🧱 Komponen File

File	Fungsi

worker.js	Menjalankan miner lokal dan kirim log ke Bridge
joko	Binary CPU miner hasil build
config.json	Menyimpan konfigurasi pool publik
package.json	Daftar dependensi npm



---

🧠 Cara Kerja

1. Worker membaca config.json


2. Mengirim data awal (wallet, pool, algo) ke Bridge


3. Menjalankan ./joko -c config.json


4. Semua output log miner dikirim ke Bridge secara realtime


5. Bridge parsing dan menampilkan data di dashboard web + CLI




---

📞 Komunikasi

[ Worker VPS ] ---> ws://<bridge-ip>:8080 ---> [ Bridge VPS ]


---

💡 Tips

Pastikan firewall di Bridge VPS membuka port 8080.

Setiap worker harus memiliki config.json sendiri (alamat pool & wallet).

Worker akan auto-reconnect jika Bridge restart.



---

🧰 Troubleshooting

Masalah	Penyebab	Solusi

Tidak tampil di dashboard	IP Bridge salah	Ganti BRIDGE_URL
ECONNREFUSED	Bridge belum aktif	Jalankan pm2 start bridge.js
Miner tidak jalan	File ./joko tidak ditemukan	Pastikan binary hasil build ada dan executable



---

🧩 Lisensi

MIT License © 2025 — Designed for scalable decentralized mining.

---

Keduanya sudah siap dipakai — tinggal:

📍 Simpan `README_BRIDGE.md` di folder `/root/bridge/`  
📍 Simpan `README_WORKER.md` di folder `/root/joko/`

---

Kalau kamu mau, saya bisa buatin **`install.sh` otomatis** untuk kedua sisi (Bridge & Worker):  
- auto install Node, PM2, UFW  
- auto copy config template  
- auto start service  

Mau saya lanjut buatkan versi itu juga (biar setup massal 1-command)?

