<!-- Markdown提示/错误等：https://github.com/orgs/community/discussions/16925-->


<div align="center">
<h1>Cloudflare Proxy EX</h1>

[中文](https://github.com/1234567Yang/cf-proxy-ex) [English](https://github-com.translate.goog/1234567Yang/cf-proxy-ex?_x_tr_sl=zh-CN&_x_tr_tl=en&_x_tr_hl=zh-CN&_x_tr_pto=wapp) [Bahasa Indonesia](#)

<br>

<!--[![GitHub license](https://img.shields.io/github/license/1234567Yang/cf-proxy-ex)](https://github.com/ViewFaceCore/ViewFaceCore/blob/main/LICENSE) &nbsp;&nbsp;-->

![GitHub stars](https://img.shields.io/github/stars/1234567Yang/cf-proxy-ex?style=flat)
[![Github Release](https://img.shields.io/github/v/release/1234567Yang/cf-proxy-ex)](https://github.com/1234567Yang/cf-proxy-ex/releases/latest)
![GitHub forks](https://img.shields.io/github/forks/1234567Yang/cf-proxy-ex)

[💻 Demo Online](#demo-online) &nbsp;| [⚒ Cara Penggunaan](#cara-penggunaan) &nbsp;| [🚀 Mulai Cepat](#mulai-cepat) &nbsp;| [🔒 Kata Sandi Keamanan](#kata-sandi-keamanan) &nbsp;| [📸 Screenshot](#screenshot) &nbsp;| [📦 LICENSE](#license) &nbsp;| [📄 Catatan](#catatan) &nbsp;| [👍 Terima Kasih](#terima-kasih) &nbsp;| [⭐ Star History](#star-history)


Proxy super Cloudflare, proxy OpenAI/ChatGPT, akselerasi Github, proxy online. Sekarang sudah mendukung deployment multi-platform (karena mengganti nama menjadi worker-proxy-ex terlalu merepotkan, jadi tetap menggunakan nama asli).
<br>
<!--本项目可以让你通过一个**不同**的链接打开**相同**的网站，目前支持100%加载Github，Duckduckgo，Stackoverflow等网站，并且和打开原网站毫无差别。和其它开源代理以及hide.me在线代理相比，本项目可以加载更多静态资源、实现Cookie作用域管理、提交表单、相对URL转绝对URL，转跳自动补全网址等强大的功能。-->
<!--本项目是一款基于Cloudflare worker的在线代理。目前支持100%加载Github，Duckduckgo，Stackoverflow等网站，并且和打开原网站毫无差别。和其它开源代理以及hide.me在线代理相比，本项目可以加载更多静态资源、实现Cookie作用域管理、提交表单、相对URL转绝对URL，转跳自动补全网址等强大的功能。-->

</div>


# Demo Online

### Halaman Utama
https://y.demo.lhyang.org/
### Duckduckgo Chat
https://y.demo.lhyang.org/https://duckduckgo.com/?t=h_&q=hi&ia=chat
### Google Maps
https://y.demo.lhyang.org/https://www.google.com/maps
### Website Alternatif:
https://shengtai.edu.pastapexamsdownload.space/
Password adalah `maga2028`

# Cara Penggunaan
* Silakan deploy terlebih dahulu sesuai [Mulai Cepat](#mulai-cepat)
* Tambahkan `https://domain-anda/` di depan URL apa pun <br>Contoh: `https://domain-anda/https://github.com`
* [Tips Penggunaan](https://github.com/1234567Yang/cf-proxy-ex/blob/main/usage_tips.md)


# Mulai Cepat

* [Deploy di Deno](https://github.com/1234567Yang/cf-proxy-ex/blob/main/deploy_on_deno_tutorial.md)
* [Deploy di Cloudflare](https://github.com/1234567Yang/cf-proxy-ex/blob/main/deploy_on_cf_tutorial.md)

> [!WARNING]
> Saya sangat menyarankan untuk mengaktifkan [Kata Sandi Keamanan](#kata-sandi-keamanan), tidak hanya untuk mencegah pemindaian (tebak berapa banyak yang saya temukan), tetapi juga untuk mencegah crawler website mengambil konten.<br>
> Selain itu, saat mengatur subdomain, jangan gunakan format seperti `proxy.example.com`, karena saat TLS handshake (akan mengirim SNI secara plaintext), sangat mudah dikenali sebagai layanan proxy. Disarankan untuk menggunakan subdomain yang terlihat lebih konvensional, tidak memiliki makna spesifik, seperti `cdn.example.com` atau `img.example.com`, untuk mengurangi risiko terdeteksi.

Mendapatkan domain kustom (opsional):

* Pembelian domain: https://porkbun.com/  https://domain.com/<br >Saat membeli, Anda bisa menekan `Ctrl + F`, cari `$0.` 

# Kata Sandi Keamanan
Kata sandi keamanan menggunakan Cookie. Jika kata sandi diatur, sistem akan memeriksa terlebih dahulu apakah ada cookie kata sandi dan apakah benar. Jika tidak benar, dapat menampilkan halaman input kata sandi, atau langsung mengembalikan 403. Nama cookie kata sandi default adalah `passwordCookieName`. Untuk mengatur kata sandi, cari `const password = "";` di kode dan ganti dengan kata sandi Anda.
Untuk tutorial lebih detail, silakan [klik di sini](https://github.com/1234567Yang/cf-proxy-ex/blob/main/security_password_tutorial.md).

# Screenshot
![Duckduckgo](img/duckduckgo.jpg)
![BaiDu](img/baidu.jpg)
![Github](img/github.jpg)
![Stackoverflow](img/stackoverflow.jpg)

# LICENSE
MIT License + beberapa kondisi<br>
* Semua situs proxy yang dibuat menggunakan proyek ini harus mencantumkan link open source ini.
* Dilarang menggunakan proyek ini untuk tujuan komersial, termasuk proyek yang berbasis pada proyek ini.

# Catatan
* **Proyek ini hanya untuk mempelajari prinsip dan cara implementasi proxy online, dilarang keras digunakan untuk aktivitas ilegal!**
* Jangan login ke situs web apa pun melalui proxy online. Meskipun proyek ini sudah membatasi scope Cookie, yang berarti secara teori memungkinkan, sangat tidak disarankan. Seperti proxy versi asli proyek ini, Cookie-nya bersifat global. Artinya jika Anda (melalui proxy) login ke Github lalu mengunjungi situs jahat, semua Cookie Anda akan dicuri.
* Karena penulis menyadari kelemahan proxy online, memutuskan untuk ~~membuka jalur baru, menjelajahi lautan biru baru, terus membentuk momentum pengembangan baru, secara aktif melaksanakan transformasi momentum lama dan baru, melalui integrasi horizontal rantai industri untuk mencapai serangan dimensi rendah...~~ menulis cf-proxy mode klien, idenya mirip dengan Tor. ~~Sedang dikembangkan aktif~~ Status saat ini baik.

# Terima Kasih

> [!NOTE]  
> Karena jumlahnya banyak, saya hanya bisa memilih beberapa yang representatif untuk disebutkan di sini, ~~tentu saja Anda juga bisa meminta saya untuk menambahkan Anda~~. Jika Anda muncul di sini dan ingin dihapus, silakan submit Issue (saya akan menghapus nama, kemudian menghapus Issue juga).

* Terima kasih kepada @04041b yang menemukan beberapa BUG dan memberi tahu saya ide proxy online ini.
* Proyek ini didasarkan pada [cloudflare-reverse-proxy oleh gaboolic](https://github.com/gaboolic/cloudflare-reverse-proxy/), terima kasih kepada gaboolic yang memberikan ide implementasi deployment di Cloudflare.
* Terima kasih kepada semua teman yang submit issue dan PR untuk membantu meningkatkan proyek ini.
* Terima kasih kepada @brightu yang berbagi cara menambahkan Cookie yang sangat praktis, detailnya lihat https://github.com/1234567Yang/cf-proxy-ex/issues/15 .
* Terima kasih kepada @since114514 yang berpartisipasi dalam eksperimen kecil saya: berhasil menemukan komentar dari worker.js, detailnya lihat https://github.com/1234567Yang/cf-proxy-ex/issues/31 .
* Terima kasih kepada @fangyuan99 yang memberi tahu bahwa proyek ini sebenarnya juga bisa di-deploy di Deno, detailnya lihat https://github.com/1234567Yang/cf-proxy-ex/issues/33 .
* Terima kasih kepada @Tayasui-rainnya untuk UI yang diberikan (belum diterapkan)
<!--* ~~Terima kasih banyak kepada administrator sekolah yang sangat memikirkan masa depan saya, yang memblokir banyak situs web normal, jika tidak proyek ini tidak akan ada. Selain itu, terima kasih banyak kepada administrator sekolah adalah alasan (salah satunya) proyek ini ada, memungkinkan saya untuk menuliskannya di College App~~-->

# Star History
[![Star History Chart](https://api.star-history.com/svg?repos=1234567Yang/cf-proxy-ex&type=Date)](https://star-history.com/#1234567Yang/cf-proxy-ex&Date)
