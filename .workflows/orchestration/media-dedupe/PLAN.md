# Plan: Media image deduplication (content-hash, Vercel Blob)

**Slug:** media-dedupe
**Date:** 2026-09-10 10:36 WIB
**Analysis:** `20260910-103604_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/media-dedupe`
**Branch:** `feature/media-dedupe` (base: `origin/main` @ `ac9cf03`)
**Phases:** 4
**Status:** phases 1, 2, 4 complete — 3 in flight
**Coordinator:** orch-media-dedupe

<The Coordinator line is the peer address of the session driving this set, filled in by
`/analyze-orchestrator` when it takes the set over. Leave it `—`.>

## Why

> "implementasikan satu mekanisme (untuk menjaga konsumsi storage di prod tetap minimum dan
> menjaga section Media tetap tidy) untuk menjaga semua foto yang tersimpan pada Media itu unik.
> coba lihat saat ini, di Media (production) kita punya 2 image identical, image ini: [kartu
> kedatangan 2608160020321]. bagaimana cara kita melakukan unique filtering ini? membandingkan
> binary file? you know better"

Terukur di production (2026-09-10): 23 baris, **5 grup hash-identik** — 2 di antaranya dua OBJEK
blob dengan bytes identik (pasangan kartu kedatangan `sbTuT8NKXL24`+`ywNnXvpnnKSi`, dan
`W-hhpnGxV0SI`+`1dMy2Zs5V1MJ`). Penyebab: tidak ada lapisan mana pun yang membandingkan konten,
dan `addRandomSuffix: true` menjamin bytes identik tetap jadi dua objek.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Satu mekanisme agar semua foto di Media **unik** (write-time + backfill yang sudah ada) | 1, 2, 3, 4 |
| R2 | Konsumsi storage prod tetap **minimum** (tidak ada bytes duplikat tersimpan) | 2, 3, 4 |
| R3 | Section Media tetap **tidy** (foto sama tidak muncul dua kali di feed) | 2, 4 |

## Scope

**In scope:** `nina_message_images` (kedua kind: `upload` + `generated`) dan objek Blob di prefix
`nina/<userId>/chat/…` dan `nina/<userId>/selfie-…`. Tiga jalur tulis: upload chat runner
(browser PUT), generated server-side, admin chat photo. Kolom `content_hash` (sha256 hex atas
bytes persis yang disimpan), lookup ber-indeks, dedup write-time (skip upload → jadi *reference*
F37 + race-close), script backfill hash-fill + peleburan grup duplikat existing.

**Out of scope:** `shots/` + `run_photos` + `extractions.blob_urls` (screenshot run, bukan Media);
album `nina_avatars` + `thumb-*` + profpic (memang dikecualikan dari Media oleh
`isOriginalPhoto`); `lib/share/rotateBlobs.ts`; dedup perceptual / lintas-encoding (YAGNI —
lihat Keputusan); perubahan pada keempat read yang tidak boleh memfilter
(`getNinaMessageImagesForMessages`, `getNinaMessageImage`, source gateway,
`isBlobPathnameReferenced`).

## Invariants

1. Tree hijau di akhir tiap phase: `npm run build`, `npm run typecheck`, `npm run test`.
2. **Baris tidak pernah DELETE.** Peleburan = repoint `blob_url`/`pathname` ke keeper + isi
   `source_image_id`, biar `isOriginalPhoto()` menyembunyikannya dari collection read.
3. **ROW FIRST, BLOB SECOND** — setiap release blob setelah baris tidak lagi menunjuknya, dan
   hanya bila `isBlobPathnameReferenced` (atau ekuivalen script-nya) bilaman.
4. Hash = **sha256 hex atas bytes persis yang tersimpan/di-PUT** (bukan file sumber, bukan
   perceptual). Satu kolom, satu semantik: identik hash ⟹ identik bytes di store.
5. Dedup **user-scoped**: kunci `(user_id, content_hash)`; tidak pernah menautkan bytes antar
   user.
6. Collection reads & render reads tidak berubah perilaku selain lewat provenance yang sudah
   ada; empat read di "Out of scope" tetap tidak boleh memfilter.
7. Migrasi additif (kolom nullable + partial index). Saat implement: cek `origin/main` — bila
   0018 sudah diambil set lain, **regenerasi** (jangan rename).
