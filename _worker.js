// ============================================================================
// SKEMARAJA Auto Check-in Cloudflare Worker
// Endpoint: https://skemaraja.dephub.go.id/authenticate
// Support: Multiple Credentials
// Author: @404_notfound
// ============================================================================

// Default Configuration (can be overridden via KV or environment variables)
const DEFAULT_CONFIG = {
  // Jadwal check-in dengan random time range (dalam timezone Asia/Makassar WITA = UTC+8 untuk Gorontalo)
  // startHour/startMinute = waktu awal range, endHour/endMinute = waktu akhir range
  schedules: [
    { name: "Pagi", startHour: 7, startMinute: 0, endHour: 8, endMinute: 0, status_wfh: "2", shift: "1", enabled: true },
    { name: "Siang", startHour: 12, startMinute: 5, endHour: 13, endMinute: 0, status_wfh: "2", shift: "1", enabled: true },
    { name: "Sore", startHour: 17, startMinute: 0, endHour: 18, endMinute: 0, status_wfh: "2", shift: "1", enabled: true }
  ],
  // Lokasi kantor untuk check-in
  location: {
    latitude: 0.5164448,
    longitude: 123.0635259,
    name: "KSOP Gorontalo"
  },
  // Multiple Credentials - array of users (phone = nomor WhatsApp untuk notifikasi)
  users: [
    { nip: "", password: "", name: "User 1", phone: "", enabled: true }
  ],
  // Timezone (Gorontalo = WITA = UTC+8)
  timezone: "Asia/Makassar"
};

// Daftar Hari Libur Nasional Indonesia (Default)
// Format: "YYYY-MM-DD": "Nama Hari Libur"
// Dapat diedit melalui dashboard
const DEFAULT_HOLIDAYS = {
  // ========== 2026 ==========
  "2026-01-01": "Tahun Baru Masehi",
  "2026-01-16": "Isra Mi'raj Nabi Muhammad SAW",
  "2026-02-17": "Tahun Baru Imlek 2577",
  "2026-03-17": "Hari Suci Nyepi Tahun Baru Saka 1948",
  "2026-03-19": "Hari Raya Idul Fitri 1447 H",
  "2026-03-20": "Hari Raya Idul Fitri 1447 H",
  "2026-03-21": "Cuti Bersama Idul Fitri",
  "2026-03-22": "Cuti Bersama Idul Fitri",
  "2026-04-03": "Wafat Isa Al Masih",
  "2026-05-01": "Hari Buruh Internasional",
  "2026-05-02": "Hari Raya Waisak 2570 BE",
  "2026-05-14": "Kenaikan Isa Al Masih",
  "2026-05-26": "Hari Raya Idul Adha 1447 H",
  "2026-06-01": "Hari Lahir Pancasila",
  "2026-06-16": "Tahun Baru Islam 1448 H",
  "2026-08-17": "Hari Kemerdekaan RI",
  "2026-08-25": "Maulid Nabi Muhammad SAW",
  "2026-12-25": "Hari Raya Natal",
  // ========== 2027 ==========
  "2027-01-01": "Tahun Baru Masehi",
};

// Get holidays from KV or use default
async function getHolidays(env) {
  try {
    if (env.CHECKIN_KV) {
      const stored = await env.CHECKIN_KV.get("holidays", "json");
      if (stored && Object.keys(stored).length > 0) {
        return stored;
      }
    }
  } catch (e) {
    console.error("Error getting holidays:", e);
  }
  return { ...DEFAULT_HOLIDAYS };
}

// Save holidays to KV
async function saveHolidays(env, holidays) {
  if (env.CHECKIN_KV) {
    await env.CHECKIN_KV.put("holidays", JSON.stringify(holidays));
    return true;
  }
  return false;
}

// Fungsi untuk mengecek apakah tanggal adalah hari libur nasional
function isNationalHoliday(dateStr, holidays) {
  // dateStr format: "YYYY-MM-DD"
  // holidays: object { "YYYY-MM-DD": "nama libur" }
  return holidays[dateStr] || null;
}

// SKEMARAJA endpoints
const SKEMARAJA_BASE = "https://skemaraja.dephub.go.id";
const SKEMARAJA_LOGIN = `${SKEMARAJA_BASE}/login`;
const SKEMARAJA_AUTH = `${SKEMARAJA_BASE}/authenticate`;

// Authentication settings
const AUTH_COOKIE_NAME = "__CHECKIN_AUTH__";
const AUTH_PASSWORD_DEFAULT = "Google.com12"; // Default password, can be changed from dashboard

// Fonnte WhatsApp API (dapatkan token di https://fonnte.com)
const FONNTE_API = "https://api.fonnte.com/send";
// Token akan diambil dari environment variable FONNTE_TOKEN

// Random Mobile User-Agents (Android & iPhone)
const MOBILE_USER_AGENTS = [
  // Android devices
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; Redmi Note 11 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; POCO X5 Pro 5G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; M2101K6G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; CPH2483) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
  // iPhone devices
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.101 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.8 Mobile/15E148 Safari/604.1"
];

// Get random User-Agent
function getRandomUserAgent() {
  return MOBILE_USER_AGENTS[Math.floor(Math.random() * MOBILE_USER_AGENTS.length)];
}

// Get random time within schedule range (returns delay in milliseconds)
function getRandomDelayForSchedule(schedule, currentMinutes) {
  const startMinutes = schedule.startHour * 60 + schedule.startMinute;
  const endMinutes = schedule.endHour * 60 + schedule.endMinute;
  const rangeMinutes = endMinutes - startMinutes;

  // Random waktu dalam range
  const randomMinutes = Math.floor(Math.random() * rangeMinutes);
  const targetMinutes = startMinutes + randomMinutes;

  // Hitung delay dari waktu sekarang
  let delayMinutes = targetMinutes - currentMinutes;
  if (delayMinutes < 0) delayMinutes = 0; // Jika sudah lewat, langsung check-in

  return {
    delayMs: delayMinutes * 60 * 1000,
    targetTime: `${Math.floor(targetMinutes / 60)}:${String(targetMinutes % 60).padStart(2, '0')}`
  };
}

// Get auth password from KV or use default
async function getAuthPassword(env) {
  try {
    const stored = await env.CHECKIN_KV.get("auth_password");
    if (stored) {
      return stored;
    }
  } catch (e) {
    console.log("Error reading auth password from KV:", e.message);
  }
  return AUTH_PASSWORD_DEFAULT;
}

