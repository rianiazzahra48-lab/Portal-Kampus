// PORTAL KAMPUS FIKTIF - APLIKASI LATIHAN KEAMANAN WEB (SENGAJA RENTAN)
// Tanpa dependensi eksternal. Seluruh akun & data bersifat sintetis.
// Kerentanan yang sengaja dibuat:
//   1) Stored XSS            -> fitur Diskusi (POST /discussion, tampil di GET /discussion)
//   2) IDOR / kontrol akses lemah -> halaman Nilai (GET /grades?student_id=...)
const http = require('http');
const crypto = require('crypto');
const qs = require('querystring');
const PORT = process.env.PORT || 3000;

// ---------- DATA SINTETIS (ubah nama/NIM supaya unik, tidak sama dengan teman) ----------
let nextId = 100;
const users = [
  { id: 1, username: 'admin', password: 'admin123', role: 'admin', name: 'Admin Portal Kelabu' },
  { id: 2, username: 'dosen1', password: 'dosen123', role: 'dosen', name: 'Dr. Wirabuana Sentanu' },
  { id: 3, username: 'mhs1', password: 'mhs123', role: 'mahasiswa', name: 'Kirana Ayuwidya', nim: 'FKT-26001' },
  { id: 4, username: 'mhs2', password: 'mhs123', role: 'mahasiswa', name: 'Bayu Tarumanegara', nim: 'FKT-26002' },
  { id: 5, username: 'mhs3', password: 'mhs123', role: 'mahasiswa', name: 'Sekar Lintangsari', nim: 'FKT-26003' },
];
const courses = [
  { id: 1, name: 'Algoritma Nusantara' },
  { id: 2, name: 'Basis Data Terapan' },
];
const grades = [
  { studentId: 3, courseId: 1, score: 88 }, { studentId: 3, courseId: 2, score: 79 },
  { studentId: 4, courseId: 1, score: 72 }, { studentId: 4, courseId: 2, score: 91 },
  { studentId: 5, courseId: 1, score: 65 }, { studentId: 5, courseId: 2, score: 84 },
];
const assignments = [
  { id: 1, courseId: 1, title: 'Tugas 1 - Analisis Kompleksitas' },
  { id: 2, courseId: 2, title: 'Tugas 1 - Desain ERD' },
];
const submissions = [];
const posts = [
  { id: 1, courseId: 1, userId: 2, text: 'Selamat datang di forum Algoritma Nusantara.', at: new Date().toISOString() },
];
const sessions = {}; // sid -> userId

// ---------- HELPER ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = (id) => users.find((u) => u.id === Number(id));
const courseName = (id) => (courses.find((c) => c.id === Number(id)) || {}).name || '-';

function getCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(qs.parse(d)));
  });
}
function send(res, code, html, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(html);
}
const redirect = (res, to, headers = {}) => { res.writeHead(302, { Location: to, ...headers }); res.end(); };

