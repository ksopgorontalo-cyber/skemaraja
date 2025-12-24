# SKEMARAJA Auto Check-in

Cloudflare Worker untuk auto check-in ke sistem SKEMARAJA (https://skemaraja.dephub.go.id).

## ✨ Fitur

- � **Auto Check-in Terjadwal** - Pagi, Siang, Sore (Senin-Jumat)
- � **Multi User** - Dukung banyak kredensial sekaligus
- 🔐 **Password Protected** - Dashboard dilindungi password
- 📍 **Location Spoofing** - Koordinat KSOP Gorontalo
- 📝 **Logging** - Riwayat check-in tersimpan
- 🌐 **Web Dashboard** - Konfigurasi via browser

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

| Jadwal | Waktu | Status |
|--------|-------|--------|
| Pagi | 07:30 | WFO Shift 1 |
| Siang | 12:30 | WFO Shift 1 |
| Sore | 16:30 | WFO Shift 1 |

### Lokasi Default:
- **KSOP Gorontalo**: 0.5164448, 123.0635259

### Password Default:
- **Dashboard**: `admin123`

Ubah password via Environment Variable:
```
AUTH_PASSWORD = password_baru
```

## 📱 Penggunaan

1. Buka URL worker di browser
2. Login dengan password
3. Tambahkan user (NIP + Password SKEMARAJA)
4. Simpan konfigurasi
5. Auto check-in akan berjalan sesuai jadwal

## 🔧 Environment Variables

| Variable | Deskripsi | Default |
|----------|-----------|---------|
| `AUTH_PASSWORD` | Password dashboard | `admin123` |

## 📄 Endpoints

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/` | GET | Dashboard |
| `/login` | GET/POST | Halaman login |
| `/logout` | GET | Logout |
| `/config` | GET/POST | API konfigurasi |
| `/checkin` | POST | Manual check-in semua user |
| `/logs` | GET | Lihat log |
| `/test` | GET | Test koneksi ke SKEMARAJA |

## ⚠️ Disclaimer

Aplikasi ini dibuat untuk keperluan pribadi. Pastikan penggunaan sesuai dengan kebijakan kantor Anda.

## 📝 License

MIT License
