// ============================================================================
// SKEMARAJA Auto Check-in Cloudflare Worker
// Endpoint: https://skemaraja.dephub.go.id/authenticate
// Support: Multiple Credentials
// ============================================================================

// Default Configuration (can be overridden via KV or environment variables)
const DEFAULT_CONFIG = {
  // Jadwal check-in (dalam timezone Asia/Makassar WITA = UTC+8 untuk Gorontalo)
  schedules: [
    { hour: 7, minute: 30, status_wfh: "2", shift: "1", enabled: true, name: "Pagi" },
    { hour: 12, minute: 30, status_wfh: "2", shift: "1", enabled: true, name: "Siang" },
    { hour: 16, minute: 30, status_wfh: "2", shift: "1", enabled: true, name: "Sore" }
  ],
  // Lokasi kantor untuk check-in
  location: {
    latitude: 0.5164448,
    longitude: 123.0635259,
    name: "KSOP Gorontalo"
  },
  // Multiple Credentials - array of users
  users: [
    { nip: "", password: "", name: "User 1", enabled: true }
  ],
  // Timezone (Gorontalo = WITA = UTC+8)
  timezone: "Asia/Makassar"
};

// SKEMARAJA endpoints
const SKEMARAJA_BASE = "https://skemaraja.dephub.go.id";
const SKEMARAJA_LOGIN = `${SKEMARAJA_BASE}/login`;
const SKEMARAJA_AUTH = `${SKEMARAJA_BASE}/authenticate`;

// Authentication settings
const AUTH_COOKIE_NAME = "__CHECKIN_AUTH__";
const AUTH_PASSWORD = "Google.com12"; // Ganti dengan password yang aman!