8. `scripts/nina-image-worker.ts` (raw SQL) berubah serentak dengan sisi drizzle yang sama.
9. Klaim hash klien selalu format-divalidasi server (64-hex) dan user-scoped; gagal validasi =
   tulis NULL (dedup tidak aktif untuk baris itu), bukan error kirim.
10. Script backfill: **dry-run default**, `--apply` untuk menulis; idempoten (re-run = no-op).

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Foundation: `content_hash` kolom, util hash, plumbing data | R1 | `lib/db`, `lib/photos`, `lib/nina` | 8 | — | NORMAL | `.workflows/plan/media-dedupe/phase-1.md` | P1-DB-A006 | — |
| 2 ✅ | Write-time dedup: jalur upload chat runner | R1, R2, R3 | `components/nina`, `lib/nina` | 6 | 1 | HARD | `.workflows/plan/media-dedupe/phase-2.md` | P1-CN-A004 | — |
| 3 | Write-time dedup: jalur generated + admin | R1, R2 | `lib/nina`, `lib/admin`, `scripts` | 15 | 1 | HARD | `.workflows/plan/media-dedupe/phase-3.md` | P1-NIN-A033 | — |
| 4 ✅ | Backfill sweep: hash-fill + peleburan duplikat existing | R1, R2, R3 | `scripts` | 4 | 1 | NORMAL | `.workflows/plan/media-dedupe/phase-4.md` | P1-SC-A001 | — |

**Dua aturan keeper, disengaja — jangan disatukan.** Write-time attach (P2/P3) memakai aturan
`findNinaImageByContentHash` (P1): original TERBARU dengan hash itu, karena baris terbaru paling
kecil kemungkinannya sudah terhapus saat write berikutnya mendarat. Sweep merge (P4) memilih
keeper-nya sendiri: `message_id NOT NULL > description NOT NULL > oldest created_at > id` —
pertanyaan lain ("baris mana yang MEMILIKI bytes yang sudah ditunjuk beberapa baris") di waktu
lain. Keduanya benar; tidak ada phase yang berhak "menyeragamkan" aturan phase lain.

### Phase 1 — Foundation: `content_hash` kolom, util hash, plumbing data
**Satisfies:** R1
**Owns:** migrasi `0018` (kolom `content_hash text` nullable + partial index
`(user_id, content_hash) WHERE content_hash IS NOT NULL` di `nina_message_images`); modul murni
BARU `lib/photos/contentHash.ts` (WebCrypto `crypto.subtle` sha-256 → hex; berlaku di browser,
Node ≥22, dan script); `NinaImageInsert` + `insertNinaMessageImages` menerima `contentHash`
opsional (pass-through, belum ada pemanggil yang mengirim); lookup baru
`findNinaImageByContentHash(userId, hash)` di `lib/nina/queries.ts`; pass-through kolom di
insert raw-SQL `scripts/nina-image-worker.ts` (+ shape test). Tanpa perubahan perilaku.
**Does not touch:** Composer, actions.ts, imagerun, admin, blob store, npm scripts.
**Exit criteria:** migrasi apply bersih di production (additif), `db:check` hijau, util hash
teruji unit (bytes nyata, vektor known-answer), insert menerima & mengabaikan hash tanpa
pemanggil baru, worker insert raw SQL menulis kolom bila diberi.

### Phase 2 — Write-time dedup: jalur upload chat runner
**Satisfies:** R1, R2, R3
**Owns:** `Composer.tsx` — hash `compressed.file` (bytes yang akan di-PUT) via util P1; pre-check
server (action owner-scoped baru di `actions.ts` memakai finder P1) SEBELUM `upload()`; bila
duplikat → jangan mint token/jangan PUT, tile beralih memakai foto existing sebagai attachment
reference (seam `?photo=image:<id>` / `resolveAttachment` yang sudah ada — bukan insert arm
baru); bila tidak → klaim hash ikut `sendNinaMessage`, format-divalidasi (64-hex) lalu ditulis.
**Race-close** di STEP 1b: saat insert, bila original lain dengan hash sama sudah ada → baris
baru ditulis sebagai REFERENCE (copy `blob_url`/`pathname` keeper + `source_image_id`) dan blob
yang baru mendarat di-release (`releaseBlobIfUnreferenced`, row-first-blob-second).
**Does not touch:** `/api/upload` (hash menumpang kelas klaim yang sama dengan
`bytes`/`width`/`height` — bukan token), imagerun, admin, script, schema.
**Exit criteria:** pick file sama dua kali (bug repro) → hanya satu objek blob baru; yang kedua
menjadi reference tersembunyi dari Media; dua send balapan → tetap satu objek + satu original;
Media feed tidak menampilkan bytes sama dua kali; test unit untuk keputusan skip + race-close.