// Send WhatsApp notification via Fonnte
async function sendWhatsAppNotification(env, user, schedule, success, message, checkinTime, deviceType = 'Android', locationName = '') {
  // Get device token from KV config first, fallback to env
  let deviceToken = env.FONNTE_TOKEN;
  try {
    const stored = await env.CHECKIN_KV.get("fonnte_config");
    if (stored) {
      const fonnteConfig = JSON.parse(stored);
      if (fonnteConfig.deviceToken) {
        deviceToken = fonnteConfig.deviceToken;
      }
    }
  } catch (e) {
    console.log("Error reading fonnte config from KV:", e.message);
  }

  // Skip jika tidak ada nomor HP atau token Fonnte
  if (!user.phone || !deviceToken) {
    console.log(`📱 Skip WA notification: ${!user.phone ? 'No phone' : 'No Fonnte token'}`);
    return;
  }

  // Format nomor HP (hapus karakter non-digit, countryCode akan handle 0 -> 62)
  let phone = user.phone.replace(/\D/g, '');

  // Deteksi apakah ini "sudah check-in sebelumnya" (bukan check-in baru)
  const isAlreadyCheckedIn = message && (
    message.toLowerCase().includes('sudah check-in') ||
    message.toLowerCase().includes('sebelumnya') ||
    message.includes('ℹ️')
  );

  // Buat pesan notifikasi berdasarkan status
  let statusEmoji, statusText, footerMessage;

  if (isAlreadyCheckedIn) {
    statusEmoji = 'ℹ️';
    statusText = 'INFO';
    footerMessage = '📝 ' + message;
  } else if (success) {
    statusEmoji = '✅';
    statusText = 'BERHASIL';
    footerMessage = '🎉 Terima kasih sudah absen tepat waktu!';
  } else {
    statusEmoji = '❌';
    statusText = 'GAGAL';
    footerMessage = '⚠️ ' + message;
  }

  // Device icon berdasarkan type
  const deviceIcon = deviceType === 'iPhone' ? '📱' : '🤖';
  const deviceLabel = deviceType === 'iPhone' ? 'iPhone' : 'Android';

  const waMessage = `${statusEmoji} *Check-in SKEMARAJA ${statusText}*

👤 *Nama:* ${user.name}
📅 *Jadwal:* ${schedule.name}
🕐 *Waktu:* ${checkinTime || new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })}
📍 *Status:* ${schedule.status_wfh === '1' ? 'WFH' : schedule.status_wfh === '2' ? 'WFO' : 'Dinas Luar'}
🗺️ *Lokasi:* ${locationName || 'Unknown'}
${deviceIcon} *Device:* ${deviceLabel}

${footerMessage}

_Auto Check-in by SKEMARAJA_`;

  try {
    // Fonnte API menggunakan form-urlencoded, bukan JSON
    const formData = new URLSearchParams();
    formData.append('target', phone);
    formData.append('message', waMessage);
    formData.append('countryCode', '62'); // Otomatis convert 08xxx ke 628xxx

    const response = await fetch(FONNTE_API, {
      method: 'POST',
      headers: {
        'Authorization': deviceToken  // Device token dari KV atau env
      },
      body: formData
    });

    const result = await response.json();
    console.log(`📱 Fonnte response:`, JSON.stringify(result));

    if (result.status === true) {
      console.log(`📱 WA notification sent to ${user.name} (${phone})`);
    } else {
      console.log(`📱 WA notification failed: ${result.reason || result.detail || 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`📱 WA notification error: ${error.message}`);
  }
}

// Test connection to SKEMARAJA with retry until successful
async function testSkemarajaConnection(maxAttempts = 10) {
  let attempt = 0;
  let delaySeconds = 5; // Start with 5 seconds delay
  const maxDelay = 60; // Maximum delay of 60 seconds

  while (attempt < maxAttempts) {
    attempt++;
    console.log(`🔗 [${attempt}/${maxAttempts}] Mencoba koneksi ke SKEMARAJA...`);

    try {
      const response = await fetch(SKEMARAJA_LOGIN, {
        method: 'GET',
        headers: {
          "User-Agent": getRandomUserAgent(),
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        // Set timeout dengan AbortController (10 detik)
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        console.log(`✅ Koneksi ke SKEMARAJA berhasil! (attempt ${attempt})`);
        return { success: true, attempts: attempt };
      }

      // Jika error 522 (Connection timed out) atau 5xx, retry
      if (response.status === 522 || response.status >= 500) {
        console.log(`⚠️ Server error ${response.status}, menunggu ${delaySeconds} detik sebelum retry...`);
        await new Promise(r => setTimeout(r, delaySeconds * 1000));
        // Exponential backoff dengan maximum
        delaySeconds = Math.min(delaySeconds * 1.5, maxDelay);
        continue;
      }

      // Untuk error lain, anggap koneksi sukses tapi ada masalah lain
      console.log(`⚠️ Response status ${response.status}, lanjutkan check-in...`);
      return { success: true, attempts: attempt, status: response.status };

    } catch (error) {
      console.log(`❌ Koneksi gagal (attempt ${attempt}): ${error.message}`);

      // Jika masih ada attempts, retry dengan delay
      if (attempt < maxAttempts) {
        console.log(`⏳ Menunggu ${delaySeconds} detik sebelum retry...`);
        await new Promise(r => setTimeout(r, delaySeconds * 1000));
        // Exponential backoff
        delaySeconds = Math.min(delaySeconds * 1.5, maxDelay);
      }
    }
  }

  console.log(`❌ Koneksi gagal setelah ${maxAttempts} attempts`);
  return { success: false, attempts: attempt };
}

// Send WhatsApp notification BEFORE check-in starts
async function sendPreCheckinNotification(env, user, schedule, locationName, timeStr) {
  // Get device token from KV config first, fallback to env
  let deviceToken = env.FONNTE_TOKEN;
  try {
    const stored = await env.CHECKIN_KV.get("fonnte_config");
    if (stored) {
      const fonnteConfig = JSON.parse(stored);
      if (fonnteConfig.deviceToken) {
        deviceToken = fonnteConfig.deviceToken;
      }
    }
  } catch (e) {
    console.log("Error reading fonnte config from KV:", e.message);
  }

  // Skip jika tidak ada nomor HP atau token Fonnte
  if (!user.phone || !deviceToken) {
    console.log(`📱 Skip pre-checkin notification: ${!user.phone ? 'No phone' : 'No Fonnte token'}`);
    return;
  }

  // Format nomor HP
  let phone = user.phone.replace(/\D/g, '');

  const waMessage = `⏰ *Auto Check-in SKEMARAJA Dimulai*

🔄 Proses check-in *${schedule.name}* akan segera dijalankan...
Hasil akan dikirimkan setelah selesai.

_Auto Check-in by SKEMARAJA_`;

  try {
    const formData = new URLSearchParams();
    formData.append('target', phone);
    formData.append('message', waMessage);
    formData.append('countryCode', '62');

    const response = await fetch(FONNTE_API, {
      method: 'POST',
      headers: {
        'Authorization': deviceToken
      },
      body: formData
    });

    const result = await response.json();
    if (result.status === true) {
      console.log(`📱 Pre-checkin notification sent to ${user.name}`);
    } else {
      console.log(`📱 Pre-checkin notification failed: ${result.reason || 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`📱 Pre-checkin notification error: ${error.message}`);
  }
}

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
      const authPassword = await getAuthPassword(env);
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

      // Fonnte WhatsApp API routes
      if (path === "/fonnte/devices" && request.method === "GET") {
        return handleFonnteGetDevices(env, corsHeaders);
      }
      if (path === "/fonnte/qr" && request.method === "POST") {
        return handleFonnteGetQR(request, env, corsHeaders);
      }
      if (path === "/fonnte/status" && request.method === "GET") {
        return handleFonnteStatus(env, corsHeaders);
      }
      if (path === "/fonnte/save-config" && request.method === "POST") {
        return handleFonnteSaveConfig(request, env, corsHeaders);
      }
      if (path === "/fonnte/disconnect" && request.method === "POST") {
        return handleFonnteDisconnect(env, corsHeaders);
      }
      if (path === "/change-password" && request.method === "POST") {
        return handleChangePassword(request, env, corsHeaders);
      }

      // Holiday management routes
      if (path === "/holidays") {
        if (request.method === "GET") {
          return handleGetHolidays(env, corsHeaders);
        } else if (request.method === "POST") {
          return handleSaveHolidays(request, env, corsHeaders);
        }
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
      const todayKey = `${witaTime.getFullYear()}-${String(witaTime.getMonth() + 1).padStart(2, '0')}-${String(witaTime.getDate()).padStart(2, '0')}`;

      console.log(`📅 WITA Time: ${witaTime.toISOString()}, Day: ${currentDay}, Hour: ${currentHour}, Minute: ${currentMinute}`);
      console.log(`📅 Today Key: ${todayKey}`);

      // Skip hari Sabtu (6) dan Minggu (0)
      if (currentDay === 0 || currentDay === 6) {
        console.log("📅 Hari libur (Sabtu/Minggu) - skip check-in");
        return;
      }

      // Skip hari libur nasional Indonesia
      const holidays = await getHolidays(env);
      const holidayName = isNationalHoliday(todayKey, holidays);
      if (holidayName) {
        console.log(`📅 Hari Libur Nasional: ${holidayName} - skip check-in`);
        return;
      }

      // Deteksi jadwal berdasarkan rentang waktu yang sudah dikonfigurasi di dashboard
      const currentMinutes = currentHour * 60 + currentMinute;
      let detectedSchedule = null;

      for (const schedule of config.schedules) {
        if (!schedule.enabled) continue;

        const startMinutes = schedule.startHour * 60 + schedule.startMinute;
        const endMinutes = schedule.endHour * 60 + schedule.endMinute;

        if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
          detectedSchedule = schedule;
          console.log(`✅ Jadwal ${schedule.name} terdeteksi! Waktu WITA: ${currentHour}:${String(currentMinute).padStart(2, '0')}, Range: ${schedule.startHour}:${String(schedule.startMinute).padStart(2, '0')} - ${schedule.endHour}:${String(schedule.endMinute).padStart(2, '0')}`);
          break;
        }
      }

      if (!detectedSchedule) {
        console.log(`⚠️ Tidak ada jadwal yang cocok untuk jam ${currentHour}:${String(currentMinute).padStart(2, '0')} WITA`);
        return;
      }

      const schedule = detectedSchedule;

      // Ambil status check-in hari ini dari KV
      let todayCheckins = {};
      try {
        const stored = await env.CHECKIN_KV.get(`checkins_${todayKey}`, "json");
        if (stored) todayCheckins = stored;
      } catch (e) {
        console.log("Error reading today's checkins:", e.message);
      }

      // Hitung jumlah user yang perlu check-in (belum check-in hari ini untuk jadwal ini)
      const activeUsers = config.users.filter(u => u.enabled && u.nip && u.password);
      const usersNeedCheckin = activeUsers.filter(u => {
        const checkinKey = `${u.nip}_${schedule.name}`;
        return !todayCheckins[checkinKey];
      });

      if (usersNeedCheckin.length === 0) {
        console.log(`✅ Semua user sudah check-in ${schedule.name} hari ini`);
        return;
      }

      console.log(`👥 User perlu check-in: ${usersNeedCheckin.length}/${activeUsers.length}`);
      console.log(`🚀 Menjalankan check-in ${schedule.name}...`);

      // ========== TEST KONEKSI DULU SEBELUM CHECK-IN ==========
      console.log(`🔗 Melakukan test koneksi ke SKEMARAJA sebelum check-in...`);
      const connectionTest = await testSkemarajaConnection(15); // Max 15 attempts

      if (!connectionTest.success) {
        console.log(`❌ Gagal terhubung ke SKEMARAJA setelah ${connectionTest.attempts} attempts, abort check-in ${schedule.name}`);
        await addLog(env, {
          timestamp: new Date().toISOString(),
          type: "error",
          schedule: schedule.name,
          message: `Koneksi ke SKEMARAJA gagal setelah ${connectionTest.attempts} attempts - check-in dibatalkan`
        });
        return;
      }

      console.log(`✅ Koneksi SKEMARAJA berhasil setelah ${connectionTest.attempts} attempt(s), lanjut check-in...`);
      // ========== END TEST KONEKSI ==========

      // Kirim notifikasi WA "check-in dimulai" ke semua user yang akan check-in
      const witaTimeStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' });
      for (const user of usersNeedCheckin) {
        await sendPreCheckinNotification(env, user, schedule, config.location?.name || 'KSOP Gorontalo', witaTimeStr);
      }

      // Check-in untuk semua user yang belum check-in
      let userIndex = 0;
      for (const user of usersNeedCheckin) {
        userIndex++;

        // Random delay 0-30 detik
        const randomSeconds = Math.floor(Math.random() * 30);
        if (randomSeconds > 0) {
          await new Promise(r => setTimeout(r, randomSeconds * 1000));
        }

        console.log(`🚀 [${userIndex}/${usersNeedCheckin.length}] Memulai check-in untuk: ${user.name}`);
        const result = await performCheckin(config, schedule, user, env);

        // Tandai sudah check-in hari ini
        if (result.success) {
          const checkinKey = `${user.nip}_${schedule.name}`;
          todayCheckins[checkinKey] = {
            time: new Date().toISOString(),
            success: true
          };
          // Simpan ke KV dengan TTL 24 jam
          await env.CHECKIN_KV.put(`checkins_${todayKey}`, JSON.stringify(todayCheckins), { expirationTtl: 86400 });
        }

        // Delay 3-8 detik antar user
        if (userIndex < usersNeedCheckin.length) {
          const interUserDelay = 3000 + Math.floor(Math.random() * 5000);
          console.log(`⏳ Menunggu ${Math.round(interUserDelay / 1000)} detik sebelum user berikutnya...`);
          await new Promise(r => setTimeout(r, interUserDelay));
        }
      }

      console.log(`✅ Selesai check-in ${schedule.name} untuk ${usersNeedCheckin.length} user`);
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

    // Random User-Agent untuk setiap user
    const userAgent = getRandomUserAgent();
    console.log(`📱 User-Agent: ${userAgent.includes('iPhone') ? 'iPhone' : 'Android'}`);

    // Step 1: Ambil halaman login untuk mendapatkan CSRF token
    const loginPageResponse = await fetch(SKEMARAJA_LOGIN, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      }
    });

    if (!loginPageResponse.ok) {
      // Retry untuk error 522 (Connection timed out)
      if (loginPageResponse.status === 522 && retryCount < maxRetries) {
        console.log(`⚠️ Error 522 saat akses login page, retrying in 3 seconds... (retry ${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, 3000));
        return await performCheckin(config, schedule, user, env, retryCount + 1);
      }
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

    // Step 2: POST authenticate dengan redirect manual
    const authResponse = await fetch(SKEMARAJA_AUTH, {
      method: "POST",
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": SKEMARAJA_BASE,
        "Referer": SKEMARAJA_LOGIN,
        "Cookie": cookies,
      },
      body: formData.toString(),
      redirect: "manual"  // Manual redirect untuk capture cookies
    });

    const responseStatus = authResponse.status;
    const responseLocation = authResponse.headers.get("location") || "";

    // Gabungkan cookies dari login page + authenticate response
    // PENTING: Auth cookies harus REPLACE login cookies dengan nama sama!
    const authCookies = authResponse.headers.getAll("set-cookie");
    console.log(`🍪 Login cookies count: ${setCookies.length}`);
    console.log(`🍪 Auth response cookies count: ${authCookies.length}`);

    // Merge cookies by name - auth cookies override login cookies
    const cookieMap = new Map();

    // First add login cookies
    for (const cookie of setCookies) {
      const [nameValue] = cookie.split(";");
      const [name] = nameValue.split("=");
      cookieMap.set(name.trim(), nameValue.trim());
    }

    // Then override dengan auth cookies (yang baru)
    for (const cookie of authCookies) {
      const [nameValue] = cookie.split(";");
      const [name] = nameValue.split("=");
      cookieMap.set(name.trim(), nameValue.trim());
    }

    const allCookies = Array.from(cookieMap.values()).join("; ");

    console.log(`🍪 Final cookie names: ${Array.from(cookieMap.keys()).join(", ")}`);
    console.log(`📥 Response status: ${responseStatus}`);
    console.log(`📥 Redirect location: ${responseLocation}`);
    console.log(`🍪 Combined cookies: ${allCookies.substring(0, 200)}...`);

    // Cek hasil berdasarkan status dan redirect
    let success = false;
    let message = "";
    let responseHtml = "";

    if (responseStatus >= 300 && responseStatus < 400) {
      // Redirect - berarti check-in dikirim, sekarang fetch dashboard untuk verifikasi
      if (responseLocation.includes("/login")) {
        success = false;
        message = "Check-in gagal. Kredensial mungkin salah.";
      } else {
        // Follow redirect manually dengan cookies yang sudah digabung
        console.log("🔄 Following redirect manually...");
        const dashboardResponse = await fetch(responseLocation || SKEMARAJA_BASE, {
          headers: {
            "User-Agent": userAgent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Cookie": allCookies,
          },
          redirect: "follow"
        });

        responseHtml = await dashboardResponse.text();
        console.log(`📄 Dashboard HTML length: ${responseHtml.length} chars`);

        if (responseHtml.length > 10000) {
          // Dapat dashboard - check-in berhasil
          success = true;
          message = "Check-in berhasil!";

          // Parse waktu absensi dari response HTML langsung
          try {
            console.log("Parsing waktu absensi dari dashboard...");

            // Cari row hari ini di tabel absensi (gunakan waktu WITA)
            const now = new Date();
            const witaOffset = 8 * 60; // menit
            const witaTime = new Date(now.getTime() + (witaOffset + now.getTimezoneOffset()) * 60000);

            // Format: "24-Dec-2025"
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const day = String(witaTime.getDate()).padStart(2, '0');
            const month = months[witaTime.getMonth()];
            const year = witaTime.getFullYear();
            const todayStr = `${day}-${month}-${year}`;

            console.log(`🔍 Mencari tanggal: ${todayStr} untuk kolom ${schedule.name}`);

            // Cari semua waktu dengan tanggal hari ini
            const timePattern = new RegExp(`${todayStr}\\s+(\\d{2}):(\\d{2}):(\\d{2})`, 'g');
            const matches = [];
            let m;
            while ((m = timePattern.exec(responseHtml)) !== null) {
              matches.push({
                hour: parseInt(m[1]),
                minute: parseInt(m[2]),
                second: parseInt(m[3]),
                timeStr: `${m[1]}:${m[2]}:${m[3]}`
              });
            }

            console.log(`📊 Ditemukan ${matches.length} waktu check-in hari ini: ${matches.map(m => m.timeStr).join(', ')}`);

            // Tentukan waktu mana yang sesuai dengan schedule
            // Pagi: jam 7-11, Siang: jam 12-15, Sore: jam 16-23
            let attendanceMatch = null;
            for (const match of matches) {
              if (schedule.name === "Pagi" && match.hour >= 7 && match.hour < 12) {
                attendanceMatch = match;
                break;
              } else if (schedule.name === "Siang" && match.hour >= 12 && match.hour < 16) {
                attendanceMatch = match;
                break;
              } else if (schedule.name === "Sore" && match.hour >= 16 && match.hour <= 23) {
                attendanceMatch = match;
                break;
              }
            }

            if (attendanceMatch) {
              // Bandingkan dengan waktu saat ini (WITA)
              const currentMinutes = witaTime.getHours() * 60 + witaTime.getMinutes();
              const recordedMinutes = attendanceMatch.hour * 60 + attendanceMatch.minute;
              const timeDiff = Math.abs(currentMinutes - recordedMinutes);

              console.log(`🕐 Waktu tercatat=${attendanceMatch.timeStr}, Waktu WITA=${witaTime.getHours()}:${witaTime.getMinutes()}, Selisih=${timeDiff} menit`);

              if (timeDiff > 5) {
                // Check-in sudah ada sebelumnya
                message = `ℹ️ Sudah check-in ${schedule.name} sebelumnya (${attendanceMatch.timeStr})`;
              } else {
                // Check-in baru (selisih < 5 menit)
                message = `✅ Check-in ${schedule.name} berhasil! (${attendanceMatch.timeStr})`;
              }
            } else {
              console.log(`📋 Tidak menemukan waktu ${schedule.name} di rentang yang sesuai`);
              message = `✅ Check-in ${schedule.name} berhasil!`;
            }
          } catch (parseError) {
            console.log(`⚠️ Error parsing waktu: ${parseError.message}`);
          }

        } else {
          // Dashboard kecil - mungkin login page atau error
          success = false;
          message = "Check-in gagal - tidak bisa akses dashboard.";
          console.log(`⚠️ Dashboard terlalu kecil: ${responseHtml.length} chars`);
        }
      }
    } else if (responseStatus === 200) {
      // Response langsung tanpa redirect - baca content
      responseHtml = await authResponse.text();
      if (responseHtml.includes("berhasil") || responseHtml.includes("success")) {
        success = true;
        message = "Check-in berhasil!";
      } else if (responseHtml.includes("sudah check") || responseHtml.includes("already")) {
        success = true;
        message = "Sudah check-in sebelumnya hari ini.";
      } else if (responseHtml.includes("password") || responseHtml.includes("salah")) {
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

    // Kirim notifikasi WhatsApp (dengan info device type dan lokasi)
    const deviceType = userAgent.includes('iPhone') ? 'iPhone' : 'Android';
    await sendWhatsAppNotification(env, user, schedule, success, message, new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }), deviceType, config.location?.name || 'KSOP Gorontalo');

    // Logout setelah check-in untuk membersihkan session
    try {
      await fetch("https://skemaraja.dephub.go.id/logout", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Cookie": allCookies,
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
    .btn-info { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .btn-sm { padding: 6px 12px; font-size: 11px; }
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
    /* Result Modal */
    .result-modal {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    .result-modal-content {
      background: white;
      border-radius: 16px;
      padding: 30px;
      max-width: 450px;
      width: 90%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      animation: modalSlideIn 0.3s ease;
    }
    @keyframes modalSlideIn {
      from { opacity: 0; transform: translateY(-30px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .result-modal-icon {
      font-size: 60px;
      margin-bottom: 16px;
    }
    .result-modal-title {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .result-modal-message {
      font-size: 15px;
      color: #555;
      margin-bottom: 24px;
      line-height: 1.6;
    }
    .result-modal.success .result-modal-title { color: #22c55e; }
    .result-modal.error .result-modal-title { color: #ef4444; }
    /* Edit Modal */
    .edit-modal {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 1001;
      justify-content: center;
      align-items: center;
    }
    .edit-modal-content {
      background: white;
      border-radius: 16px;
      padding: 30px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      animation: modalSlideIn 0.3s ease;
    }
    .edit-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .edit-modal-header h3 {
      margin: 0;
      color: #1e3c72;
    }
    .edit-modal-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
    }
    .result-modal.pending .result-modal-title { color: #f59e0b; }
  </style>
</head>
<body>
  <!-- Result Modal for Manual Check-in -->
  <div id="resultModal" class="result-modal" onclick="hideResultModal()">
    <div class="result-modal-content" onclick="event.stopPropagation()">
      <div class="result-modal-icon" id="resultModalIcon">⏳</div>
      <div class="result-modal-title" id="resultModalTitle">Proses</div>
      <div class="result-modal-message" id="resultModalMessage">Sedang memproses...</div>
      <button class="btn btn-primary" onclick="hideResultModal()">Tutup</button>
    </div>
  </div>

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

    <!-- Schedule Info Card -->
    <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
      <h2 style="color: white; border-color: rgba(255,255,255,0.3);">🔔 Jadwal Auto Check-in</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
        ${config.schedules.filter(s => s.enabled).map(s => {
    const cronTimes = { 'Pagi': '07:00', 'Siang': '12:05', 'Sore': '17:30' };
    const icons = { 'Pagi': '🌅', 'Siang': '☀️', 'Sore': '🌆' };
    const cronTime = cronTimes[s.name] || '00:00';
    const icon = icons[s.name] || '⏰';
    const rangeStart = String(s.startHour).padStart(2, '0') + ':' + String(s.startMinute).padStart(2, '0');
    const rangeEnd = String(s.endHour).padStart(2, '0') + ':' + String(s.endMinute).padStart(2, '0');
    return '<div style="background: rgba(255,255,255,0.15); border-radius: 12px; padding: 16px; backdrop-filter: blur(10px);">' +
      '<div style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">' + icon + ' ' + s.name + '</div>' +
      '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
      '<div><div style="font-size: 12px; opacity: 0.8;">Trigger Cron:</div>' +
      '<div style="font-size: 18px; font-weight: 600;">' + cronTime + ' WITA</div></div>' +
      '<div><div style="font-size: 12px; opacity: 0.8;">Rentang Valid:</div>' +
      '<div style="font-size: 18px; font-weight: 600;">' + rangeStart + ' - ' + rangeEnd + '</div></div></div>' +
      '<div style="font-size: 11px; opacity: 0.7; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">' +
      '⏰ Cron trigger pada ' + cronTime + ', check-in jika dalam rentang + random delay 0-30 detik</div></div>';
  }).join('')}
      </div>
      <div style="margin-top: 16px; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 8px; font-size: 13px;">
        <strong>ℹ️ Catatan:</strong> Auto check-in berjalan setiap hari kerja (Senin-Jumat). 
        Waktu check-in bervariasi 0-30 detik dari waktu trigger. Jika sudah check-in hari ini, akan di-skip.
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
              <input type="hidden" name="user_${i}_name" value="${user.name || ''}">
              <input type="hidden" name="user_${i}_nip" value="${user.nip || ''}">
              <input type="hidden" name="user_${i}_password" value="${user.password || ''}">
              <input type="hidden" name="user_${i}_phone" value="${user.phone || ''}">
              <div class="user-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <span class="user-name">${user.name || 'User ' + (i + 1)}</span>
                  <div style="font-size: 12px; color: #666; margin-top: 4px;">NIP: ${user.nip || '-'} | 📱 ${user.phone || '-'}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <button type="button" class="btn btn-success btn-sm" onclick="checkinUser(${i})" title="Check-in">🚀</button>
                  <button type="button" class="btn btn-info btn-sm" onclick="editUser(${i})" title="Edit">✏️</button>
                  <button type="button" class="btn btn-danger btn-sm" onclick="removeUser(${i})" title="Hapus">🗑️</button>
                  <label class="toggle">
                    <input type="checkbox" name="user_${i}_enabled" ${user.enabled ? 'checked' : ''}>
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        
        <div style="margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap;">
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

        <!-- Schedules Summary -->
        <h3>📅 Jadwal Check-in</h3>
        <div style="background:#f8fafc; padding:12px; border-radius:8px; margin-bottom:12px;">
          ${config.schedules.map((s, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; ${i > 0 ? 'border-top:1px solid #e2e8f0;' : ''}">
              <span><strong>${s.name}:</strong> ${String(s.startHour || 7).padStart(2, '0')}:${String(s.startMinute || 0).padStart(2, '0')} - ${String(s.endHour || 8).padStart(2, '0')}:${String(s.endMinute || 0).padStart(2, '0')}</span>
              <span style="color:${s.enabled ? '#22c55e' : '#ef4444'};">${s.enabled ? '✅ Aktif' : '❌ Nonaktif'}</span>
            </div>
          `).join('')}
        </div>
        <button type="button" class="btn btn-info btn-sm" onclick="showScheduleModal()">📅 Edit Jadwal</button>
        <button type="button" class="btn btn-warning btn-sm" onclick="showHolidayModal()">🎌 Edit Hari Libur</button>
        
        <!-- Hidden inputs for form submission -->
        <div id="scheduleInputs" style="display:none;">
          ${config.schedules.map((s, i) => `
            <input type="checkbox" name="schedule_${i}_enabled" ${s.enabled ? 'checked' : ''}>
            <input type="number" name="schedule_${i}_startHour" value="${s.startHour || 7}">
            <input type="number" name="schedule_${i}_startMinute" value="${s.startMinute || 0}">
            <input type="number" name="schedule_${i}_endHour" value="${s.endHour || 8}">
            <input type="number" name="schedule_${i}_endMinute" value="${s.endMinute || 0}">
            <input type="hidden" name="schedule_${i}_status" value="${s.status_wfh || '2'}">
          `).join('')}
        </div>
    
    <!-- WhatsApp Settings Card -->
    <div class="card">
      <h2>📱 Pengaturan WhatsApp (Fonnte)</h2>
      <div id="waStatus" style="margin-bottom: 16px; padding: 12px; border-radius: 8px; background: #f1f5f9;">
        <span id="waStatusIcon">⏳</span> <span id="waStatusText">Mengecek status...</span>
      </div>
      
      <div class="form-grid" style="margin-bottom: 16px;">
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Account Token (dari fonnte.com)</label>
          <div style="display: flex; gap: 8px;">
            <input type="password" id="fonnteAccountToken" placeholder="Masukkan Account Token" style="flex: 1;">
            <button type="button" class="btn btn-primary btn-sm" onclick="loadFonnteDevices()">🔄 Load Devices</button>
          </div>
          <small style="color: #666;">Token ini untuk mengambil daftar device. Dapatkan di fonnte.com</small>
        </div>
      </div>
      
      <div id="fonnteDeviceList" style="margin-bottom: 16px; display: none;">
        <div class="form-group">
          <label>Pilih Device</label>
          <select id="fonnteDeviceSelect" onchange="onDeviceSelected()">
            <option value="">-- Pilih Device --</option>
          </select>
        </div>
        <div id="deviceInfo" style="padding: 12px; background: #f8fafc; border-radius: 8px; display: none;">
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 14px;">
            <div><strong>Nama:</strong> <span id="deviceInfoName">-</span></div>
            <div><strong>Nomor:</strong> <span id="deviceInfoNumber">-</span></div>
            <div><strong>Status:</strong> <span id="deviceInfoStatus">-</span></div>
            <div><strong>Quota:</strong> <span id="deviceInfoQuota">-</span></div>
          </div>
        </div>
      </div>
      
      <div class="btn-group" style="flex-wrap: wrap;">
        <button type="button" class="btn btn-success" onclick="saveFonnteConfig()">💾 Simpan Token</button>
        <button type="button" id="btnConnectDevice" class="btn btn-primary" onclick="toggleFonnteDevice()">📲 Connect Device</button>
        <button type="button" class="btn btn-info" onclick="checkFonnteStatus()">🔍 Cek Status</button>
        <button type="button" class="btn btn-warning" onclick="sendTestWA()">📤 Test Kirim WA</button>
      </div>
    </div>

        <div class="btn-group">
          <button type="submit" class="btn btn-primary">💾 Simpan Konfigurasi</button>
          <button type="button" class="btn btn-success" onclick="checkinAll()">🚀 Check-in Semua User</button>
          <button type="button" class="btn btn-primary" onclick="testConnection()">🔗 Test Koneksi</button>
          <button type="button" class="btn btn-warning" onclick="showPasswordModal()">⚙️ Pengaturan</button>
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

  <!-- Password Settings Modal -->
  <div id="passwordModal" class="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
    <div class="modal-content" style="background:white; padding:24px; border-radius:16px; width:90%; max-width:400px;">
      <h3 style="margin-bottom:20px; color:#1e3c72;">⚙️ Pengaturan</h3>
      
      <h4 style="margin-bottom:12px;">🔐 Ubah Password Dashboard</h4>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Password Saat Ini</label>
        <input type="password" id="currentPassword" placeholder="Masukkan password saat ini" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;">
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Password Baru</label>
        <input type="password" id="newPassword" placeholder="Password baru (min 6 karakter)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;">
      </div>
      <div class="form-group" style="margin-bottom:16px;">
        <label>Konfirmasi Password Baru</label>
        <input type="password" id="confirmPassword" placeholder="Ulangi password baru" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;">
      </div>
      
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button type="button" class="btn btn-warning" onclick="changePassword()">🔑 Ubah Password</button>
        <button type="button" class="btn btn-primary" onclick="hidePasswordModal()">❌ Tutup</button>
      </div>
    </div>
  </div>

  <!-- Schedule Settings Modal -->
  <div id="scheduleModal" class="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center; overflow-y:auto;">
    <div class="modal-content" style="background:white; padding:24px; border-radius:16px; width:90%; max-width:600px; margin:20px auto;">
      <h3 style="margin-bottom:20px; color:#1e3c72;">📅 Edit Jadwal Check-in</h3>
      
      <div id="scheduleModalContent">
        ${config.schedules.map((s, i) => `
          <div style="background:#f8fafc; padding:16px; border-radius:8px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <strong>${s.name}</strong>
              <label class="toggle">
                <input type="checkbox" id="modal_schedule_${i}_enabled" ${s.enabled ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr 1fr; gap:8px;">
              <div class="form-group">
                <label style="font-size:12px;">Mulai Jam</label>
                <input type="number" id="modal_schedule_${i}_startHour" value="${s.startHour || 7}" min="0" max="23" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
              </div>
              <div class="form-group">
                <label style="font-size:12px;">Menit</label>
                <input type="number" id="modal_schedule_${i}_startMinute" value="${s.startMinute || 0}" min="0" max="59" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
              </div>
              <div class="form-group">
                <label style="font-size:12px;">Sampai Jam</label>
                <input type="number" id="modal_schedule_${i}_endHour" value="${s.endHour || 8}" min="0" max="23" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
              </div>
              <div class="form-group">
                <label style="font-size:12px;">Menit</label>
                <input type="number" id="modal_schedule_${i}_endMinute" value="${s.endMinute || 0}" min="0" max="59" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
              </div>
              <div class="form-group">
                <label style="font-size:12px;">Status</label>
                <select id="modal_schedule_${i}_status" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
                  <option value="1" ${s.status_wfh === "1" ? 'selected' : ''}>WFH</option>
                  <option value="2" ${s.status_wfh === "2" ? 'selected' : ''}>WFO</option>
                  <option value="3" ${s.status_wfh === "3" ? 'selected' : ''}>Dinas Luar</option>
                </select>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button type="button" class="btn btn-success" onclick="applyScheduleChanges()">💾 Simpan Jadwal</button>
        <button type="button" class="btn btn-primary" onclick="hideScheduleModal()">❌ Tutup</button>
      </div>
    </div>
  </div>

  <!-- Holiday Settings Modal -->
  <div id="holidayModal" class="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center; overflow-y:auto;">
    <div class="modal-content" style="background:white; padding:24px; border-radius:16px; width:90%; max-width:600px; margin:20px auto; max-height:80vh; overflow-y:auto;">
      <h3 style="margin-bottom:20px; color:#1e3c72;">🎌 Edit Hari Libur Nasional</h3>
      
      <div style="margin-bottom:16px; padding:12px; background:#fff3cd; border-radius:8px; font-size:13px;">
        <strong>ℹ️ Info:</strong> Auto check-in akan di-skip pada hari libur yang terdaftar di sini.
      </div>
      
      <!-- Add New Holiday -->
      <div style="background:#f8fafc; padding:16px; border-radius:8px; margin-bottom:16px;">
        <strong style="display:block; margin-bottom:12px;">➕ Tambah Hari Libur Baru</strong>
        <div style="display:grid; grid-template-columns:1fr 2fr; gap:12px;">
          <div class="form-group">
            <label style="font-size:12px;">Tanggal</label>
            <input type="date" id="newHolidayDate" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
          </div>
          <div class="form-group">
            <label style="font-size:12px;">Nama Hari Libur</label>
            <input type="text" id="newHolidayName" placeholder="Contoh: Hari Raya Idul Fitri" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
          </div>
        </div>
        <button type="button" class="btn btn-success btn-sm" onclick="addHoliday()" style="margin-top:12px;">➕ Tambah</button>
      </div>
      
      <!-- Holiday List -->
      <div id="holidayList" style="max-height:300px; overflow-y:auto; border:1px solid #e0e0e0; border-radius:8px;">
        <p style="text-align:center; padding:20px; color:#666;">⏳ Loading...</p>
      </div>
      
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:16px;">
        <button type="button" class="btn btn-success" onclick="saveHolidays()">💾 Simpan Perubahan</button>
        <button type="button" class="btn btn-primary" onclick="hideHolidayModal()">❌ Tutup</button>
      </div>
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

    // Modal popup untuk hasil check-in manual
    function showModal(type, title, message) {
      const modal = document.getElementById('resultModal');
      const icon = document.getElementById('resultModalIcon');
      const titleEl = document.getElementById('resultModalTitle');
      const msgEl = document.getElementById('resultModalMessage');
      
      modal.className = 'result-modal ' + type;
      icon.textContent = type === 'success' ? '✅' : type === 'pending' ? '⏳' : '❌';
      titleEl.textContent = title;
      msgEl.innerHTML = message;
      
      modal.style.display = 'flex';
    }
    
    function hideResultModal() {
      document.getElementById('resultModal').style.display = 'none';
      location.reload();
    }

    function removeUser(index) {
      if (confirm('Hapus user ini?')) {
        document.querySelector(\`.user-card[data-index="\${index}"]\`).remove();
      }
    }

    // Edit User Modal Functions
    let currentEditIndex = -1;

    function editUser(index) {
      currentEditIndex = index;
      const card = document.querySelector(\`.user-card[data-index="\${index}"]\`);
      if (!card) return;

      const nameInput = card.querySelector('input[name$="_name"]');
      const nipInput = card.querySelector('input[name$="_nip"]');
      const passwordInput = card.querySelector('input[name$="_password"]');
      const phoneInput = card.querySelector('input[name$="_phone"]');

      document.getElementById('editUserName').value = nameInput ? nameInput.value : '';
      document.getElementById('editUserNip').value = nipInput ? nipInput.value : '';
      document.getElementById('editUserPassword').value = passwordInput ? passwordInput.value : '';
      document.getElementById('editUserPhone').value = phoneInput ? phoneInput.value : '';

      document.getElementById('editModal').style.display = 'flex';
    }

    function hideEditModal() {
      document.getElementById('editModal').style.display = 'none';
      currentEditIndex = -1;
    }

    function saveEditUser() {
      if (currentEditIndex < 0) return;

      const card = document.querySelector(\`.user-card[data-index="\${currentEditIndex}"]\`);
      if (!card) return;

      const name = document.getElementById('editUserName').value;
      const nip = document.getElementById('editUserNip').value;
      const password = document.getElementById('editUserPassword').value;
      const phone = document.getElementById('editUserPhone').value;

      // Update hidden inputs
      const nameInput = card.querySelector('input[name$="_name"]');
      const nipInput = card.querySelector('input[name$="_nip"]');
      const passwordInput = card.querySelector('input[name$="_password"]');
      const phoneInput = card.querySelector('input[name$="_phone"]');

      if (nameInput) nameInput.value = name;
      if (nipInput) nipInput.value = nip;
      if (passwordInput) passwordInput.value = password;
      if (phoneInput) phoneInput.value = phone;

      // Update display
      const userNameSpan = card.querySelector('.user-name');
      const nipDisplay = card.querySelector('.user-header > div:first-child > div');

      if (userNameSpan) userNameSpan.textContent = name || 'User ' + (currentEditIndex + 1);
      if (nipDisplay) nipDisplay.textContent = 'NIP: ' + (nip || '-') + ' | 📱 ' + (phone || '-');

      // Update card class
      if (nip && card.querySelector('input[name$="_enabled"]')?.checked) {
        card.classList.add('enabled');
      } else {
        card.classList.remove('enabled');
      }

      hideEditModal();
      showResult('success', '✅ Data user berhasil diupdate. Klik Simpan untuk menyimpan perubahan.');
    }

    function collectFormData() {
      const formData = new FormData(document.getElementById('configForm'));
      const users = [];

      // Collect users dynamically - directly query inputs inside each card
      document.querySelectorAll('.user-card').forEach((card) => {
        const nameInput = card.querySelector('input[name$="_name"]');
        const nipInput = card.querySelector('input[name$="_nip"]');
        const passwordInput = card.querySelector('input[name$="_password"]');
        const phoneInput = card.querySelector('input[name$="_phone"]');
        const enabledInput = card.querySelector('input[name$="_enabled"]');

        users.push({
          name: nameInput ? nameInput.value : 'User',
          nip: nipInput ? nipInput.value : '',
          password: passwordInput ? passwordInput.value : '',
          phone: phoneInput ? phoneInput.value : '',
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
          { name: "Pagi", startHour: parseInt(formData.get('schedule_0_startHour')), startMinute: parseInt(formData.get('schedule_0_startMinute')), endHour: parseInt(formData.get('schedule_0_endHour')), endMinute: parseInt(formData.get('schedule_0_endMinute')), status_wfh: formData.get('schedule_0_status'), shift: "1", enabled: formData.get('schedule_0_enabled') === 'on' },
          { name: "Siang", startHour: parseInt(formData.get('schedule_1_startHour')), startMinute: parseInt(formData.get('schedule_1_startMinute')), endHour: parseInt(formData.get('schedule_1_endHour')), endMinute: parseInt(formData.get('schedule_1_endMinute')), status_wfh: formData.get('schedule_1_status'), shift: "1", enabled: formData.get('schedule_1_enabled') === 'on' },
          { name: "Sore", startHour: parseInt(formData.get('schedule_2_startHour')), startMinute: parseInt(formData.get('schedule_2_startMinute')), endHour: parseInt(formData.get('schedule_2_endHour')), endMinute: parseInt(formData.get('schedule_2_endMinute')), status_wfh: formData.get('schedule_2_status'), shift: "1", enabled: formData.get('schedule_2_enabled') === 'on' }
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
      showModal('pending', 'Proses Check-in', '⏳ Sedang melakukan check-in untuk semua user...');
      try {
        const res = await fetch('/checkin', { method: 'POST' });
        const data = await res.json();
        let msg = '';
        if (data.results) {
          data.results.forEach(r => {
            msg += \`\${r.success ? '✅' : '❌'} <strong>\${r.user}</strong>: \${r.message}<br>\`;
          });
        } else {
          msg = data.message;
        }
        showModal(data.success ? 'success' : 'error', data.success ? 'Check-in Berhasil' : 'Check-in Gagal', msg);
      } catch (err) {
        showModal('error', 'Error', 'Error: ' + err.message);
      }
    }

    async function checkinUser(index) {
      showModal('pending', 'Proses Check-in', '⏳ Sedang melakukan check-in...');
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
        showModal(data.success ? 'success' : 'error', data.success ? 'Check-in Berhasil' : 'Check-in Gagal', data.message);
      } catch (err) {
        showModal('error', 'Error', 'Error: ' + err.message);
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

    // ============================================================
    // Fonnte WhatsApp Functions
    // ============================================================
    let fonnteDevices = [];

    // Load on page ready
    document.addEventListener('DOMContentLoaded', function() {
      checkFonnteStatus();
    });

    async function loadFonnteDevices() {
      const accountToken = document.getElementById('fonnteAccountToken').value;
      
      if (accountToken) {
        // Save account token first
        await fetch('/fonnte/save-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountToken })
        });
      }
      
      showResult('pending', '⏳ Mengambil daftar device...');
      
      try {
        const res = await fetch('/fonnte/devices');
        const data = await res.json();
        
        if (data.success) {
          fonnteDevices = data.devices;
          const select = document.getElementById('fonnteDeviceSelect');
          select.innerHTML = '<option value="">-- Pilih Device --</option>';
          
          data.devices.forEach((d, i) => {
            const statusIcon = d.status === 'connect' ? '🟢' : '🔴';
            select.innerHTML += \`<option value="\${i}">\${statusIcon} \${d.name} (\${d.device})</option>\`;
          });
          
          document.getElementById('fonnteDeviceList').style.display = 'block';
          showResult('success', '✅ Ditemukan ' + data.devices.length + ' device');
        } else {
          showResult('error', '❌ ' + data.message);
        }
      } catch (err) {
        showResult('error', '❌ Error: ' + err.message);
      }
    }

    function onDeviceSelected() {
      const index = document.getElementById('fonnteDeviceSelect').value;
      if (index === '' || !fonnteDevices[index]) {
        document.getElementById('deviceInfo').style.display = 'none';
        return;
      }
      
      const device = fonnteDevices[index];
      document.getElementById('deviceInfoName').textContent = device.name;
      document.getElementById('deviceInfoNumber').textContent = device.device;
      document.getElementById('deviceInfoStatus').textContent = device.status === 'connect' ? '🟢 Connected' : '🔴 Disconnected';
      document.getElementById('deviceInfoQuota').textContent = device.quota || 'N/A';
      document.getElementById('deviceInfo').style.display = 'block';
    }

    async function saveFonnteConfig() {
      const index = document.getElementById('fonnteDeviceSelect').value;
      const accountToken = document.getElementById('fonnteAccountToken').value;
      
      if (!accountToken) {
        showResult('error', '❌ Masukkan Account Token terlebih dahulu');
        return;
      }
      
      let deviceToken = '';
      let deviceNumber = '';
      let deviceName = '';
      
      if (index !== '' && fonnteDevices[index]) {
        const device = fonnteDevices[index];
        deviceToken = device.token;
        deviceNumber = device.device;
        deviceName = device.name;
      }
      
      showResult('pending', '⏳ Menyimpan konfigurasi...');
      
      try {
        const res = await fetch('/fonnte/save-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountToken, deviceToken, deviceNumber, deviceName })
        });
        const data = await res.json();
        
        if (data.success) {
          showResult('success', '✅ ' + data.message);
        } else {
          showResult('error', '❌ ' + data.message);
        }
      } catch (err) {
        showResult('error', '❌ Error: ' + err.message);
      }
    }

    async function connectFonnteDevice() {
      const index = document.getElementById('fonnteDeviceSelect').value;
      let deviceToken = '';
      
      if (index !== '' && fonnteDevices[index]) {
        deviceToken = fonnteDevices[index].token;
      }
      
      showResult('pending', '⏳ Mengambil QR Code...');
      
      try {
        const res = await fetch('/fonnte/qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceToken })
        });
        const data = await res.json();
        
        if (data.success && data.qr) {
          // Show QR modal - Fonnte returns base64 PNG, convert to data URL
          const qrSrc = data.qr.startsWith('data:') ? data.qr : \`data:image/png;base64,\${data.qr}\`;
          const qrHtml = \`
            <div id="qrModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:9999;" onclick="this.remove()">
              <div style="background:white; padding:24px; border-radius:16px; text-align:center; max-width:400px;" onclick="event.stopPropagation()">
                <h3 style="margin-bottom:16px;">📱 Scan QR Code</h3>
                <img src="\${qrSrc}" style="max-width:300px; border-radius:8px;">
                <p style="margin-top:16px; color:#666;">Buka WhatsApp > Linked Devices > Scan QR</p>
                <button class="btn btn-primary" onclick="document.getElementById('qrModal').remove(); checkFonnteStatus();" style="margin-top:16px;">✅ Selesai</button>
              </div>
            </div>
          \`;
          document.body.insertAdjacentHTML('beforeend', qrHtml);
          showResult('success', '📲 Silakan scan QR Code');
        } else {
          showResult('error', '❌ ' + (data.message || 'Gagal mendapatkan QR'));
        }
      } catch (err) {
        showResult('error', '❌ Error: ' + err.message);
      }
    }

    async function checkFonnteStatus() {
      const statusEl = document.getElementById('waStatus');
      const iconEl = document.getElementById('waStatusIcon');
      const textEl = document.getElementById('waStatusText');
      
      statusEl.style.background = '#f1f5f9';
      iconEl.textContent = '⏳';
      textEl.textContent = 'Mengecek status...';
      
      try {
        const res = await fetch('/fonnte/status');
        const data = await res.json();
        
        if (data.success) {
          if (data.status === 'connected') {
            statusEl.style.background = '#dcfce7';
            iconEl.textContent = '🟢';
            textEl.innerHTML = \`<strong>Connected</strong> - \${data.device?.name || ''} (\${data.device?.number || ''})\`;
            updateConnectButton(true);
          } else if (data.status === 'disconnected') {
            statusEl.style.background = '#fee2e2';
            iconEl.textContent = '🔴';
            textEl.textContent = 'Disconnected - ' + (data.message || 'Device tidak terhubung');
            updateConnectButton(false);
          } else {
            statusEl.style.background = '#fef3c7';
            iconEl.textContent = '⚠️';
            textEl.textContent = data.message || 'Status tidak diketahui';
            updateConnectButton(false);
          }
        } else {
          statusEl.style.background = '#fee2e2';
          iconEl.textContent = '❌';
          textEl.textContent = 'Error: ' + data.message;
          updateConnectButton(false);
        }
      } catch (err) {
        statusEl.style.background = '#fee2e2';
        iconEl.textContent = '❌';
        textEl.textContent = 'Error: ' + err.message;
        updateConnectButton(false);
      }
    }

    // Track device connection status
    let isDeviceConnected = false;

    function updateConnectButton(connected) {
      isDeviceConnected = connected;
      const btn = document.getElementById('btnConnectDevice');
      if (btn) {
        if (connected) {
          btn.innerHTML = '🔌 Disconnect';
          btn.className = 'btn btn-danger';
        } else {
          btn.innerHTML = '📲 Connect Device';
          btn.className = 'btn btn-primary';
        }
      }
    }

    async function toggleFonnteDevice() {
      if (isDeviceConnected) {
        // Disconnect device
        if (!confirm('Apakah Anda yakin ingin disconnect WhatsApp device?')) return;
        
        showResult('pending', '⏳ Disconnecting device...');
        
        try {
          // Use server-side disconnect which will get token from KV
          const res = await fetch('/fonnte/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          
          if (data.success) {
            showResult('success', '✅ Device disconnected successfully');
            updateConnectButton(false);
            checkFonnteStatus();
          } else {
            showResult('error', '❌ ' + (data.message || 'Failed to disconnect'));
          }
        } catch (err) {
          showResult('error', '❌ Error: ' + err.message);
        }
      } else {
        // Connect device (show QR)
        await connectFonnteDevice();
      }
    }

    async function sendTestWA() {
      const phone = prompt('Masukkan nomor WhatsApp tujuan (contoh: 08123456789):');
      if (!phone) return;
      
      showResult('pending', '⏳ Mengirim pesan test...');
      
      // Use first active user from the form if any
      const userCards = document.querySelectorAll('.user-card');
      let testUser = { name: 'Test User', nip: '12345' };
      
      if (userCards.length > 0) {
        const nameInput = userCards[0].querySelector('input[name*="_name"]');
        const nipInput = userCards[0].querySelector('input[name*="_nip"]');
        if (nameInput && nipInput) {
          testUser.name = nameInput.value;
          testUser.nip = nipInput.value;
        }
      }
      
      try {
        // For now, just trigger a check-in which will send notification
        showResult('success', '✅ Gunakan tombol 🚀 Check-in untuk test pengiriman WA');
      } catch (err) {
        showResult('error', '❌ Error: ' + err.message);
      }
    }

    // Change Password Function
    async function changePassword() {
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      if (!currentPassword) {
        showResult('error', '❌ Masukkan password saat ini');
        return;
      }
      if (!newPassword || newPassword.length < 6) {
        showResult('error', '❌ Password baru minimal 6 karakter');
        return;
      }
      if (newPassword !== confirmPassword) {
        showResult('error', '❌ Konfirmasi password tidak cocok');
        return;
      }
      
      showResult('pending', '⏳ Mengubah password...');
      
      try {
        const res = await fetch('/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();
        
        if (data.success) {
          showResult('success', '✅ ' + data.message);
          // Clear form
          document.getElementById('currentPassword').value = '';
          document.getElementById('newPassword').value = '';
          document.getElementById('confirmPassword').value = '';
          // Redirect to login after 2 seconds
          setTimeout(() => { window.location.href = '/logout'; }, 2000);
        } else {
          showResult('error', '❌ ' + data.message);
        }
      } catch (err) {
        showResult('error', '❌ Error: ' + err.message);
      }
    }

    // Password Modal Functions
    function showPasswordModal() {
      document.getElementById('passwordModal').style.display = 'flex';
    }

    function hidePasswordModal() {
      document.getElementById('passwordModal').style.display = 'none';
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    }

    // Schedule Modal Functions
    function showScheduleModal() {
      document.getElementById('scheduleModal').style.display = 'flex';
    }

    function hideScheduleModal() {
      document.getElementById('scheduleModal').style.display = 'none';
    }

    function applyScheduleChanges() {
      // Copy values from modal to hidden form inputs
      for (let i = 0; i < 3; i++) {
        const enabled = document.getElementById(\`modal_schedule_\${i}_enabled\`);
        const startHour = document.getElementById(\`modal_schedule_\${i}_startHour\`);
        const startMinute = document.getElementById(\`modal_schedule_\${i}_startMinute\`);
        const endHour = document.getElementById(\`modal_schedule_\${i}_endHour\`);
        const endMinute = document.getElementById(\`modal_schedule_\${i}_endMinute\`);
        const status = document.getElementById(\`modal_schedule_\${i}_status\`);
        
        // Find and update hidden inputs
        const enabledInput = document.querySelector(\`input[name="schedule_\${i}_enabled"]\`);
        const startHourInput = document.querySelector(\`input[name="schedule_\${i}_startHour"]\`);
        const startMinuteInput = document.querySelector(\`input[name="schedule_\${i}_startMinute"]\`);
        const endHourInput = document.querySelector(\`input[name="schedule_\${i}_endHour"]\`);
        const endMinuteInput = document.querySelector(\`input[name="schedule_\${i}_endMinute"]\`);
        const statusInput = document.querySelector(\`input[name="schedule_\${i}_status"]\`);
        
        if (enabledInput) enabledInput.checked = enabled.checked;
        if (startHourInput) startHourInput.value = startHour.value;
        if (startMinuteInput) startMinuteInput.value = startMinute.value;
        if (endHourInput) endHourInput.value = endHour.value;
        if (endMinuteInput) endMinuteInput.value = endMinute.value;
        if (statusInput) statusInput.value = status.value;
      }
      
      hideScheduleModal();
      showResult('success', '✅ Jadwal diperbarui. Klik "Simpan Konfigurasi" untuk menyimpan.');
    }

    // Holiday Modal Functions
    let holidaysData = {};

    async function showHolidayModal() {
      document.getElementById('holidayModal').style.display = 'flex';
      await loadHolidays();
    }

    function hideHolidayModal() {
      document.getElementById('holidayModal').style.display = 'none';
    }

    async function loadHolidays() {
      const container = document.getElementById('holidayList');
      container.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">⏳ Loading...</p>';
      
      try {
        const res = await fetch('/holidays');
        const data = await res.json();
        
        if (data.success) {
          holidaysData = data.holidays;
          renderHolidayList();
        } else {
          container.innerHTML = '<p style="color:red;padding:20px;">❌ ' + data.message + '</p>';
        }
      } catch (err) {
        container.innerHTML = '<p style="color:red;padding:20px;">❌ Error: ' + err.message + '</p>';
      }
    }

    function renderHolidayList() {
      const container = document.getElementById('holidayList');
      const sortedDates = Object.keys(holidaysData).sort();
      
      if (sortedDates.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">Belum ada hari libur yang terdaftar.</p>';
        return;
      }
      
      container.innerHTML = sortedDates.map(date => {
        const name = holidaysData[date];
        const formattedDate = new Date(date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return \`<div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #eee;">
          <div>
            <strong>\${name}</strong><br>
            <small style="color:#666;">\${formattedDate}</small>
          </div>
          <button type="button" class="btn btn-danger btn-sm" onclick="removeHoliday('\${date}')">🗑️</button>
        </div>\`;
      }).join('');
    }

    function addHoliday() {
      const dateInput = document.getElementById('newHolidayDate');
      const nameInput = document.getElementById('newHolidayName');
      
      const date = dateInput.value;
      const name = nameInput.value.trim();
      
      if (!date) {
        alert('Pilih tanggal!');
        return;
      }
      if (!name) {
        alert('Masukkan nama hari libur!');
        return;
      }
      
      holidaysData[date] = name;
      renderHolidayList();
      
      // Clear inputs
      dateInput.value = '';
      nameInput.value = '';
      
      showResult('success', '✅ Hari libur ditambahkan. Klik "Simpan Perubahan" untuk menyimpan.');
    }

    function removeHoliday(date) {
      if (confirm('Hapus hari libur ini?')) {
        delete holidaysData[date];
        renderHolidayList();
        showResult('success', '✅ Hari libur dihapus. Klik "Simpan Perubahan" untuk menyimpan.');
      }
    }

    async function saveHolidays() {
      showResult('pending', '⏳ Menyimpan hari libur...');
      
      try {
        const res = await fetch('/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ holidays: holidaysData })
        });
        const data = await res.json();
        
        if (data.success) {
          showResult('success', '✅ ' + data.message);
          hideHolidayModal();
        } else {
          showResult('error', '❌ ' + data.message);
        }
      } catch (err) {
        showResult('error', '❌ Error: ' + err.message);
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
      newUser.className = 'user-card enabled';
      newUser.dataset.index = userCount;
      newUser.innerHTML = \`
        <input type="hidden" name="user_\${userCount}_name" value="\${name}">
        <input type="hidden" name="user_\${userCount}_nip" value="\${nip}">
        <input type="hidden" name="user_\${userCount}_password" value="\${password}">
        <input type="hidden" name="user_\${userCount}_phone" value="">
        <div class="user-header" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="user-name">\${name}</span>
            <div style="font-size: 12px; color: #666; margin-top: 4px;">NIP: \${nip || '-'} | 📱 -</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn btn-success btn-sm" onclick="checkinUser(\${userCount})" title="Check-in">✓</button>
            <button type="button" class="btn btn-info btn-sm" onclick="editUser(\${userCount})" title="Edit">✏️</button>
            <button type="button" class="btn btn-danger btn-sm" onclick="removeUser(\${userCount})" title="Hapus">🗑️</button>
            <label class="toggle">
              <input type="checkbox" name="user_\${userCount}_enabled" checked>
              <span class="slider"></span>
            </label>
          </div>
        </div>
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

  <!-- Edit Modal -->
  <div id="editModal" class="edit-modal" onclick="hideEditModal()">
    <div class="edit-modal-content" onclick="event.stopPropagation()">
      <div class="edit-modal-header">
        <h3>✏️ Edit User</h3>
        <button class="edit-modal-close" onclick="hideEditModal()">✕</button>
      </div>
      <div class="form-group">
        <label>Nama</label>
        <input type="text" id="editUserName" placeholder="Nama User">
      </div>
      <div class="form-group">
        <label>NIP</label>
        <input type="text" id="editUserNip" placeholder="NIP">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="editUserPassword" placeholder="Password">
      </div>
      <div class="form-group">
        <label>No. WhatsApp</label>
        <input type="text" id="editUserPhone" placeholder="08xxxxxxxxxx">
      </div>
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button type="button" class="btn btn-primary" onclick="saveEditUser()" style="flex: 1;">💾 Simpan</button>
        <button type="button" class="btn btn-danger" onclick="hideEditModal()">Batal</button>
      </div>
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
        message: `Konfigurasi disimpan(${config.users.length} users)`
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
    message: allSuccess ? `✅ Semua check -in ${activeSchedule.name} berhasil!` : `⚠️ Beberapa check -in ${activeSchedule.name} gagal`,
    results: results,
    schedule: activeSchedule.name,
    witaHour: currentHour
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function handleCheckinSingleUser(request, env, corsHeaders) {
  const config = await getConfig(env);
  const { user: requestUser } = await request.json();

  // Cari user di config yang tersimpan untuk mendapatkan phone
  const storedUser = config.users.find(u => u.nip === requestUser.nip);

  // Merge data: gunakan data dari request, tapi tambahkan phone dari stored config
  const user = {
    ...requestUser,
    phone: storedUser?.phone || requestUser.phone || ''
  };

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

// ============================================================================
// Fonnte WhatsApp API Handlers
// ============================================================================

// Get Fonnte config from KV
async function getFonnteConfig(env) {
  try {
    const stored = await env.CHECKIN_KV.get("fonnte_config");
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error getting Fonnte config:", e);
  }
  return {
    accountToken: env.FONNTE_ACCOUNT_TOKEN || "",
    deviceToken: env.FONNTE_TOKEN || "",
    deviceNumber: "",
    deviceName: ""
  };
}

// Save Fonnte config to KV
async function saveFonnteConfig(env, config) {
  await env.CHECKIN_KV.put("fonnte_config", JSON.stringify(config));
}

// Get devices list from Fonnte API
async function handleFonnteGetDevices(env, corsHeaders) {
  try {
    const fonnteConfig = await getFonnteConfig(env);
    const accountToken = fonnteConfig.accountToken || env.FONNTE_ACCOUNT_TOKEN;

    if (!accountToken) {
      return new Response(JSON.stringify({
        success: false,
        message: "Account Token belum diset. Silakan masukkan Account Token di pengaturan."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const response = await fetch("https://api.fonnte.com/get-devices", {
      method: "POST",
      headers: {
        "Authorization": accountToken
      }
    });

    const data = await response.json();
    console.log("Fonnte get-devices response:", JSON.stringify(data));

    if (data.status === true && data.data) {
      return new Response(JSON.stringify({
        success: true,
        devices: data.data,
        currentToken: fonnteConfig.deviceToken ? fonnteConfig.deviceToken.substring(0, 8) + "..." : ""
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: data.reason || "Gagal mengambil daftar device"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    console.error("Error getting Fonnte devices:", error);
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// Get QR code for device connection
async function handleFonnteGetQR(request, env, corsHeaders) {
  try {
    const { deviceToken } = await request.json();
    const fonnteConfig = await getFonnteConfig(env);
    const token = deviceToken || fonnteConfig.deviceToken || env.FONNTE_TOKEN;

    if (!token) {
      return new Response(JSON.stringify({
        success: false,
        message: "Device Token tidak ditemukan"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const response = await fetch("https://api.fonnte.com/qr", {
      method: "POST",
      headers: {
        "Authorization": token
      },
      body: new URLSearchParams({ type: "qr" })
    });

    const data = await response.json();
    console.log("Fonnte QR response:", JSON.stringify(data));

    if (data.status === true && data.url) {
      return new Response(JSON.stringify({
        success: true,
        qr: data.url
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: data.reason || data.detail || "Gagal mendapatkan QR code"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    console.error("Error getting Fonnte QR:", error);
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// Check device connection status
async function handleFonnteStatus(env, corsHeaders) {
  try {
    const fonnteConfig = await getFonnteConfig(env);
    const accountToken = fonnteConfig.accountToken || env.FONNTE_ACCOUNT_TOKEN;

    if (!accountToken) {
      return new Response(JSON.stringify({
        success: true,
        status: "unknown",
        message: "Account Token belum diset"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const response = await fetch("https://api.fonnte.com/get-devices", {
      method: "POST",
      headers: {
        "Authorization": accountToken
      }
    });

    const data = await response.json();

    if (data.status === true && data.data && data.data.length > 0) {
      const device = data.data[0];
      const isConnected = device.status === "connect";

      return new Response(JSON.stringify({
        success: true,
        status: isConnected ? "connected" : "disconnected",
        device: {
          name: device.name,
          number: device.device,
          token: device.token ? device.token.substring(0, 8) + "..." : "",
          package: device.package,
          quota: device.quota,
          expired: device.expired
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({
        success: true,
        status: "disconnected",
        message: "Tidak ada device yang terhubung"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    console.error("Error checking Fonnte status:", error);
    return new Response(JSON.stringify({
      success: false,
      status: "error",
      message: error.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// Save Fonnte configuration (account token, device token)
async function handleFonnteSaveConfig(request, env, corsHeaders) {
  try {
    const { accountToken, deviceToken, deviceNumber, deviceName } = await request.json();

    const fonnteConfig = await getFonnteConfig(env);

    // Update only provided fields
    if (accountToken !== undefined) fonnteConfig.accountToken = accountToken;
    if (deviceToken !== undefined) fonnteConfig.deviceToken = deviceToken;
    if (deviceNumber !== undefined) fonnteConfig.deviceNumber = deviceNumber;
    if (deviceName !== undefined) fonnteConfig.deviceName = deviceName;

    await saveFonnteConfig(env, fonnteConfig);

    return new Response(JSON.stringify({
      success: true,
      message: "Konfigurasi Fonnte berhasil disimpan"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error saving Fonnte config:", error);
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// Disconnect Fonnte device
async function handleFonnteDisconnect(env, corsHeaders) {
  try {
    const fonnteConfig = await getFonnteConfig(env);
    const deviceToken = fonnteConfig.deviceToken || env.FONNTE_TOKEN;

    if (!deviceToken) {
      return new Response(JSON.stringify({
        success: false,
        message: "Device Token tidak ditemukan. Silakan simpan konfigurasi terlebih dahulu."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const response = await fetch("https://api.fonnte.com/disconnect", {
      method: "POST",
      headers: {
        "Authorization": deviceToken
      }
    });

    const data = await response.json();
    console.log("Fonnte disconnect response:", JSON.stringify(data));

    if (data.status === true) {
      return new Response(JSON.stringify({
        success: true,
        message: "Device berhasil di-disconnect"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: data.reason || data.detail || "Gagal disconnect device"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    console.error("Error disconnecting Fonnte:", error);
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// Change dashboard password
async function handleChangePassword(request, env, corsHeaders) {
  try {
    const { currentPassword, newPassword } = await request.json();

    // Verify current password
    const storedPassword = await getAuthPassword(env);
    if (currentPassword !== storedPassword) {
      return new Response(JSON.stringify({
        success: false,
        message: "Password saat ini salah"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      return new Response(JSON.stringify({
        success: false,
        message: "Password baru minimal 6 karakter"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Save new password to KV
    await env.CHECKIN_KV.put("auth_password", newPassword);

    return new Response(JSON.stringify({
      success: true,
      message: "Password berhasil diubah! Silakan login ulang."
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error changing password:", error);
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

async function handleGetLogs(env, corsHeaders) {
  const logs = await getLogs(env);

  const html = `< !DOCTYPE html >
    <html lang="id">
      <head>
        <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Logs - SKEMARAJA Auto Check-in</title>
            <style>
              * {margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font - family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
              min-height: 100vh;
              padding: 20px;
    }
              .container {max - width: 900px; margin: 0 auto; }
              .card {background: white; border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
              h1 {color: white; text-align: center; margin-bottom: 20px; }
              .log-item {padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid; }
              .log-success {background: #f0fdf4; border-color: #22c55e; }
              .log-error {background: #fef2f2; border-color: #ef4444; }
              .log-time {font - size: 12px; color: #666; }
              .log-message {margin - top: 4px; }
              .log-user {font - weight: 600; color: #1e3c72; }
              .back-link {display: inline-block; margin-bottom: 20px; color: white; text-decoration: none; }
              .back-link:hover {text - decoration: underline; }
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
                  * {margin: 0; padding: 0; box-sizing: border-box; }
                  body {
                    font - family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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
                  .form-group {margin - bottom: 20px; }
                  label {display: block; margin-bottom: 8px; font-weight: 600; color: #555; }
                  input {
                    width: 100%;
                  padding: 14px;
                  border: 2px solid #e0e0e0;
                  border-radius: 8px;
                  font-size: 16px;
                  transition: border-color 0.3s;
    }
                  input:focus {outline: none; border-color: #1e3c72; }
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
                  .logo {text - align: center; margin-bottom: 20px; font-size: 48px; }
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

  // Get password from KV (or use default)
  const authPassword = await getAuthPassword(env);

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

// ============================================================================
// Holiday Management Handlers
// ============================================================================
async function handleGetHolidays(env, corsHeaders) {
  try {
    const holidays = await getHolidays(env);
    return new Response(JSON.stringify({
      success: true,
      holidays: holidays
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

async function handleSaveHolidays(request, env, corsHeaders) {
  try {
    const data = await request.json();
    const holidays = data.holidays || {};

    await saveHolidays(env, holidays);

    return new Response(JSON.stringify({
      success: true,
      message: "Hari libur berhasil disimpan!"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