// ============================================================================
// Main Worker Export
// ============================================================================
export default {
  // Handle HTTP requests (Web UI & API)
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Login page - tidak perlu autentikasi
      if (path === "/login") {
        if (request.method === "POST") {
          return handleLogin(request, env, corsHeaders);
        }
        return handleLoginPage(corsHeaders);
      }

      // Logout
      if (path === "/logout") {
        return handleLogout(corsHeaders);
      }

      // Cek autentikasi untuk semua route lainnya
      const authPassword = env.AUTH_PASSWORD || AUTH_PASSWORD;
      if (!isAuthenticated(request, authPassword)) {
        return Response.redirect(new URL("/login", url.origin).href, 302);
      }

      // Route handling (protected)
      if (path === "/" || path === "") {
        return handleDashboard(env, corsHeaders);
      }
      if (path === "/config") {
        if (request.method === "GET") {
          return handleGetConfig(env, corsHeaders);
        } else if (request.method === "POST") {
          return handleSaveConfig(request, env, corsHeaders);
        }
      }
      if (path === "/checkin" && request.method === "POST") {
        return handleManualCheckin(request, env, corsHeaders);
      }
      if (path === "/checkin-user" && request.method === "POST") {
        return handleCheckinSingleUser(request, env, corsHeaders);
      }
      if (path === "/logs") {
        return handleGetLogs(env, corsHeaders);
      }
      if (path === "/test") {
        return handleTestConnection(env, corsHeaders);
      }
      if (path === "/clear-logs" && request.method === "POST") {
        return handleClearLogs(env, corsHeaders);
      }
      if (path === "/pegawai") {
        return handleGetPegawai(request, corsHeaders);
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error("Error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  },

  // Handle scheduled cron triggers
  async scheduled(event, env, ctx) {
    console.log("⏰ Scheduled trigger fired:", new Date().toISOString());

    try {
      const config = await getConfig(env);
      const now = new Date();

      // Konversi ke timezone Makassar/Gorontalo (WITA = UTC+8)
      const witaOffset = 8 * 60; // menit
      const witaTime = new Date(now.getTime() + (witaOffset + now.getTimezoneOffset()) * 60000);

      const currentDay = witaTime.getDay(); // 0 = Minggu, 6 = Sabtu
      const currentHour = witaTime.getHours();
      const currentMinute = witaTime.getMinutes();

      console.log(`📅 WITA Time: ${witaTime.toISOString()}, Day: ${currentDay}, Hour: ${currentHour}, Minute: ${currentMinute}`);

      // Skip hari Sabtu (6) dan Minggu (0)
      if (currentDay === 0 || currentDay === 6) {
        console.log("📅 Hari libur (Sabtu/Minggu) - skip check-in");
        return;
      }

      // Cek setiap jadwal
      for (const schedule of config.schedules) {
        if (!schedule.enabled) continue;

        // Toleransi 5 menit untuk cron
        const scheduledMinutes = schedule.hour * 60 + schedule.minute;
        const currentMinutes = currentHour * 60 + currentMinute;
        const diff = Math.abs(scheduledMinutes - currentMinutes);

        if (diff <= 5) {
          console.log(`✅ Jadwal cocok: ${schedule.name} (${schedule.hour}:${schedule.minute})`);

          // Hitung jumlah user yang akan check-in
          const activeUsers = config.users.filter(u => u.enabled && u.nip && u.password);
          console.log(`👥 Total user aktif: ${activeUsers.length}`);

          // Check-in untuk semua user yang enabled
          let userIndex = 0;
          for (const user of activeUsers) {
            userIndex++;
            console.log(`👤 [${userIndex}/${activeUsers.length}] Check-in untuk: ${user.name} (${user.nip.substring(0, 6)}****)`);
            await performCheckin(config, schedule, user, env);

            // Delay 3 detik antar user (max ~8 user dalam 30 detik timeout)
            // Kecuali user terakhir
            if (userIndex < activeUsers.length) {
              console.log(`⏳ Menunggu 3 detik sebelum user berikutnya...`);
              await new Promise(r => setTimeout(r, 3000));
            }
          }

          console.log(`✅ Selesai check-in ${schedule.name} untuk ${activeUsers.length} user`);
        }
      }
    } catch (error) {
      console.error("❌ Scheduled error:", error);
      await addLog(env, {
        timestamp: new Date().toISOString(),
        type: "error",
        message: `Scheduled error: ${error.message}`
      });
    }
  }
};

// ============================================================================
// Config Management
// ============================================================================
async function getConfig(env) {
  try {
    if (env.CHECKIN_KV) {
      const stored = await env.CHECKIN_KV.get("config", "json");
      if (stored) {
        // Merge dengan default untuk field yang tidak ada
        return { ...DEFAULT_CONFIG, ...stored };
      }
    }
  } catch (e) {
    console.error("Error getting config:", e);
  }

  return { ...DEFAULT_CONFIG };
}

async function saveConfig(env, config) {
  if (env.CHECKIN_KV) {
    await env.CHECKIN_KV.put("config", JSON.stringify(config));
    return true;
  }
  return false;
}

// ============================================================================
// Logging
// ============================================================================
async function addLog(env, logEntry) {
  try {
    if (env.CHECKIN_KV) {
      const logs = await env.CHECKIN_KV.get("logs", "json") || [];
      logs.unshift(logEntry); // Tambah di awal
      // Simpan maksimal 200 log terakhir
      const trimmedLogs = logs.slice(0, 200);
      await env.CHECKIN_KV.put("logs", JSON.stringify(trimmedLogs));
    }
  } catch (e) {
    console.error("Error adding log:", e);
  }
}

async function getLogs(env) {
  try {
    if (env.CHECKIN_KV) {
      return await env.CHECKIN_KV.get("logs", "json") || [];
    }
  } catch (e) {
    console.error("Error getting logs:", e);
  }
  return [];
}

// ============================================================================
// Check-in Logic - Now accepts user parameter with retry
// ============================================================================
async function performCheckin(config, schedule, user, env, retryCount = 0) {
  const maxRetries = 3;
  const startTime = new Date().toISOString();
  console.log(`🚀 Starting check-in: ${schedule.name} for ${user.name}${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);

  try {
    // Validasi kredensial
    if (!user.nip || !user.password) {
      throw new Error("NIP atau password belum dikonfigurasi");
    }

    // Step 1: Ambil halaman login untuk mendapatkan CSRF token
    const loginPageResponse = await fetch(SKEMARAJA_LOGIN, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      }
    });

    if (!loginPageResponse.ok) {
      throw new Error(`Gagal mengakses halaman login: ${loginPageResponse.status}`);
    }

    const loginPageHtml = await loginPageResponse.text();

    // Extract CSRF token
    const tokenMatch = loginPageHtml.match(/name="_token"\s+(?:type="hidden"\s+)?value="([^"]+)"/);
    if (!tokenMatch) {
      throw new Error("CSRF token tidak ditemukan");
    }
    const csrfToken = tokenMatch[1];
    console.log("✅ CSRF Token ditemukan");

    // Extract cookies dari response
    const setCookies = loginPageResponse.headers.getAll("set-cookie");
    const cookies = setCookies.map(c => c.split(";")[0]).join("; ");
    console.log("✅ Cookies ditemukan");

    // Step 2: Kirim request authenticate
    const formData = new URLSearchParams();
    formData.append("_token", csrfToken);
    formData.append("nip", user.nip);
    formData.append("password", user.password);
    formData.append("timezone", config.timezone);
    formData.append("location_user", `${config.location.latitude}, ${config.location.longitude}`);
    formData.append("location_status", "");
    formData.append("status_wfh", schedule.status_wfh);
    // Shift harus selalu dikirim jika WFO (status_wfh = 2)
    if (schedule.status_wfh === "2") {
      formData.append("shift", schedule.shift || "1");
    }

    console.log("📤 Mengirim request check-in...");
    console.log("📤 Form data:", formData.toString());

    const authResponse = await fetch(SKEMARAJA_AUTH, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": SKEMARAJA_BASE,
        "Referer": SKEMARAJA_LOGIN,
        "Cookie": cookies,
      },
      body: formData.toString(),
      redirect: "manual"
    });

    const responseStatus = authResponse.status;
    const responseLocation = authResponse.headers.get("location") || "";

    console.log(`📥 Response status: ${responseStatus}`);
    console.log(`📥 Redirect location: ${responseLocation}`);

    // Cek hasil berdasarkan redirect location
    let success = false;
    let message = "";

    if (responseStatus >= 300 && responseStatus < 400) {
      // Redirect response
      if (responseLocation.includes("dashboard") || responseLocation.includes("home") || responseLocation.includes("beranda")) {
        success = true;
        message = "Check-in berhasil! Redirect ke dashboard.";
      } else if (responseLocation.includes("login")) {
        success = false;
        message = "Check-in gagal. Kredensial mungkin salah atau session expired.";
      } else if (responseLocation === SKEMARAJA_BASE || responseLocation === SKEMARAJA_BASE + "/") {
        // Redirect ke base URL - perlu verifikasi dengan fetch dashboard
        success = true;
        message = "Check-in berhasil (redirect ke beranda).";
      } else {
        // Redirect ke lokasi lain - anggap berhasil
        success = true;
        message = `Check-in berhasil. Redirect ke: ${responseLocation}`;
      }

      // Verifikasi dengan fetch dashboard untuk cek waktu absensi
      if (success) {
        try {
          console.log("🔍 Verifikasi dashboard untuk cek waktu absensi...");

          // Ambil cookies baru dari response authenticate
          const newCookies = authResponse.headers.getAll("set-cookie");
          const allCookies = [...setCookies, ...newCookies].map(c => c.split(";")[0]).join("; ");

          const dashboardResponse = await fetch(SKEMARAJA_BASE, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
              "Cookie": allCookies,
            }
          });

          if (dashboardResponse.ok) {
            const dashboardHtml = await dashboardResponse.text();

            // Parse waktu absensi dari tabel
            // Format: <td class="bg-warning">24-Dec-2025 10:00:08</td>
            const scheduleColumn = schedule.name === "Pagi" ? 1 : schedule.name === "Siang" ? 2 : 3;

            // Cari row hari ini di tabel absensi
            const today = new Date();
            const todayStr = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');

            // Regex untuk menemukan baris tabel dengan tanggal hari ini
            const tableRowRegex = new RegExp(`<tr>\\s*<td>${todayStr}</td>([\\s\\S]*?)</tr>`, 'i');
            const rowMatch = dashboardHtml.match(tableRowRegex);

            if (rowMatch) {
              // Extract cells dari row
              const cellRegex = /<td[^>]*>(.*?)<\/td>/gi;
              const cells = [];
              let cellMatch;
              while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
                cells.push(cellMatch[1].trim());
              }

              // cells[0] = tanggal, cells[1] = Pagi, cells[2] = Siang, cells[3] = Sore
              const attendanceTime = cells[scheduleColumn] || "";

              if (attendanceTime && attendanceTime.includes(":")) {
                // Extract waktu saja (HH:MM:SS)
                const timeMatch = attendanceTime.match(/(\d{2}:\d{2}:\d{2})/);
                const timeStr = timeMatch ? timeMatch[1] : attendanceTime;

                message = `✅ Check-in ${schedule.name} berhasil! (${timeStr})`;
                console.log(`📋 ${user.name}: Waktu absensi ${schedule.name} = ${timeStr}`);
              } else {
                // Kolom kosong - mungkin check-in gagal atau belum tercatat
                message = `⚠️ Check-in ${schedule.name} terkirim, tapi waktu belum tercatat.`;
                console.log(`📋 ${user.name}: Kolom ${schedule.name} masih kosong`);
              }
            } else {
              // Tidak menemukan row hari ini, tapi redirect sukses
              message = `✅ Check-in ${schedule.name} berhasil!`;
              console.log(`📋 ${user.name}: Row hari ini tidak ditemukan di tabel`);
            }
          }
        } catch (verifyError) {
          console.log(`⚠️ Verifikasi dashboard gagal (ignored): ${verifyError.message}`);
          // Tetap success, hanya pesan yang kurang detail
        }
      }

    } else if (responseStatus === 200) {
      // Baca response body untuk cek pesan error
      const responseText = await authResponse.text();
      if (responseText.includes("berhasil") || responseText.includes("success")) {
        success = true;
        message = "Check-in berhasil!";
      } else if (responseText.includes("sudah check") || responseText.includes("already")) {
        success = true;
        message = "Sudah check-in sebelumnya hari ini.";
      } else if (responseText.includes("password") || responseText.includes("salah")) {
        success = false;
        message = "NIP atau password salah.";
      } else {
        success = false;
        message = "Check-in gagal. Periksa kredensial.";
      }
    } else {
      // Retry untuk error 5xx
      if (responseStatus >= 500 && retryCount < maxRetries) {
        console.log(`⚠️ Server error ${responseStatus}, retrying in 3 seconds...`);
        await new Promise(r => setTimeout(r, 3000));
        return await performCheckin(config, schedule, user, env, retryCount + 1);
      }
      success = false;
      message = `Check-in gagal dengan status: ${responseStatus}`;
    }

    // Log hasil
    await addLog(env, {
      timestamp: startTime,
      type: success ? "success" : "error",
      schedule: schedule.name,
      user: user.name,
      message: message,
      nip: user.nip.substring(0, 6) + "****",
      location: `${config.location.latitude}, ${config.location.longitude}`,
      status_wfh: schedule.status_wfh
    });

    // Logout setelah check-in untuk membersihkan session
    try {
      await fetch("https://skemaraja.dephub.go.id/logout", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Cookie": cookies,
        },
        redirect: "manual"
      });
      console.log(`🚪 ${user.name}: Logout berhasil`);
    } catch (logoutError) {
      console.log(`⚠️ ${user.name}: Logout error (ignored):`, logoutError.message);
    }

    console.log(success ? `✅ ${user.name}: ${message}` : `❌ ${user.name}: ${message}`);
    return { success, message, user: user.name };

  } catch (error) {
    console.error(`❌ Check-in error for ${user.name}:`, error);

    await addLog(env, {
      timestamp: startTime,
      type: "error",
      schedule: schedule.name,
      user: user.name,
      message: `Error: ${error.message}`,
      nip: user.nip ? user.nip.substring(0, 6) + "****" : "N/A"
    });

    return { success: false, message: error.message, user: user.name };
  }
}

// ============================================================================
// Route Handlers
// ============================================================================
async function handleDashboard(env, corsHeaders) {
  const config = await getConfig(env);
  const logs = await getLogs(env);
  const recentLogs = logs.slice(0, 10);

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SKEMARAJA Auto Check-in</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    .card {
      background: white;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 {
      color: white;
      text-align: center;
      margin-bottom: 30px;
      font-size: 2rem;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
    .header h1 { margin: 0; flex: 1; }
    .logout-btn {
      background: rgba(255,255,255,0.2);
      color: white;
      border: 2px solid white;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.3s;
    }
    .logout-btn:hover { background: white; color: #1e3c72; }
    h2 {
      color: #1e3c72;
      margin-bottom: 20px;
      font-size: 1.3rem;
      border-bottom: 2px solid #1e3c72;
      padding-bottom: 10px;
    }
    h3 { color: #1e3c72; margin: 20px 0 16px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; margin-bottom: 6px; font-weight: 600; color: #555; }
    input, select {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.3s;
    }
    input:focus, select:focus { outline: none; border-color: #1e3c72; }
    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      margin-right: 8px;
      margin-bottom: 8px;
    }
    .btn-primary { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(30, 60, 114, 0.4); }
    .btn-success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; }
    .btn-danger { background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%); color: white; }
    .btn-warning { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; }
    .btn-sm { padding: 8px 16px; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .grid-3 { grid-template-columns: repeat(3, 1fr); }
    .user-card {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 12px;
      margin-bottom: 12px;
      border: 2px solid #e0e0e0;
    }
    .user-card.enabled { border-color: #22c55e; }
    .user-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .user-name { font-size: 18px; font-weight: 700; color: #1e3c72; }
    .schedule-item { background: #f8f9fa; padding: 16px; border-radius: 12px; margin-bottom: 12px; }
    .schedule-time { font-size: 24px; font-weight: 700; color: #1e3c72; }
    .toggle { position: relative; display: inline-block; width: 50px; height: 26px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #ccc; transition: .4s; border-radius: 26px;
    }
    .slider:before {
      position: absolute; content: ""; height: 20px; width: 20px;
      left: 3px; bottom: 3px; background-color: white;
      transition: .4s; border-radius: 50%;
    }
    input:checked + .slider { background-color: #22c55e; }
    input:checked + .slider:before { transform: translateX(24px); }
    .log-item { padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid; }
    .log-success { background: #f0fdf4; border-color: #22c55e; }
    .log-error { background: #fef2f2; border-color: #ef4444; }
    .log-time { font-size: 12px; color: #666; }
    .log-message { margin-top: 4px; }
    .log-user { font-weight: 600; color: #1e3c72; }
    .alert { padding: 16px; border-radius: 8px; margin-bottom: 16px; }
    .alert-warning { background: #fff3cd; border: 1px solid #ffc107; color: #856404; }
    .btn-group { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    #result { margin-top: 16px; padding: 16px; border-radius: 8px; display: none; }
    .status-count { display: flex; gap: 20px; margin-bottom: 16px; }
    .count-item { text-align: center; padding: 12px 20px; background: #f0f0f0; border-radius: 8px; }
    .count-number { font-size: 24px; font-weight: 700; color: #1e3c72; }
    .count-label { font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🕐 SKEMARAJA Auto Check-in</h1>
      <a href="/logout" class="logout-btn">🚪 Logout</a>
    </div>
    
    <!-- Status Card -->
    <div class="card">
      <h2>📊 Status</h2>
      <div class="status-count">
        <div class="count-item">
          <div class="count-number">${config.users.filter(u => u.enabled && u.nip).length}</div>
          <div class="count-label">User Aktif</div>
        </div>
        <div class="count-item">
          <div class="count-number">${config.schedules.filter(s => s.enabled).length}</div>
          <div class="count-label">Jadwal Aktif</div>
        </div>
        <div class="count-item">
          <div class="count-number">${config.location.name}</div>
          <div class="count-label">Lokasi</div>
        </div>
      </div>
    </div>

    <!-- Users Card -->
    <div class="card">
      <h2>👥 Daftar User</h2>
      
      ${config.users.length === 0 || !config.users.some(u => u.nip) ? '<div class="alert alert-warning">⚠️ Belum ada user yang dikonfigurasi. Tambahkan user di bawah.</div>' : ''}
      
      <form id="configForm">
        <div id="usersList">
          ${config.users.map((user, i) => `
            <div class="user-card ${user.enabled && user.nip ? 'enabled' : ''}" data-index="${i}">
              <div class="user-header">
                <span class="user-name">${user.name || 'User ' + (i + 1)}</span>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <label class="toggle">
                    <input type="checkbox" name="user_${i}_enabled" ${user.enabled ? 'checked' : ''}>
                    <span class="slider"></span>
                  </label>
                  <button type="button" class="btn btn-danger btn-sm" onclick="removeUser(${i})">🗑️</button>
                </div>
              </div>
              <div class="grid">
                <div class="form-group">
                  <label>Nama</label>
                  <input type="text" name="user_${i}_name" value="${user.name || ''}" placeholder="Nama User">
                </div>
                <div class="form-group">
                  <label>NIP</label>
                  <input type="text" name="user_${i}_nip" value="${user.nip || ''}" placeholder="NIP">
                </div>
                <div class="form-group">
                  <label>Password</label>
                  <input type="password" name="user_${i}_password" value="${user.password || ''}" placeholder="Password">
                </div>
              </div>
              <button type="button" class="btn btn-success btn-sm" onclick="checkinUser(${i})">🚀 Check-in User Ini</button>
            </div>
          `).join('')}
        </div>
        
        <div style="margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary" onclick="addUser()">➕ Tambah User</button>
          <button type="button" class="btn btn-success" onclick="showImportModal()">📥 Import Pegawai KSOP</button>
        </div>

        <!-- Location -->
        <h3>📍 Lokasi</h3>
        <div class="grid">
          <div class="form-group">
            <label>Latitude</label>
            <input type="text" id="latitude" name="latitude" value="${config.location.latitude}">
          </div>
          <div class="form-group">
            <label>Longitude</label>
            <input type="text" id="longitude" name="longitude" value="${config.location.longitude}">
          </div>
          <div class="form-group">
            <label>Nama Lokasi</label>
            <input type="text" id="locationName" name="locationName" value="${config.location.name}">
          </div>
        </div>

        <!-- Schedules -->
        <h3>📅 Jadwal Check-in</h3>
        <div id="schedules">
          ${config.schedules.map((s, i) => `
            <div class="schedule-item">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
                <span class="schedule-time">${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')} - ${s.name}</span>
                <label class="toggle">
                  <input type="checkbox" name="schedule_${i}_enabled" ${s.enabled ? 'checked' : ''}>
                  <span class="slider"></span>
                </label>
              </div>
              <div class="grid grid-3">
                <div class="form-group">
                  <label>Jam</label>
                  <input type="number" name="schedule_${i}_hour" value="${s.hour}" min="0" max="23">
                </div>
                <div class="form-group">
                  <label>Menit</label>
                  <input type="number" name="schedule_${i}_minute" value="${s.minute}" min="0" max="59">
                </div>
                <div class="form-group">
                  <label>Status</label>
                  <select name="schedule_${i}_status">
                    <option value="1" ${s.status_wfh === "1" ? 'selected' : ''}>WFH</option>
                    <option value="2" ${s.status_wfh === "2" ? 'selected' : ''}>WFO</option>
                    <option value="3" ${s.status_wfh === "3" ? 'selected' : ''}>Dinas Luar</option>
                  </select>
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="btn-group">
          <button type="submit" class="btn btn-primary">💾 Simpan Konfigurasi</button>
          <button type="button" class="btn btn-success" onclick="checkinAll()">🚀 Check-in Semua User</button>
          <button type="button" class="btn btn-primary" onclick="testConnection()">🔗 Test Koneksi</button>
        </div>
      </form>
      
      <div id="result"></div>
    </div>

    <!-- Logs Card -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <h2 style="border: none; margin: 0; padding: 0">📜 Log Terbaru</h2>
        <button class="btn btn-danger btn-sm" onclick="clearLogs()">🗑️ Clear</button>
      </div>
      <div id="logs" style="margin-top: 16px">
        ${recentLogs.length === 0 ? '<p style="color: #666">Belum ada log check-in</p>' :
      recentLogs.map(log => `
            <div class="log-item log-${log.type}">
              <div class="log-time">${new Date(log.timestamp).toLocaleString('id-ID')}</div>
              <div class="log-message">
                ${log.user ? `<span class="log-user">[${log.user}]</span> ` : ''}
                <strong>${log.schedule || 'System'}:</strong> ${log.message}
              </div>
            </div>
          `).join('')
    }
      </div>
      <a href="/logs" style="display: block; margin-top: 16px; color: #1e3c72">Lihat semua log →</a>
    </div>
  </div>

  <script>
    let userCount = ${config.users.length};
    const resultDiv = document.getElementById('result');
    
    function showResult(type, message) {
      resultDiv.style.display = 'block';
      resultDiv.style.background = type === 'success' ? '#d4edda' : type === 'pending' ? '#fff3cd' : '#f8d7da';
      resultDiv.style.color = type === 'success' ? '#155724' : type === 'pending' ? '#856404' : '#721c24';
      resultDiv.innerHTML = message;
    }

    function addUser() {
      const usersList = document.getElementById('usersList');
      const newUser = document.createElement('div');
      newUser.className = 'user-card';
      newUser.dataset.index = userCount;
      newUser.innerHTML = \`
        <div class="user-header">
          <span class="user-name">User \${userCount + 1}</span>
          <div style="display: flex; align-items: center; gap: 12px;">
            <label class="toggle">
              <input type="checkbox" name="user_\${userCount}_enabled" checked>
              <span class="slider"></span>
            </label>
            <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.user-card').remove()">🗑️</button>
          </div>
        </div>
        <div class="grid">
          <div class="form-group">
            <label>Nama</label>
            <input type="text" name="user_\${userCount}_name" placeholder="Nama User">
          </div>
          <div class="form-group">
            <label>NIP</label>
            <input type="text" name="user_\${userCount}_nip" placeholder="NIP">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="user_\${userCount}_password" placeholder="Password">
          </div>
        </div>
        <button type="button" class="btn btn-success btn-sm" onclick="checkinUser(\${userCount})">🚀 Check-in User Ini</button>
      \`;
      usersList.appendChild(newUser);
      userCount++;
    }

    function removeUser(index) {
      if (confirm('Hapus user ini?')) {
        document.querySelector(\`.user-card[data-index="\${index}"]\`).remove();
      }
    }

    function collectFormData() {
      const formData = new FormData(document.getElementById('configForm'));
      const users = [];
      
      // Collect users dynamically - directly query inputs inside each card
      document.querySelectorAll('.user-card').forEach((card) => {
        const nameInput = card.querySelector('input[name$="_name"]');
        const nipInput = card.querySelector('input[name$="_nip"]');
        const passwordInput = card.querySelector('input[name$="_password"]');
        const enabledInput = card.querySelector('input[name$="_enabled"]');
        
        users.push({
          name: nameInput ? nameInput.value : 'User',
          nip: nipInput ? nipInput.value : '',
          password: passwordInput ? passwordInput.value : '',
          enabled: enabledInput ? enabledInput.checked : false
        });
      });
      
      return {
        users: users,
        location: {
          latitude: parseFloat(formData.get('latitude')),
          longitude: parseFloat(formData.get('longitude')),
          name: formData.get('locationName')
        },
        schedules: [
          { name: "Pagi", hour: parseInt(formData.get('schedule_0_hour')), minute: parseInt(formData.get('schedule_0_minute')), status_wfh: formData.get('schedule_0_status'), shift: "1", enabled: formData.get('schedule_0_enabled') === 'on' },
          { name: "Siang", hour: parseInt(formData.get('schedule_1_hour')), minute: parseInt(formData.get('schedule_1_minute')), status_wfh: formData.get('schedule_1_status'), shift: "1", enabled: formData.get('schedule_1_enabled') === 'on' },
          { name: "Sore", hour: parseInt(formData.get('schedule_2_hour')), minute: parseInt(formData.get('schedule_2_minute')), status_wfh: formData.get('schedule_2_status'), shift: "1", enabled: formData.get('schedule_2_enabled') === 'on' }
        ],
        timezone: "Asia/Makassar"
      };
    }

    document.getElementById('configForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const config = collectFormData();

      try {
        const res = await fetch('/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
        const data = await res.json();
        showResult(data.success ? 'success' : 'error', data.message);
        if (data.success) setTimeout(() => location.reload(), 1500);
      } catch (err) {
        showResult('error', 'Error: ' + err.message);
      }
    });

    async function checkinAll() {
      showResult('pending', '⏳ Sedang melakukan check-in untuk semua user...');
      try {
        const res = await fetch('/checkin', { method: 'POST' });
        const data = await res.json();
        let msg = '<strong>Hasil Check-in:</strong><br>';
        if (data.results) {
          data.results.forEach(r => {
            msg += \`\${r.success ? '✅' : '❌'} \${r.user}: \${r.message}<br>\`;
          });
        } else {
          msg = data.message;
        }
        showResult(data.success ? 'success' : 'error', msg);
        setTimeout(() => location.reload(), 3000);
      } catch (err) {
        showResult('error', 'Error: ' + err.message);
      }
    }

    async function checkinUser(index) {
      showResult('pending', '⏳ Sedang melakukan check-in...');
      const formData = new FormData(document.getElementById('configForm'));
      const user = {
        name: formData.get(\`user_\${index}_name\`),
        nip: formData.get(\`user_\${index}_nip\`),
        password: formData.get(\`user_\${index}_password\`)
      };
      
      try {
        const res = await fetch('/checkin-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user })
        });
        const data = await res.json();
        showResult(data.success ? 'success' : 'error', data.message);
        setTimeout(() => location.reload(), 2000);
      } catch (err) {
        showResult('error', 'Error: ' + err.message);
      }
    }

    async function testConnection() {
      showResult('pending', '⏳ Testing koneksi ke SKEMARAJA...');
      try {
        const res = await fetch('/test');
        const data = await res.json();
        showResult(data.success ? 'success' : 'error', data.message);
      } catch (err) {
        showResult('error', 'Error: ' + err.message);
      }
    }

    async function clearLogs() {
      if (!confirm('Hapus semua log?')) return;
      try {
        await fetch('/clear-logs', { method: 'POST' });
        location.reload();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    // Import Pegawai Functions
    let pegawaiList = [];
    
    async function showImportModal() {
      document.getElementById('importModal').style.display = 'flex';
      document.getElementById('pegawaiList').innerHTML = '<p style="text-align:center;padding:20px;">⏳ Loading pegawai...</p>';
      
      try {
        const res = await fetch('/pegawai');
        const data = await res.json();
        
        if (data.success) {
          pegawaiList = data.pegawai;
          renderPegawaiList(pegawaiList);
        } else {
          document.getElementById('pegawaiList').innerHTML = '<p style="color:red;padding:20px;">❌ ' + data.message + '</p>';
        }
      } catch (err) {
        document.getElementById('pegawaiList').innerHTML = '<p style="color:red;padding:20px;">❌ Error: ' + err.message + '</p>';
      }
    }

    function hideImportModal() {
      document.getElementById('importModal').style.display = 'none';
    }

    function renderPegawaiList(list) {
      const container = document.getElementById('pegawaiList');
      container.innerHTML = list.map((p, i) => \`
        <div style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #eee;">
          <input type="checkbox" id="peg_\${i}" value="\${p.nip}" data-name="\${p.name}" style="margin-right:12px; width:18px; height:18px;">
          <label for="peg_\${i}" style="cursor:pointer; flex:1;">
            <strong>\${p.name}</strong><br>
            <small style="color:#666;">NIP: \${p.nip}</small>
          </label>
        </div>
      \`).join('');
    }

    function filterPegawai() {
      const search = document.getElementById('searchPegawai').value.toLowerCase();
      const filtered = pegawaiList.filter(p => 
        p.name.toLowerCase().includes(search) || p.nip.includes(search)
      );
      renderPegawaiList(filtered);
    }

    function selectAllPegawai() {
      document.querySelectorAll('#pegawaiList input[type=checkbox]').forEach(cb => cb.checked = true);
    }

    function deselectAllPegawai() {
      document.querySelectorAll('#pegawaiList input[type=checkbox]').forEach(cb => cb.checked = false);
    }

    function importSelected() {
      const selected = [];
      document.querySelectorAll('#pegawaiList input[type=checkbox]:checked').forEach(cb => {
        selected.push({ nip: cb.value, name: cb.dataset.name });
      });
      
      if (selected.length === 0) {
        alert('Pilih minimal 1 pegawai!');
        return;
      }
      
      // Password default = NIP
      selected.forEach(p => {
        addUserWithData(p.name, p.nip, p.nip);
      });
      
      hideImportModal();
      showResult('success', '✅ ' + selected.length + ' pegawai berhasil diimport! Password default = NIP. Simpan untuk menyimpan.');
    }

    function addUserWithData(name, nip, password) {
      const usersList = document.getElementById('usersList');
      const newUser = document.createElement('div');
      newUser.className = 'user-card';
      newUser.dataset.index = userCount;
      newUser.innerHTML = \`
        <div class="user-header">
          <span class="user-name">\${name}</span>
          <div style="display: flex; align-items: center; gap: 12px;">
            <label class="toggle">
              <input type="checkbox" name="user_\${userCount}_enabled" checked>
              <span class="slider"></span>
            </label>
            <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.user-card').remove()">🗑️</button>
          </div>
        </div>
        <div class="grid">
          <div class="form-group">
            <label>Nama</label>
            <input type="text" name="user_\${userCount}_name" value="\${name}" placeholder="Nama User">
          </div>
          <div class="form-group">
            <label>NIP</label>
            <input type="text" name="user_\${userCount}_nip" value="\${nip}" placeholder="NIP">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="user_\${userCount}_password" value="\${password}" placeholder="Password">
          </div>
        </div>
        <button type="button" class="btn btn-success btn-sm" onclick="checkinUser(\${userCount})">🚀 Check-in User Ini</button>
      \`;
      usersList.appendChild(newUser);
      userCount++;
    }
  </script>

  <!-- Import Modal -->
  <div id="importModal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
    <div style="background:white; border-radius:16px; padding:24px; max-width:600px; width:90%; max-height:80vh; overflow:hidden; display:flex; flex-direction:column;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2 style="margin:0; color:#1e3c72;">📥 Import Pegawai KSOP</h2>
        <button onclick="hideImportModal()" style="background:none; border:none; font-size:24px; cursor:pointer;">✕</button>
      </div>
      <input type="text" id="searchPegawai" placeholder="🔍 Cari nama atau NIP..." oninput="filterPegawai()" style="width:100%; padding:12px; border:2px solid #e0e0e0; border-radius:8px; margin-bottom:12px;">
      <div style="margin-bottom:12px; display:flex; gap:10px;">
        <button type="button" onclick="selectAllPegawai()" style="padding:8px 16px; background:#1e3c72; color:white; border:none; border-radius:6px; cursor:pointer;">Pilih Semua</button>
        <button type="button" onclick="deselectAllPegawai()" style="padding:8px 16px; background:#ccc; color:#333; border:none; border-radius:6px; cursor:pointer;">Batal Pilih</button>
      </div>
      <div id="pegawaiList" style="flex:1; overflow-y:auto; border:1px solid #e0e0e0; border-radius:8px; max-height:300px;"></div>
      <button type="button" onclick="importSelected()" style="margin-top:16px; width:100%; padding:14px; background:linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color:white; border:none; border-radius:8px; font-size:16px; font-weight:600; cursor:pointer;">✅ Import Pegawai Terpilih</button>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
  });
}

async function handleGetConfig(env, corsHeaders) {
  const config = await getConfig(env);
  // Mask passwords
  const safeConfig = {
    ...config,
    users: config.users.map(u => ({
      ...u,
      password: u.password ? "********" : ""
    }))
  };
  return new Response(JSON.stringify(safeConfig), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function handleSaveConfig(request, env, corsHeaders) {
  try {
    const config = await request.json();
    const saved = await saveConfig(env, config);

    if (saved) {
      await addLog(env, {
        timestamp: new Date().toISOString(),
        type: "success",
        message: `Konfigurasi disimpan (${config.users.length} users)`
      });
      return new Response(JSON.stringify({ success: true, message: "✅ Konfigurasi berhasil disimpan!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({ success: false, message: "⚠️ KV Storage tidak tersedia." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "Error: " + error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

async function handleManualCheckin(request, env, corsHeaders) {
  const config = await getConfig(env);

  // Dapatkan jam saat ini dalam WITA (UTC+8)
  const now = new Date();
  const witaOffset = 8 * 60; // menit
  const witaTime = new Date(now.getTime() + (witaOffset + now.getTimezoneOffset()) * 60000);
  const currentHour = witaTime.getHours();

  // Pilih jadwal berdasarkan jam saat ini
  // 07:00 - 11:59 = Pagi
  // 12:00 - 15:59 = Siang  
  // 16:00 - 23:59 = Sore
  let activeSchedule;
  if (currentHour >= 7 && currentHour < 12) {
    activeSchedule = config.schedules.find(s => s.name === "Pagi") || config.schedules[0];
  } else if (currentHour >= 12 && currentHour < 16) {
    activeSchedule = config.schedules.find(s => s.name === "Siang") || config.schedules[1];
  } else if (currentHour >= 16 && currentHour <= 23) {
    activeSchedule = config.schedules.find(s => s.name === "Sore") || config.schedules[2];
  } else {
    // Di luar jam kerja (00:00 - 06:59), gunakan jadwal pertama
    activeSchedule = config.schedules[0];
  }

  // Fallback jika tidak ada jadwal
  if (!activeSchedule) {
    activeSchedule = { name: "Manual", status_wfh: "2", shift: "1" };
  }

  const results = [];

  // Check-in untuk semua user yang enabled
  for (const user of config.users) {
    if (!user.enabled || !user.nip || !user.password) continue;
    const result = await performCheckin(config, activeSchedule, user, env);
    results.push(result);
    // Delay antar user
    await new Promise(r => setTimeout(r, 1500));
  }

  const allSuccess = results.every(r => r.success);

  return new Response(JSON.stringify({
    success: allSuccess,
    message: allSuccess ? `✅ Semua check-in ${activeSchedule.name} berhasil!` : `⚠️ Beberapa check-in ${activeSchedule.name} gagal`,
    results: results,
    schedule: activeSchedule.name,
    witaHour: currentHour
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function handleCheckinSingleUser(request, env, corsHeaders) {
  const config = await getConfig(env);
  const { user } = await request.json();

  // Dapatkan jam saat ini dalam WITA (UTC+8)
  const now = new Date();
  const witaOffset = 8 * 60;
  const witaTime = new Date(now.getTime() + (witaOffset + now.getTimezoneOffset()) * 60000);
  const currentHour = witaTime.getHours();

  // Pilih jadwal berdasarkan jam saat ini
  let activeSchedule;
  if (currentHour >= 7 && currentHour < 12) {
    activeSchedule = config.schedules.find(s => s.name === "Pagi") || config.schedules[0];
  } else if (currentHour >= 12 && currentHour < 16) {
    activeSchedule = config.schedules.find(s => s.name === "Siang") || config.schedules[1];
  } else if (currentHour >= 16 && currentHour <= 23) {
    activeSchedule = config.schedules.find(s => s.name === "Sore") || config.schedules[2];
  } else {
    activeSchedule = config.schedules[0];
  }

  if (!activeSchedule) {
    activeSchedule = { name: "Manual", status_wfh: "2", shift: "1" };
  }

  const result = await performCheckin(config, activeSchedule, user, env);

  return new Response(JSON.stringify({
    ...result,
    schedule: activeSchedule.name,
    witaHour: currentHour
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function handleGetLogs(env, corsHeaders) {
  const logs = await getLogs(env);

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logs - SKEMARAJA Auto Check-in</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
    h1 { color: white; text-align: center; margin-bottom: 20px; }
    .log-item { padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid; }
    .log-success { background: #f0fdf4; border-color: #22c55e; }
    .log-error { background: #fef2f2; border-color: #ef4444; }
    .log-time { font-size: 12px; color: #666; }
    .log-message { margin-top: 4px; }
    .log-user { font-weight: 600; color: #1e3c72; }
    .back-link { display: inline-block; margin-bottom: 20px; color: white; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">← Kembali ke Dashboard</a>
    <h1>📜 Log Check-in</h1>
    <div class="card">
      ${logs.length === 0 ? '<p style="color: #666; text-align: center">Belum ada log</p>' :
      logs.map(log => `
          <div class="log-item log-${log.type}">
            <div class="log-time">${new Date(log.timestamp).toLocaleString('id-ID')}</div>
            <div class="log-message">
              ${log.user ? `<span class="log-user">[${log.user}]</span> ` : ''}
              <strong>${log.schedule || 'System'}:</strong> ${log.message}
              ${log.nip ? `<br><small>NIP: ${log.nip}</small>` : ''}
            </div>
          </div>
        `).join('')
    }
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
  });
}

async function handleTestConnection(env, corsHeaders) {
  try {
    const response = await fetch(SKEMARAJA_LOGIN, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });

    if (response.ok) {
      const html = await response.text();
      const hasToken = html.includes('_token');
      return new Response(JSON.stringify({
        success: true,
        message: `✅ Koneksi ke SKEMARAJA berhasil! Status: ${response.status}, CSRF Token: ${hasToken ? 'Ditemukan' : 'Tidak ditemukan'}`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: `⚠️ SKEMARAJA merespons dengan status: ${response.status}`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: `❌ Gagal terhubung: ${error.message}`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

async function handleClearLogs(env, corsHeaders) {
  if (env.CHECKIN_KV) {
    await env.CHECKIN_KV.put("logs", JSON.stringify([]));
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function handleGetPegawai(request, corsHeaders) {
  const url = new URL(request.url);
  const kodeKantor = url.searchParams.get("kode_kantor") || "004036057000000";

  try {
    const response = await fetch(`https://skemaraja.dephub.go.id/api/pegawaiSelect?kode_kantor=${kodeKantor}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform data untuk kebutuhan kita
    const pegawai = data.results.map(p => ({
      nip: p.id,
      name: p.text
    }));

    return new Response(JSON.stringify({
      success: true,
      pegawai: pegawai,
      total: pegawai.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: `Gagal mengambil data pegawai: ${error.message}`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// ============================================================================
// Authentication Functions
// ============================================================================
function isAuthenticated(request, password) {
  const cookies = request.headers.get("Cookie") || "";
  const authCookie = cookies.split(";").find(c => c.trim().startsWith(AUTH_COOKIE_NAME + "="));
  if (!authCookie) return false;

  const cookieValue = authCookie.split("=")[1];
  // Simple hash check - password hashed with timestamp prefix
  const expectedHash = btoa(password);
  return cookieValue === expectedHash;
}

function handleLoginPage(corsHeaders, error = "") {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - SKEMARAJA Auto Check-in</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .login-card {
      background: white;
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      color: #1e3c72;
      text-align: center;
      margin-bottom: 30px;
      font-size: 1.8rem;
    }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-weight: 600; color: #555; }
    input {
      width: 100%;
      padding: 14px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.3s;
    }
    input:focus { outline: none; border-color: #1e3c72; }
    .btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(30, 60, 114, 0.4);
    }
    .error {
      background: #f8d7da;
      color: #721c24;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      text-align: center;
    }
    .logo { text-align: center; margin-bottom: 20px; font-size: 48px; }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="logo">🔐</div>
    <h1>SKEMARAJA Auto Check-in</h1>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/login">
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Masukkan password" required autofocus>
      </div>
      <button type="submit" class="btn">🔓 Login</button>
    </form>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
  });
}

async function handleLogin(request, env, corsHeaders) {
  const formData = await request.formData();
  const password = formData.get("password") || "";

  const authPassword = env.AUTH_PASSWORD || AUTH_PASSWORD;

  if (password === authPassword) {
    // Login berhasil - set cookie
    const hash = btoa(authPassword);
    const cookie = `${AUTH_COOKIE_NAME}=${hash}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`; // 24 jam

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        "Location": "/",
        "Set-Cookie": cookie
      }
    });
  } else {
    // Password salah
    return handleLoginPage(corsHeaders, "❌ Password salah!");
  }
}

function handleLogout(corsHeaders) {
  // Hapus cookie
  const cookie = `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      "Location": "/login",
      "Set-Cookie": cookie
    }
  });
}
