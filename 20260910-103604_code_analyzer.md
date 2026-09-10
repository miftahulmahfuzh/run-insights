# Code Analysis: Media image deduplication (Vercel Blob + `nina_message_images`)

**Type:** Feature Implementation
**Date:** 2026-09-10 10:36 WIB
**Session ID:** 20260910-103604
**Plan:** `MEDIA_DEDUPE_PLAN.md` (4 phase(s))
**Worktree:** `/home/miftah/.worktrees/media-dedupe`, branch `feature/media-dedupe`

---

## User Input

### Original User Request

> implementasikan satu mekanisme (untuk menjaga konsumsi storage di prod tetap minimum dan menjaga section Media tetap tidy) untuk menjaga semua foto yang tersimpan pada Media itu unik. coba lihat saat ini , di Media (production) kita punya 2 image identical, image ini:
> [Image #2 — kartu kedatangan (arrival card), MIFTAHUL MAHFUZH, paspor Y0243071, 16 AGUSTUS 2026, nomor kartu 2608160020321]
>
> bagaimana cara kita melakukan unique filtering ini? membandingkan binary file? you know better

### User-Provided Context

- Section "Media" = grid foto di `/nina/about` (`components/nina/NinaAboutScreen.tsx:320`), feed dari `listNinaMessageImages` (`lib/nina/queries.ts:1712`).
- Satu contoh duplikat nyata di production: kartu kedatangan muncul dua kali.
- Metode (bandingkan binary? hash? dedup perceptual?) **didelegasikan ke perencana** — "you know better". Diputuskan di bawah (Bagian Metode) dan direkam di `## Decisions` indeks rencana.

### User-Provided Files

- `/mnt/c/Users/mahfu/Downloads/arrival_card_2608160020321.jpg.jpeg` (gambar lampiran; nama file lokal, bukan pathname blob)

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Satu mekanisme agar semua foto yang tersimpan pada Media itu **unik** (deduplication, write-time + yang sudah ada) |
| R2 | Konsumsi storage di prod tetap **minimum** (tidak ada bytes duplikat yang tersimpan di Blob) |
| R3 | Section Media tetap **tidy** (foto yang sama tidak muncul dua kali di feed) |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: Foto yang masuk ke koleksi Media (`nina_message_images` → objek Vercel Blob) hari ini tidak pernah dibandingkan kontennya. Upload yang sama dua kali menghasilkan dua objek Blob berbeda (karena `addRandomSuffix: true` menjamin pathname berbeda bahkan untuk bytes identik) dan dua baris original di DB — Media lalu menampilkan foto yang sama dua kali dan Blob menyimpan bytes yang sama dua kali. Perlu: (a) mekanisme write-time yang mendeteksi "bytes/isi ini sudah ada di koleksi user ini" dan menautkan ke yang sudah ada alih-alih menyimpan salinan baru; (b) pembersihan (backfill) atas duplikat yang sudah ada di production hari ini.

**Success Criteria**:

1. Upload/generate/admin-add yang kontennya sudah ada sebagai baris original milik user yang sama TIDAK menyimpan objek Blob baru; baris baru menjadi *reference* (provenance F37 yang sudah ada) ke baris pemilik bytes, sehingga otomatis tersembunyi dari tiga collection read (`isOriginalPhoto`).
2. Duplikat yang SUDAH ada di production (dua grup terukur, lihat Bukti) dideteksi oleh script backfill dan dilebur: baris tetap ada (bubble tidak boleh kosong), `blob_url`/`pathname` loser diarahkan ke keeper, objek Blob loser dihapus dari store setelah dicek referensinya.
3. Media feed (`/nina/about`) tidak lagi menampilkan foto yang sama dua kali untuk user yang sama.
4. Setiap phase meninggalkan tree hijau (build + `npm run test` + `npm run typecheck`).

**Key Considerations**:

- **Browser PUT langsung ke Blob** — server TIDAK pernah melihat bytes upload (`app/api/upload/route.ts:23`, `components/nina/Composer.tsx:307`). Hash write-time untuk jalur upload harus dihitung di klien atas bytes yang persis akan di-PUT.
- **Kompresi JPEG belum tentu deterministik lintas sesi/browser** (`lib/photos/compressForNina.ts` re-encode q0.75; EXIF di-strip). Hash harus dihitung atas **compressed bytes yang akan disimpan** — identik hash ⟺ identik bytes tersimpan. Re-encode yang berbeda bytes = dua objek berbeda yang jujur (bukan duplikat bytes); kasus lintas-format seperti itu bukan scope (dedup perceptual = YAGNI, lihat Keputusan).
- **Klaim klien bukan fakta** (preseden `lib/nina/imageTicket.ts`): hash dari Composer melewati `clientPayload` → masuk `tokenPayload` yang DITANDATANGANI di `/api/upload`, dan server memvalidasi formatnya (64-hex) lagi saat menulis baris. Poisoning hash tetap mungkin oleh user terhadap dirinya sendiri (hash user-scoped) — severity diri-sendiri, diterima (lihat Keputusan).
- **Baris tidak boleh dihapus** ("the row is NOT dropped and must never be" — `lib/db/schema.ts:1118`): peleburan = repoint + reference, bukan DELETE.
- **ROW FIRST, BLOB SECOND** (`lib/nina/blobRelease.ts`): hapus referensi baris dulu, hapus Blob setelah `isBlobPathnameReferenced` bilaman.
- **Reaper** (`scripts/blob-reap.mjs`) menghitung referensi per baris (bukan boolean) — baris repoint yang berbagi pathname dengan keeper aman; tidak ada bentuk pathname baru → `PREFIXES` tidak berubah.
- **Satu database = production** (memori repo): `db:migrate` P1 menulis production; migrasi additif (kolom nullable + partial index) — aman, tapi harus dinyatakan.
- **Bahaya nomor migrasi** (memori repo): cek `origin/main` saat implement — jika 0018 sudah diambil set lain, regenerasi (jangan rename).
- `scripts/nina-image-worker.ts:808` insert dengan raw SQL dan harus diubah serentak dengan sisi drizzle (test bentuknya ada di `tests/nina.imageworker.test.ts:310`).
- Foto tanpa `bytes`/`width`/`height` (mis. `ywNnXvpnnKSi`, NULL semua) sah ada — sweep meng-hash dari Blob langsung, bukan dari metadata.

### Metode (jawaban atas "membandingkan binary file? you know better")

**SHA-256 content hash atas bytes persis yang tersimpan**, bukan perbandingan binary berpasangan dan bukan dedup perceptual:

- **Perbandingan binary berpasangan** adalah O(n²) unduhan dan tidak dapat diindeks — boros untuk kebutuhan yang identik hasilnya dengan hash.
- **Perceptual hash (pHash/aHash)** mendeteksi "mirip secara visual" — untuk lintas-encoding. Di sini single-user, koleksi kecil, sumber duplikatnya adalah *pick file yang sama dua kali* (terukur: bytes-nya identik persis). pHash menambah daerah abu-abu (threshold? canonical encoding?) tanpa kebutuhan nyata. YAGNI.
- **SHA-256** (`crypto.subtle.digest('SHA-256', …)`) tersedia di browser, Node, dan worker script tanpa dependensi; dihitung sekali per objek; disimpan di kolom; pencarian duplikat jadi lookup `(user_id, content_hash)` ber-indeks. Identik hash ⟹ identik bytes (untuk tujuan penyimpanan); dedup di level bytes = dedup di level storage, persis dua tujuan user (R2 storage, R3 tidy).

---

## Analysis Scope

### Explicitly Mentioned Files

- (tidak ada `@file`; konteks = section Media, production, gambar kartu kedatangan)

### Discovered Related Files

**Tabel & schema**
- `lib/db/schema.ts:1056-1156` — `nina_message_images` (kolom: `blob_url` :1098, `pathname` :1100, `bytes/width/height` :1101-1103, provenance `source_avatar_id`/`source_image_id` :1140-1145; TIDAK ada kolom hash)
- `drizzle/` — 18 migrasi, `meta/_journal.json` terakhir `idx 17` = `0017_retire_imageprefs_revision`; **nomor berikutnya 0018**. Precedent kolom provenance: `0010_nina_image_provenance.sql`.

**Read path (Media feed)**
- `lib/nina/queries.ts:1712` `listNinaMessageImages` → feed Media `/nina/about`, filter `isOriginalPhoto()` (`:1777+`, skip baris reference)
- `lib/nina/queries.ts:2073` `isBlobPathnameReferenced` — boolean user-scoped atas `nina_message_images` + `nina_avatars` (pathname ATAU blobUrl)
- `components/nina/NinaAboutScreen.tsx:320` — render grid Media

**Write path A — upload chat (runner, browser PUT)**
1. `components/nina/Composer.tsx:301` `compressForNina(file)` (client re-encode 768px q0.75, JPEG, EXIF strip — `lib/photos/compressForNina.ts:74`)
2. `Composer.tsx:307` `upload(ninaChatPathname(userId, newId()), compressed.file, {handleUploadUrl:'/api/upload', clientPayload})` — mint token lalu browser PUT
3. `app/api/upload/route.ts:87` cabang nina-chat (`isNinaChatRequestPathname`, 900KB, `addRandomSuffix:true`, `allowOverwrite:false`); server tidak pernah menerima bytes
4. `Composer.tsx:322` kumpulkan klaim `{blobUrl, pathname, width, height, bytes}` → `sendNinaMessage`
5. `lib/nina/actions.ts:591` STEP 1b: klaim → `insertNinaMessageImages` (kind `'upload'`)
6. `lib/nina/queries.ts:1581` `insertNinaMessageImages` (satu-satunya insert drizzle; statement `:1595-1621`; validasi FK message owner-scoped; `[]` = gagal)

**Write path B — generated (server-side put)**
1. `lib/nina/imagerun.ts:119` `storeNinaImage` → `put(ninaImagePathname(userId, purpose, newId()), bytes)` (`:128`; server PUNYA bytes)
2. `lib/nina/imagerun.ts:261` `finishSelfie` → insert (kind `'generated'`)
3. `scripts/nina-image-worker.ts:641` `store` + `:808` insert raw SQL (backstop GitHub Actions — lockstep wajib)

**Write path C — admin chat photo (browser PUT, action admin)**
1. `components/admin/chatPhotoUpload.ts:111` `uploadChatPhoto` — re-encode 1024px q0.9 → `upload(adminChatPhotoPathname(userId,newId()), …, {handleUploadUrl:'/api/admin/nina/upload'})` (`:113`)
2. `app/api/admin/nina/upload/route.ts:142` handshake admin (3 bentuk pathname, `:150-155`)
3. `lib/admin/chatPhotoActions.ts:261` `addChatPhotoAction` → insert (+ carrier message `:241`, release saat gagal `:287`)

**Attach/reference (mekanisme F37 yang sudah ada — dedup write-time menaunginya)**
- `lib/nina/actions.ts:143-192` `resolveAttachment` — menyalin `blob_url`+`pathname` ke baris baru (bytes TIDAK disalin), mengisi `source_avatar_id`/`source_image_id`
- `lib/nina/queries.ts:1684` `adoptNinaMessageImage` — adopsi baris orphan
- `lib/nina/attach.ts:221` `ninaPhotoProvenance` — kolom provenance mana yang diisi

**Delete/release**
- `lib/nina/blobRelease.ts:46` `releaseBlobIfUnreferenced` — satu-satunya delete reference-checked (`'deleted'|'shared'|'failed'`)
- `lib/admin/chatPhotoActions.ts:170,287,371`; `lib/nina/albumActions.ts:224` — pemanggil

**Scripts/ops**
- `scripts/blob-reap.mjs` — `--env-file=.env.local`; butuh `DATABASE_URL` + `BLOB_READ_WRITE_TOKEN` (`:106`); list paginated (`:234`); reference set 6 kolom (`:175-202`); orphan = `refCount===0 && uploadedAt<=cutoff` (`:267-272`); dry-run default, `--delete` untuk apply; `PREFIXES` `:92`
- `package.json` — `blob:reap`; pola `node --env-file=.env.local scripts/*.mjs`
- `drizzle.config.ts`, `npm run db:generate|db:migrate|db:check`

**Hash precedents (tidak ada yang untuk konten gambar)**
- `lib/llm/factsHash.ts:48` `createHash('sha256')` atas JSON metrics — preseden cache-key konten
- `lib/id.ts` — entropy-only; `crypto.subtle` belum pernah dipakai di repo (hash klien akan menjadi yang pertama)

---

## Current Dataflow

### Entry Point: upload foto chat (jalur A — yang menghasilkan duplikat terukur)

**Location:** `components/nina/Composer.tsx:301-322`
**Trigger:** user memilih file di composer (`planNinaPicked`, `lib/nina/images.ts:186`), kompresi, upload, lalu kirim pesan
**Input:** `File` dari picker
**Validasi:** type/size di `planNinaPicked`; ceiling 900KB di mint-token; pathname dibatasi `isNinaChatRequestPathname` (owner-bound)
**Next Step:** browser PUT langsung ke Blob → klaim → `sendNinaMessage` → `insertNinaMessageImages`

### Processing Chain (jalur A)

1. **`compressForNina(file)`** — `lib/photos/compressForNina.ts:74`
   - Input `File` → decode → scale 768px → JPEG q0.75 (EXIF strip)
   - Output `{file, width, height, originalBytes, compressedBytes}` — **bytes inilah yang di-PUT**
2. **`upload(requested, compressed.file, …)`** — `Composer.tsx:307`
   - POST `/api/upload` mint token (server lihat pathname+ukuran, bukan bytes) → PUT ke `<store>.public.blob.vercel-storage.com`
   - Blob menambahkan random suffix → pathname tersimpan ≠ yang diminta
3. **`sendNinaMessage(…, klaim gambar)`** — `lib/nina/actions.ts` (STEP 1b `:591`)
   - Re-validasi bentuk pathname tersimpan (`:1237`, `NINA_CHAT_STORED_ID_RE`)
   - Panggil `insertNinaMessageImages` — **TIDAK ADA pembandingan konten di seluruh rantai**

### Data Persistence

**Database:** `nina_message_images` — satu INSERT (`lib/nina/queries.ts:1595`): `id, user_id, message_id, kind, blob_url, pathname, width, height, bytes, description, prompt, source_avatar_id, source_image_id, sort_order, created_at`. Tidak ada kolom hash.
**Blob store:** `<store>.public.blob.vercel-storage.com`, prefix `nina/<userId>/chat|selfie-|avatar-…` (`NINA_BLOB_PREFIX`, `lib/nina/images.ts:60`), `shots/` untuk run screenshot.

### Exit Points

- Feed Media `/nina/about` via `listNinaMessageImages` (originals saja)
- Bubble chat via `getNinaMessageImagesForMessages`; deep link `?photo=image:<id>` via `getNinaMessageImage`
- Konteks Nina (`dbNinaSourceGateway.readMessageWindow/.readConversation`)
- `/admin/photos` via `generatedChatPhotoScope` (`listNinaChatPhotos`, `countNinaChatPhotos`)
- Reaper memutus orphan dari 6 kolom referensi

---

## Key Data Structures

### Table: `nina_message_images`
**Location:** `lib/db/schema.ts:1056`
**Fields:** lihat Persistence di atas; `kind: 'upload' | 'generated'`; provenance `source_avatar_id`/`source_image_id` (NULL = original)
**Used In:** feed Media, bubble render, attach, describe worker, admin collection, reaper, `isBlobPathnameReferenced`

### `NinaImageInsert`
**Location:** `lib/nina/queries.ts:257`
**Fields:** bentuk baris masuk `insertNinaMessageImages`; `sourceAvatarId/sourceImageId` opsional (tidak menyebut = original)

### `CompressedNinaImage`
**Location:** `lib/photos/compressForNina.ts:34`
**Fields:** `{file, width, height, originalBytes, compressedBytes}` — `file` adalah objek yang di-PUT; titik hash klien

### `releaseBlobIfUnreferenced` result
**Location:** `lib/nina/blobRelease.ts:46`
**Values:** `'deleted' | 'shared' | 'failed'` — err toward keep; kontrak "row first, blob second"

---

## Measured Evidence — production, 2026-09-10

23 baris `nina_message_images` di-hash dengan mengunduh setiap blob (GET → sha256). **5 grup identik:**

| sha256 (16c) | Rows | URL blob | Jenis |
|---|---|---|---|
| `427e51e6bbe9cae3` (66.823 B) | `sbTuT8NKXL24` (10 Sep, message `VNu9upqvtK5X`, terdeskripsi) + `ywNnXvpnnKSi` (9 Sep, message NULL, metadata NULL) | **BEDA** | **Duplikat storage sejati — kartu kedatangan yang dilaporkan user.** Dua original, dua objek blob. Media menampilkannya dua kali. |
| `70a49180389861b6` (110.068 B) | `W-hhpnGxV0SI` (7 Sep, original) + `1dMy2Zs5V1MJ` (9 Sep, reference → `W-hhpnGxV0SI`) | **BEDA** | Duplikat storage sejati kedua (generated selfie). Feed sudah menyembunyikan reference-nya (`isOriginalPhoto`), tapi dua objek bytes identik tetap tersimpan. |
| `2358829ba6b306d7` | `kCeZri0edZ0n` (original) + `aTZIezVAGhIU` (reference → kCeZri0edZ0n) | sama | 2 baris → 1 objek; feed benar. |
| `8e8e82a3a8a64583` | `mwMSqf5wxuJc` + `nCo_5r-jFW3I` | sama | 2 baris → 1 objek. |
| `90a9c4652710f777` | `FVOucJSqsoy_` + `KbSXOBNF7GAn` | sama | 2 baris → 1 objek. |

Penyebab pasangan kartu kedatangan: file yang sama di-upload dua kali (9 Sep — pesannya kini hilang, `message_id` NULL via SET NULL, describe tidak pernah jalan; 10 Sep — masuk pesan `VNu9upqvtK5X`). `addRandomSuffix: true` menjamin dua objek berbeda; tidak ada lapisan yang membandingkan konten. Sisa storage terbuang hari ini: ±177 KB dari 2 objek; mekanismenya yang penting, bukan angkanya.

---

## Dependencies

### Configuration / Environment / External Services
- `DATABASE_URL` (.env.local = production; migrasi menulis production)
- `BLOB_READ_WRITE_TOKEN` (`blobEnv()`, `lib/env.ts`; script baca `process.env` langsung)
- Vercel Blob (client-upload handshake + `put`/`del`/`list`)
- Node ≥22 (`--experimental-strip-types` untuk script .ts; `--env-file=.env.local`)

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `ninaMessageImages` | lib/db/schema.ts:1056 | def | lib/db |
| `NinaImageInsert` | lib/nina/queries.ts:257 | def | lib/nina |
| `insertNinaMessageImages` | lib/nina/queries.ts:1581 (stmt :1595) | def | lib/nina |
| `sendNinaMessage` STEP 1b (upload insert) | lib/nina/actions.ts:591 | call | lib/nina |
| `sendNinaMessage` attach arm | lib/nina/actions.ts:658 | call | lib/nina |
| `resolveAttachment` | lib/nina/actions.ts:143 | def | lib/nina |
| pathname re-validation | lib/nina/actions.ts:1237 | call | lib/nina |
| `listNinaMessageImages` (feed Media) | lib/nina/queries.ts:1712 | def | lib/nina |
| `isOriginalPhoto` | lib/nina/queries.ts:1777 | def | lib/nina |
| `isBlobPathnameReferenced` | lib/nina/queries.ts:2073 | def | lib/nina |
| `getNinaMessageImagesForMessages` | lib/nina/queries.ts:1759 | def | lib/nina |
| `compressForNina` | lib/photos/compressForNina.ts:74 | def | lib/photos |
| `upload()` browser PUT (chat) | components/nina/Composer.tsx:307 | call | components/nina |
| `handleUpload` cabang nina-chat | app/api/upload/route.ts:87 | def | app/api |
| `ninaChatPathname` / `NINA_CHAT_STORED_ID_RE` | lib/nina/images.ts:117/:94 | def | lib/nina |
| `NINA_BLOB_PREFIX` (satu definisi, RULING A6) | lib/nina/images.ts:60 | def | lib/nina |
| `storeNinaImage` (put server-side) | lib/nina/imagerun.ts:119 (put :128) | def | lib/nina |
| `finishSelfie` insert | lib/nina/imagerun.ts:261 | call | lib/nina |
| worker `store` + raw SQL insert | scripts/nina-image-worker.ts:641/:808 | def | scripts |
| `uploadChatPhoto` (admin) | components/admin/chatPhotoUpload.ts:111 | def | components/admin |
| admin handshake | app/api/admin/nina/upload/route.ts:142 | def | app/api |
| `addChatPhotoAction` | lib/admin/chatPhotoActions.ts:261 | def | lib/admin |
| `releaseBlobIfUnreferenced` | lib/nina/blobRelease.ts:46 | def | lib/nina |
| `blob-reap.mjs` (refCount, PREFIXES, cutoff) | scripts/blob-reap.mjs:92/:175/:267 | config/test | scripts |
| `factsHash` (preseden sha256) | lib/llm/factsHash.ts:48 | def | lib/llm |
| `imageTicket` (preseden klaim bertanda tangan) | lib/nina/imageTicket.ts:73 | def | lib/nina |
| journal migrasi (terakhir 0017) | drizzle/meta/_journal.json | config | drizzle |
| Media grid render | components/nina/NinaAboutScreen.tsx:320 | doc/ui | components/nina |

### Out of scope (bukan Media — dinyatakan agar tidak ada phase yang menyentuhnya)
- `shots/` + `run_photos` (screenshot run) & `extractions.blob_urls`
- Album `nina_avatars` (wajah album memang dikecualikan dari Media oleh `isOriginalPhoto`), `thumb-*`, `nina-profpic`
- `lib/share/rotateBlobs.ts` (rotasi share), `scripts/capture/*`, dedup perceptual/lintas-encoding

---

## Impact Points (files that WILL need changes)

1. `lib/db/schema.ts` + `drizzle/0018_*.sql` — kolom `content_hash` + partial index; P1
2. `lib/photos/contentHash.ts` (BARU) — util WebCrypto sha-256 hex, murni, lintas runtime; P1
3. `lib/nina/queries.ts` — `NinaImageInsert` + insert pass-through + lookup `findNinaImageByContentHash(userId, hash)`; P1
4. `scripts/nina-image-worker.ts` — raw SQL insert + (bila berlaku) put-hash lockstep + shape test; P1 (kolom) & P3 (perilaku)
5. `components/nina/Composer.tsx` — hash compressed bytes, pre-check sebelum `upload()`, lewatkan hash pada klaim; P2
6. `app/api/upload/route.ts` — cabang nina-chat: validasi hash `clientPayload`, masukkan ke `tokenPayload`; P2
7. `lib/nina/actions.ts` — `sendNinaMessage`: validasi format hash, tulis hash; race-close (duplikat saat insert → baris reference + release blob yang baru mendarat); P2
8. `lib/nina/imagerun.ts` — hash bytes sebelum `put`, skip+reference bila duplikat; P3
9. `components/admin/chatPhotoUpload.ts` + `lib/admin/chatPhotoActions.ts` — hash + pre-check + klaim; P3
10. `scripts/nina-dedupe-media.mjs` (BARU) + `package.json` npm script — backfill hash-fill + peleburan grup duplikat, dry-run default; P4

**This document describes. The plan files prescribe.**