function layout(user, title, body) {
  const nav = [];
  if (user) {
    nav.push('<a href="/dashboard">Beranda</a>');
    if (user.role === 'mahasiswa') nav.push(`<a href="/grades?student_id=${user.id}">Nilai</a>`, '<a href="/assignments">Tugas</a>');
    if (user.role === 'dosen') nav.push('<a href="/lecturer">Penilaian</a>');
    if (user.role === 'admin') nav.push('<a href="/admin">Kelola Akun</a>');
    nav.push('<a href="/discussion?course=1">Diskusi</a>', '<a href="/logout">Keluar</a>');
  }
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - Portal Kampus Fiktif</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#f3f4f8;color:#222}
header{background:#4f46e5;color:#fff;padding:14px 24px}
header b{font-size:18px} nav{margin-top:6px} nav a{color:#fff;margin-right:16px;text-decoration:none;font-size:14px}
main{max-width:860px;margin:24px auto;padding:0 16px}
.card{background:#fff;border-radius:10px;padding:18px;margin-bottom:16px;box-shadow:0 1px 3px #0002}
table{width:100%;border-collapse:collapse} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:14px}
input,select,textarea{padding:8px;margin:4px 0;width:100%;box-sizing:border-box;border:1px solid #bbb;border-radius:6px}
button{background:#4f46e5;color:#fff;border:0;padding:9px 16px;border-radius:6px;cursor:pointer}
.warn{background:#fff7ed;border-left:4px solid #f97316;padding:10px;font-size:13px;margin-bottom:16px}
.post{border-bottom:1px solid #eee;padding:8px 0} small{color:#666}
</style></head><body>
<header><b>Portal Kampus Fiktif</b> <small style="color:#ddd">(aplikasi latihan - sengaja rentan)</small><nav>${nav.join('')}</nav></header>
<main><div class="warn">Aplikasi latihan keamanan. Seluruh akun dan data bersifat sintetis. Jangan isi data pribadi/asli.</div>${body}</main></body></html>`;
}

// ---------- SERVER ----------
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const sid = getCookies(req).sid;
  const user = sessions[sid] ? byId(sessions[sid]) : null;
  const needLogin = () => { redirect(res, '/login'); };

  try {
    if (path === '/' ) return redirect(res, user ? '/dashboard' : '/login');

    // ----- LOGIN / LOGOUT -----
    if (path === '/login' && req.method === 'GET') {
      return send(res, 200, layout(null, 'Masuk', `<div class="card"><h2>Masuk</h2>
<form method="POST" action="/login">
<label>Username</label><input name="username" required>
<label>Password</label><input name="password" type="password" required>
<button>Masuk</button></form>
<p><small>Akun demo: admin/admin123 &middot; dosen1/dosen123 &middot; mhs1/mhs123 &middot; mhs2/mhs123 &middot; mhs3/mhs123</small></p></div>`));
    }
    if (path === '/login' && req.method === 'POST') {
      const b = await readBody(req);
      const u = users.find((x) => x.username === b.username && x.password === b.password);
      if (!u) return send(res, 401, layout(null, 'Masuk', '<div class="card">Username atau password salah. <a href="/login">Coba lagi</a></div>'));
      const id = crypto.randomBytes(16).toString('hex');
      sessions[id] = u.id;
      return redirect(res, '/dashboard', { 'Set-Cookie': `sid=${id}; HttpOnly; Path=/` });
    }
    if (path === '/logout') {
      delete sessions[sid];
      return redirect(res, '/login', { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' });
    }

    if (!user) return needLogin();

    // ----- DASHBOARD -----
    if (path === '/dashboard') {
      return send(res, 200, layout(user, 'Beranda', `<div class="card"><h2>Halo, ${esc(user.name)}</h2><p>Peran: <b>${esc(user.role)}</b></p>
<p>Gunakan menu di atas untuk mengakses fitur sesuai peran Anda.</p></div>`));
    }

    // ----- NILAI (mahasiswa) -- KERENTANAN IDOR -----
    if (path === '/grades') {
      // SENGAJA RENTAN (IDOR): student_id diambil dari URL tanpa memeriksa apakah
      // pengguna yang login berhak melihat nilai tersebut.
      const sid2 = url.searchParams.get('student_id') || user.id;
      const target = byId(sid2);
      if (!target) return send(res, 404, layout(user, 'Nilai', '<div class="card">Mahasiswa tidak ditemukan.</div>'));
      const rows = grades.filter((g) => g.studentId === target.id)
        .map((g) => `<tr><td>${esc(courseName(g.courseId))}</td><td>${g.score}</td></tr>`).join('');
      return send(res, 200, layout(user, 'Nilai', `<div class="card"><h2>Nilai: ${esc(target.name)}</h2><p><small>NIM: ${esc(target.nim || '-')}</small></p>
<table><tr><th>Mata Kuliah</th><th>Nilai</th></tr>${rows || '<tr><td colspan="2">Belum ada nilai</td></tr>'}</table></div>`));
    }

    // ----- TUGAS (mahasiswa) -----
    if (path === '/assignments' && user.role === 'mahasiswa') {
      if (req.method === 'POST') {
        const b = await readBody(req);
        submissions.push({ id: nextId++, studentId: user.id, assignmentId: Number(b.assignment_id), filename: String(b.filename || 'tugas.txt').slice(0, 80), content: String(b.content || '').slice(0, 5000), at: new Date().toISOString() });
        return redirect(res, '/assignments');
      }
      const opts = assignments.map((a) => `<option value="${a.id}">${esc(a.title)} (${esc(courseName(a.courseId))})</option>`).join('');
      const mine = submissions.filter((s) => s.studentId === user.id)
        .map((s) => `<tr><td>${esc(s.filename)}</td><td>${esc((assignments.find((a) => a.id === s.assignmentId) || {}).title)}</td><td>${esc(s.at)}</td></tr>`).join('');
      return send(res, 200, layout(user, 'Tugas', `<div class="card"><h2>Unggah Tugas</h2>
<form method="POST" action="/assignments">
<label>Tugas</label><select name="assignment_id">${opts}</select>
<label>Nama berkas</label><input name="filename" value="tugas1.txt">
<label>Isi berkas (teks)</label><textarea name="content" rows="5" required></textarea>
<button>Unggah</button></form></div>
<div class="card"><h3>Tugas yang sudah diunggah</h3><table><tr><th>Berkas</th><th>Tugas</th><th>Waktu</th></tr>${mine || '<tr><td colspan="3">Belum ada</td></tr>'}</table></div>`));
    }

    // ----- DISKUSI -- KERENTANAN STORED XSS -----
    if (path === '/discussion') {
      if (req.method === 'POST') {
        const b = await readBody(req);
        posts.push({ id: nextId++, courseId: Number(b.course), userId: user.id, text: String(b.text || ''), at: new Date().toISOString() });
        return redirect(res, `/discussion?course=${Number(b.course)}`);
      }
      const cid = Number(url.searchParams.get('course') || 1);
      const tabs = courses.map((c) => `<a href="/discussion?course=${c.id}">${esc(c.name)}</a>`).join(' | ');
      // SENGAJA RENTAN (Stored XSS): p.text ditampilkan TANPA di-escape.
      const list = posts.filter((p) => p.courseId === cid)
        .map((p) => `<div class="post"><b>${esc((byId(p.userId) || {}).name)}</b> <small>${esc(p.at)}</small><div>${p.text}</div></div>`).join('');
      return send(res, 200, layout(user, 'Diskusi', `<div class="card"><h2>Diskusi: ${esc(courseName(cid))}</h2><p>${tabs}</p>${list || '<p>Belum ada diskusi.</p>'}</div>
<div class="card"><form method="POST" action="/discussion"><input type="hidden" name="course" value="${cid}">
<label>Tulis komentar</label><textarea name="text" rows="3" required></textarea><button>Kirim</button></form></div>`));
    }

    // ----- DOSEN -----
    if (path === '/lecturer' && user.role === 'dosen') {
      if (req.method === 'POST') {
        const b = await readBody(req);
        const sId = Number(b.student_id), cId = Number(b.course_id), score = Math.max(0, Math.min(100, Number(b.score)));
        const g = grades.find((x) => x.studentId === sId && x.courseId === cId);
        if (g) g.score = score; else grades.push({ studentId: sId, courseId: cId, score });
        return redirect(res, '/lecturer');
      }
      const studs = users.filter((u) => u.role === 'mahasiswa');
      const sOpt = studs.map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.nim)})</option>`).join('');
      const cOpt = courses.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
      const rows = grades.map((g) => `<tr><td>${esc((byId(g.studentId) || {}).name)}</td><td>${esc(courseName(g.courseId))}</td><td>${g.score}</td></tr>`).join('');
      const subs = submissions.map((s) => `<tr><td>${esc((byId(s.studentId) || {}).name)}</td><td>${esc(s.filename)}</td><td>${esc(s.content.slice(0, 80))}</td></tr>`).join('');
      return send(res, 200, layout(user, 'Penilaian', `<div class="card"><h2>Beri Nilai</h2><form method="POST" action="/lecturer">
<label>Mahasiswa</label><select name="student_id">${sOpt}</select>
<label>Mata kuliah</label><select name="course_id">${cOpt}</select>
<label>Nilai (0-100)</label><input name="score" type="number" min="0" max="100" required><button>Simpan</button></form></div>
<div class="card"><h3>Daftar Nilai</h3><table><tr><th>Mahasiswa</th><th>Mata Kuliah</th><th>Nilai</th></tr>${rows}</table></div>
<div class="card"><h3>Tugas Masuk</h3><table><tr><th>Mahasiswa</th><th>Berkas</th><th>Cuplikan</th></tr>${subs || '<tr><td colspan="3">Belum ada</td></tr>'}</table></div>`));
    }

    // ----- ADMIN -----
    if (path === '/admin' && user.role === 'admin') {
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (b.action === 'create' && b.username && b.password && ['mahasiswa', 'dosen', 'admin'].includes(b.role)) {
          if (!users.find((u) => u.username === b.username)) users.push({ id: nextId++, username: b.username, password: b.password, role: b.role, name: b.name || b.username, nim: b.role === 'mahasiswa' ? 'FKT-' + nextId : undefined });
        } else if (b.action === 'delete') {
          const i = users.findIndex((u) => u.id === Number(b.id));
          if (i >= 0 && users[i].id !== user.id) users.splice(i, 1);
        }
        return redirect(res, '/admin');
      }
      const rows = users.map((u) => `<tr><td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.name)}</td><td>${esc(u.role)}</td><td>
<form method="POST" action="/admin" style="margin:0"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="${u.id}"><button>Hapus</button></form></td></tr>`).join('');
      return send(res, 200, layout(user, 'Kelola Akun', `<div class="card"><h2>Tambah Akun</h2><form method="POST" action="/admin"><input type="hidden" name="action" value="create">
<label>Username</label><input name="username" required><label>Password</label><input name="password" required>
<label>Nama</label><input name="name"><label>Peran</label><select name="role"><option>mahasiswa</option><option>dosen</option><option>admin</option></select>
<button>Tambah</button></form></div>
<div class="card"><h3>Daftar Akun</h3><table><tr><th>ID</th><th>Username</th><th>Nama</th><th>Peran</th><th></th></tr>${rows}</table></div>`));
    }

    return send(res, 404, layout(user, '404', '<div class="card">Halaman tidak ditemukan atau akses ditolak.</div>'));
  } catch (e) {
    console.error(e);
    send(res, 500, 'Terjadi kesalahan server.');
  }
}).listen(PORT, () => console.log(`Portal kampus fiktif berjalan di http://localhost:${PORT}`));
