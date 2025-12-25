# SKEMARAJA Auto Check-in

Cloudflare Worker untuk auto check-in ke sistem SKEMARAJA (https://skemaraja.dephub.go.id).

## ✨ Fitur

- 🕐 **Auto Check-in Terjadwal** - Pagi, Siang, Sore (Senin-Jumat)
- 🎲 **Random Time Range** - Check-in acak dalam rentang waktu (anti-pattern detection)
- 👥 **Multi User** - Dukung banyak kredensial sekaligus
- 📱 **WhatsApp Notification** - Notifikasi via Fonnte API
- 🔐 **Password Protected** - Dashboard dilindungi password
- 📍 **Location Spoofing** - Koordinat kantor yang dapat dikonfigurasi
- 📝 **Logging** - Riwayat check-in tersimpan
- 🌐 **Web Dashboard** - Konfigurasi via browser
- 📲 **Device Simulation** - Random User-Agent (iPhone/Android)
- ⚙️ **Fonnte Settings** - Kelola device WhatsApp langsung dari dashboard

## 🚀 Instalasi

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### 2. Buat KV Namespace

```bash
wrangler kv:namespace create CHECKIN_KV
```

Copy ID yang muncul, lalu update di `wrangler.jsonc`:

```json
"kv_namespaces": [
  {
    "binding": "CHECKIN_KV",
    "id": "YOUR_KV_NAMESPACE_ID"
  }
]
```

### 3. Deploy

```bash
wrangler deploy
```

## ⚙️ Konfigurasi

### Jadwal Default (WITA/UTC+8):

| Jadwal | Range Waktu | Status |
|--------|-------------|--------|
| Pagi | 07:00 - 08:00 | WFO Shift 1 |
| Siang | 12:05 - 13:00 | WFO Shift 1 |
| Sore | 17:00 - 18:00 | WFO Shift 1 |

> Check-in dilakukan secara acak dalam rentang waktu untuk menghindari pattern detection.

### Lokasi Default:
- **KSOP Gorontalo**: 0.5164448, 123.0635259

### Password Default:
- **Dashboard**: `Google.com12`

Ubah password via code di `_worker.js`:
```javascript
const AUTH_PASSWORD = "password_baru";
```

## 📱 Penggunaan

1. Buka URL worker di browser
2. Login dengan password
3. Tambahkan user (NIP + Password + No. WhatsApp)
4. Simpan konfigurasi
5. Setup Fonnte (opsional untuk notifikasi WA)
6. Auto check-in akan berjalan sesuai jadwal

## � Setup Notifikasi WhatsApp (Fonnte)

1. Daftar di [fonnte.com](https://fonnte.com) dan dapatkan **Account Token**
2. Buka dashboard Worker → bagian **Pengaturan WhatsApp**
3. Masukkan Account Token → klik **Load Devices**
4. Pilih device → klik **Simpan Token**
5. Jika device disconnected → klik **Connect Device** → scan QR

Notifikasi WA akan menampilkan:
- ✅/ℹ️/❌ Status check-in
- 👤 Nama pegawai
- 🕐 Waktu check-in
- 📍 Status WFO/WFH
- 🗺️ Lokasi kantor
- 📱/🤖 Device (iPhone/Android)

## �🔧 Environment Variables (Cloudflare)

| Variable | Deskripsi | Required |
|----------|-----------|----------|
| `FONNTE_TOKEN` | Device Token Fonnte (backup) | Optional |
| `FONNTE_ACCOUNT_TOKEN` | Account Token Fonnte | Optional |

> Token dapat disimpan via KV (dashboard) atau Environment Variable (Cloudflare Settings).

## 📄 Endpoints

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/` | GET | Dashboard |
| `/login` | GET/POST | Halaman login |
| `/logout` | GET | Logout |
| `/config` | GET/POST | API konfigurasi |
| `/checkin` | POST | Manual check-in semua user |
| `/checkin-user` | POST | Manual check-in single user |
| `/logs` | GET | Lihat log |
| `/test` | GET | Test koneksi ke SKEMARAJA |
| `/pegawai` | GET | Ambil daftar pegawai |
| `/fonnte/devices` | GET | Daftar device Fonnte |
| `/fonnte/qr` | POST | Get QR code untuk connect |
| `/fonnte/status` | GET | Cek status device |
| `/fonnte/save-config` | POST | Simpan konfigurasi Fonnte |

## 🗓️ Cron Triggers

```
0 23 * * *   → Trigger Pagi (07:00 WITA = 23:00 UTC sebelumnya)
5 4 * * 1-5  → Trigger Siang (12:05 WITA = 04:05 UTC)
0 9 * * 1-5  → Trigger Sore (17:00 WITA = 09:00 UTC)
```

## ⚠️ Disclaimer

Aplikasi ini dibuat untuk keperluan pribadi. Pastikan penggunaan sesuai dengan kebijakan kantor Anda.

## 📝 License

MIT License