### Phase 3 — Write-time dedup: jalur generated + admin
**Satisfies:** R1, R2
**Owns:** `lib/nina/imagerun.ts` — `storeNinaImage` hash bytes sebelum `put`; bila original
(user, hash) sudah ada → skip `put`, insert baris sebagai reference ke existing; lockstep
perilaku yang sama di `scripts/nina-image-worker.ts` (raw SQL, + test). `lib/admin/`:
`chatPhotoUpload.ts` hash blob hasil encode; pre-check sebelum `upload()`; klaim hash →
`addChatPhotoAction` validasi + tulis; race/dupe di admin mengikuti aturan invariant 2-3.
**Does not touch:** Composer, actions.ts STEP 1b (punya P2), schema, `/api/*/upload` routes.
**Exit criteria:** generate/admin-add yang bytes-nya sudah ada tidak menciptakan objek blob baru;
worker script perilakunya setara; test untuk kedua jalur.

### Phase 4 — Backfill sweep: hash-fill + peleburan duplikat existing
**Satisfies:** R1, R2, R3
**Owns:** script BARU `scripts/nina-dedupe-media.mjs` (+ npm script `nina:dedupe-media`, pola
`blob-reap.mjs`: `--env-file=.env.local`, createRequire, dry-run default, `--apply`): pass 1
hash-fill semua baris original (GET blob → sha256 → UPDATE kolom P1; skip+lapor bila GET
gagal); pass 2 grup per `(user_id, content_hash)` di antara ORIGINAL → elect keeper
(message_id NOT NULL > description NOT NULL > oldest created_at > id) → loser: repoint
`blob_url`/`pathname` ke keeper + `source_image_id = keeper.id` (baris reference → hilang dari
Media) → release blob loser hanya bila refCount-nya 0. Juga menyatukan baris reference yang
memegang URL berbeda dari keeper-nya (kasus `1dMy2Zs5V1MJ`). Idempoten.
**Does not touch:** kode aplikasi, schema, keempat jalur write (mereka tuntas di P2-P3).
**Exit criteria:** dry-run melaporkan persis 2 grup objek-duplikat terukur (kartu kedatangan +
selfie `70a49180…`); setelah `--apply`: dua objek loser terhapus dari store, baris tetap ada,
Media menampilkan tiap foto tepat sekali; re-run berikutnya = 0 perubahan.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| Nama util hash: P1 mengekspor `contentHashOf(Blob\|ArrayBuffer\|Uint8Array)`; P2 berasumsi `sha256Hex(ArrayBuffer\|Uint8Array)`; test P4 mengimpor `contentHash` | 1, 2, 4 | SATU nama bertahan: `contentHashOf` + `isValidContentHash` persis seperti kontrak P1. P2 ditulis ulang (`contentHashOf(compressed.file)` — Blob diterima langsung, tanpa hop `arrayBuffer()`), test P4 diubah ke `contentHashOf` (panggilan `Uint8Array`-nya valid apa adanya). Kendala zero-import P1 terverifikasi terjaga: P3 mengimpornya relative-path untuk worker, P2 dari sisi client, skrip P4 TIDAK mengimpornya (hash `node:crypto` miliknya sendiri; hanya test yang mengimpor P1 untuk asersi lintas-implementasi) |
| Pemilik validasi invariant-9: P1 memaksa koersi di `insertNinaMessageImages`; P2 memvalidasi klaim di `actions.ts` | 1, 2 | SATU pemilik normatif: pintu insert P1 (koersi ke NULL). Pengecekan P2 ditata ulang sebagai DECISION read (`normalizeClaimedContentHash` memutuskan "bolehkah lookup keeper dijalankan"), tidak pernah melebar-manahkan apa yang diterima kolom — trim sebelum predikat yang sama hanya bisa mengubah klaim valid-ber-wrap whitespace menjadi valid, tidak pernah sebaliknya. Wording diselaraskan di kedua plan |
| Baris reference & `content_hash`: P2 menulis baris reference TANPA hash; P4 pass 1 mengisi SEMUA baris (reference termasuk) | 2, 4 | Koeksisten dengan catatan timah di KEDUA plan: baris reference tanpa hash buatan P2 adalah NULL yang DIHARAPKAN — fill pass P4 mengisinya seperti baris historis lain, tidak pernah drift, dan bukan alasan "memperbaiki" P2. Fill-guard P4 terverifikasi menangani baris baru P2 (`contentHash == null` → GET → hash → `verifiedHash` terisi, bukan `hash-repair`) |
| (Temuan reconciler) P3 menulis hash PADA baris reference-nya (`planNinaImageWrite`); P2 tidak — fork semantik untuk jenis baris yang sama | 2, 3 | Aturan per-path direkam di Decisions: baris reference membawa hash hanya bila penulisnya SENDIRI mengukur bytes (server P3 ya; klaim client P2 tidak). Cross-reference ditulis ke doc kedua modul agar tidak ada sesi yang "menyeragamkan"; invariant 4 tetap benar di kedua jalur |
| `lib/nina/queries.ts` diubah P1 (5 hunk: :221/:257/:603/:1595-1621/after :1774) dan P3 (`updateNinaChatPhotoBlob`) | 1, 3 | Hunk berbeda dan disjoint; urutan eksplisit di kedua plan (P1 dulu, P3 membangun di atas file pasca-P1; kutipan P3 valid di kedua keadaan karena P1 tidak menyentuh fungsi itu). Anchor P3 yang basi `~:918-962` dikoreksi ke `~:1926-2000` (diverifikasi ke tree) |
| `scripts/nina-image-worker.ts`: P1 menambah pass-through kolom di raw INSERT; P3 MENG GANTI INSERT itu (WorkerStoredImage + `source_image_id`) | 1, 3 | INSERT P1 dinyatakan sebagai FASE-1 LANDING STATE di plan P1 (Step 7c + note 5); P3 menggantikannya sambil mempertahankan dua properti P1 (hash ter-bind sebagai parameter, satu statement shape). Test P1 terverifikasi survive: kasus NULL bertahan lewat fixture P3 (`contentHash: null`), kasus hash terisi bertahan lewat bind plan + re-check P3 yang fallback ke no-match di bawah default `sqlResolving` file itu |
| Modul keputusan duplikat: P2 membuat `lib/nina/dedupe.ts`; P3 membuat `lib/nina/imageDedupe.ts` dan menawarkannya untuk STEP 1b | 2, 3 | TIGA modul, TIGA pekerjaan — unifikasi ditolak dan ditulis di kedua plan: `dedupe.ts` (jalur upload, client-safe, batch/same-send aware), `imageDedupe.ts` (dua host generated, zero-import untuk worker), `planChatPhotoAddWrite` (admin). SATU jawaban untuk STEP 1b, ditulis ke P2: memanggil `partitionNinaUploadClaims` + `ninaUploadInsertRow`, BUKAN `planNinaImageWrite`. Klaim P2 "phase 3 akan reuse modul ini" dan tawaran P3 "reconciler should unify" keduanya dihapus |
| Semantik keeper election: finder P1 = original terbaru; sweep P4 = `message_id > description > oldest > id` | 1, 2, 4 | Dua aturan dipertahankan — operasi berbeda di waktu berbeda (write-time attach vs sweep merge); tidak ada plan yang mengklaim aturan yang lain. Kalimat penjelas ditambahkan ke indeks (di bawah tabel phase) dan ke doc `compareKeeperCandidates` P4 |
| P4 vs partial index P1: P4 menyatakan tidak butuh index | 1, 4 | Terverifikasi tidak ada masalah: doc kolom+index P1 menjustifikasi index oleh lookup write-time (P2/P3), bukan oleh sweep; P4 menegaskan skrip memuat semua baris dan mengelompokkan di JS. Tanpa edit |
| (Temuan reconciler) Impact point 6 analisis memprediksi perubahan `app/api/upload/route.ts` (hash masuk `tokenPayload`); tidak ada phase yang memilikinya | 2 | Superseded oleh keputusan yang sudah tererekam di scope phase-2 indeks dan kontrak P2 ("DECIDED, do not reopen"): hash menumpang kelas klaim `bytes`/`width`/`height` lewat `sendNinaMessage.contentHashes`, route tidak berubah. Kebutuhan di balik impact point (server memvalidasi format klaim sebelum menulis) tetap dimiliki — P2 di `actions.ts` + pintu insert P1. Direkam di Decisions |
| (Temuan reconciler) Angka acceptance P4 Step 5 (`hash filled 23`) order-dependent terhadap P2/P3 yang berjalan konkuren | 4 | Caveat ditambahkan ke Step 5: fill count dan row count bergantung urutan; FINDINGS (2 grup terukur, keeper/loser, 3 tidy) adalah properti snapshot analisis dan menjadi kunci aturan STOP — bukan fill count |
| (Temuan reconciler) Handoff P1 sebelumnya mengundang phase 2 menempel hash pada baris reference race-close — kontradiksi dengan keputusan terkunci P2 | 1, 2 | Handoff P1 ditulis ulang: baris reference race-close P2 membawa TANPA `content_hash`; non-unique index mengizinkan kedua ejaan, finder memfilter ke originals baik cara apa pun |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Metode unique filtering (user mendelegasikan: "membandingkan binary file? you know better") | **SHA-256 content hash atas bytes persis yang disimpan**; bukan perbandingan binary berpasangan (O(n²), tak terindeks, hasil identik), bukan perceptual hash (lintas-encoding; single-user, sumber duplikat terukur = pick file yang sama; YAGNI) | 5: user raw input mendelegasikan metode; dipilih atas tujuan R2+R3 |
| Hash bytes hasil kompresi vs file sumber | Bytes yang akan di-PUT — identik hash ⟺ identik bytes tersimpan; satu kolom melayani write-time DAN sweep (file sumber tidak tersedia di prod untuk backfill) | 3: kode — sweep hanya bisa meng-hash blob |
| Dedup per-user vs global store | Per-user (`user_id`, `content_hash`) — ownership & delete tetap user-scoped; global menggabungkan nasib blob antar user | 3: kode — `isBlobPathnameReferenced` user-scoped |
| Duplikat terdeteksi saat write → baris baru dihapus vs jadi reference | Jadi reference (mekanisme F37 existing: copy URL + `source_image_id`), bukan DELETE baris — bubble tidak boleh kosong; blob yang lebihke di-release | 4: indeks Why/schema — "the row is NOT dropped and must never be" |
| Pre-check sebelum upload vs cek setelah mendarat saja | Keduanya: pre-check (skip PUT — hemat bytes + round trip, tujuan R2) dan race-close saat insert (jendela balapan dua tab) | 5: user raw input — "konsumsi storage minimum" |
| Hash dari klien tanpa signature (poisoning diri-sendiri) | Diterima: hash user-scoped, format-divalidasi, menumpang kelas klaim `bytes`/`width`/`height` yang sudah tidak bertanda tangan; worst case user merusak dedup dirinya sendiri | 3: kode — kepercayaan klaim existing di `sendNinaMessage` |
| Duplikat lintas-encoding (foto sama, bytes beda) | Di luar scope: bytes berbeda = dua objek berbeda yang jujur; perceptual hash menambah threshold tanpa kebutuhan terukur | 6: konvensi — YAGNI |
| **(reconciler)** Nama util hash lintas phase: `contentHashOf` (P1) vs `sha256Hex` (draf P2) vs `contentHash` (draf P4) | `contentHashOf(input: Blob \| ArrayBuffer \| Uint8Array): Promise<string>` + `isValidContentHash` — bentuk P1, satu-satunya yang diekspor; P2/P4 ditulis ulang kepadanya. `sha256Hex` yang tersisa adalah helper `node:crypto` milik skrip P4 sendiri, bukan ekspor P1 | 4: reconciler — phase lanjan mengutip kontrak phase dasar yang sudah landed; bentuk P1 (menerima Blob) adalah yang kedua consumer butuhkan |
| **(reconciler)** Apa yang STEP 1b panggil untuk race-close: `partitionNinaUploadClaims` (P2) vs `planNinaImageWrite` (P3) | `partitionNinaUploadClaims` + `ninaUploadInsertRow` — modul P2, satu-satunya. `planNinaImageWrite` hanya melayani dua host generated | 6: blok kode kedua plan — baris P2 memodelkan `kind`/preferensi deskripsi/`sortOrder`/same-send twins yang tak ada di plan P3, dan modul P2 harus client-safe sementara modul P3 wajib zero-import |
| **(reconciler)** Tiga modul keputusan dedup:merge jadi satu atau pisah? | Pisah: `lib/nina/dedupe.ts` (upload, client-safe) · `lib/nina/imageDedupe.ts` (generated × 2 host, zero-import) · `planChatPhotoAddWrite` (admin). Tidak ada modul keempat | 6: blok kode + kendala import worker (zero-import) dan composer (client-safe) — penggabungan mana pun melanggar salah satunya |
| **(reconciler)** Hash pada baris REFERENCE: P3 menulis, P2 tidak | Per-path: baris reference membawa `content_hash` hanya bila penulisnya mengukur bytes sendiri (server P3 — ya; klaim client P2 — tidak). NULL yang dihasilkan P2 diisi pass 1 P4 | 4: kriteria exit phase + semantik tunggal invariant 4 (klaim hanya disimpan di baris yang write-nya memegang bytes); P4 terverifikasi mengisi, bukan menandai drift |
| **(reconciler)** Keeper election: original terbaru (finder P1) vs `message_id > description > oldest > id` (sweep P4) | Keduanya dipertahankan, tidak disatukan — write-time attach dan sweep merge adalah pertanyaan berbeda; lihat catatan di bawah tabel phase | 4: rasional masing-masing plan (P1: terbaru paling kecil kemungkinan terhapus antara read dan write; P4: bubble tidak boleh kosong + prose already paid) |
| **(reconciler)** Transport hash jalur upload: `tokenPayload` `/api/upload` (duga analisis) vs klaim `sendNinaMessage` | Klaim `contentHashes` di `sendNinaMessage` (keyed by stored pathname) — `/api/upload` tidak berubah, hash kelas yang sama dengan `bytes`/`width`/`height`, tidak ditandatangani | 5: Why/Requirements indeks + kontrak fase-2 yang dinyatakan ("DECIDED, do not reopen"); impact point 6 analisis superseded — kebutuhannya (validasi format server-side) tetap dipenuhi P2 + pintu insert P1 |
| **(coordinator)** P4 `--apply` vs aturan STOP: snapshot analisis (2 grup objek-duplikat) ≠ production live (grup selfie `W-hhpnGxV0SI`/`1dMy2Zs5V1MJ` sudah self-resolve oleh aktor di luar plan; 26 baris ≠ 23; 3 baris generated baru) | P4 benar berhenti dan menulis apa pun tanpa `--apply`. Di Step 5 koordinator jalankan **dry-run segar** di branch tip: `--apply` hanya bila temuan segar persis grup kartu kedatangan yang masih cocok (keeper `sbTuT8NKXL24` / loser `ywNnXvpnnKSi` — keluhan asli user); dump tabel affected dulu ke `logs/`; re-run dry-run setelahnya wajib 0 perubahan (bukti idempoten); verifikasi baris repoint + blob loser terhapus via query. Mismatch lain apa pun = tanpa `--apply`, dilaporkan di termination block | Rung 2+3 dengan prinsip premis-terfalsifikasi-tidak-mengikat: exit criteria P4 terikat snapshot yang production live sudah sanggah; kebutuhan di baliknya (R2/R3 atas bytes duplikat yang NYATA ada) tetap berlaku; aturan Step-5 — destructive work yang direncanakan dieksekusi, bukan diparkir, dengan dump + audit trail + bukti idempotence |

## Open Questions

(none)

## Rollback

- **P1:** kolom nullable + index additif — aman ditinggal; revert commit + `DROP INDEX`/`DROP COLUMN` bila mau bersih.
- **P2/P3:** revert commit masing-masing; tidak ada perubahan data permanen (baris reference yang tercipta tetap sah oleh mekanisme F37 yang sudah ada).
- **P4:** dry-run default; `--apply` mencetak setiap UPDATE/DELETE yang dilakukan (jejak audit). Peleburan salah: keeper/loser tertukar diperbaiki dengan UPDATE ulang (baris tak pernah hilang); blob loser yang sudah terhapus butuh re-upload manual — itulah sebabnya release hanya bila refCount 0 dan dry-run wajib dibaca dulu.
- **Keseluruhan:** branch `feature/media-dedupe` tidak di-merge; production hanya tersentuh oleh migrasi additif P1 dan `--apply` P4 (keduanya independen dan bisa ditinggal/di-skip tanpa merusak tree).

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f MEDIA_DEDUPE_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f MEDIA_DEDUPE_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan MEDIA_DEDUPE_PLAN.md
