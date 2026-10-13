# Portal Kampus Fiktif (Latihan Keamanan Web)

Aplikasi SENGAJA RENTAN untuk latihan. Seluruh akun & data sintetis.

## Jalankan lokal
    npm start
Buka http://localhost:3000

## Akun demo
admin/admin123 | dosen1/dosen123 | mhs1/mhs123 | mhs2/mhs123 | mhs3/mhs123

## Kerentanan sengaja (2)
1. Stored XSS  - Diskusi (/discussion), komentar tampil tanpa escape.
2. IDOR        - Nilai (/grades?student_id=ID), tidak ada cek kepemilikan.

## Deploy Render
Build Command: npm install | Start Command: npm start
