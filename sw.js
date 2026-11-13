// SINH TỰ ĐỘNG bởi Knowledge/scripts/build_pwa.py. Không sửa tay.
// Vỏ app lưu theo phiên bản; âm thanh lưu cache riêng (app tự tải dần). Có mạng hay không đều mở được.
const VERSION = '5ebed924b9';
const APP_CACHE = `app-${VERSION}`;
const AUDIO_CACHE = 'audio-f3fbf30e0b';
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon.png", "css/fonts.css", "css/style.css", "js/audio.js", "js/db.js", "js/drill.js", "js/exercises.js", "js/icons.js", "js/main.js", "js/pinyin.js", "js/pwa.js", "js/quiz.js", "js/shadow.js", "js/srs.js", "js/store.js", "js/sync.js", "js/ui.js", "js/screens/home.js", "js/screens/lesson.js", "js/screens/level.js", "js/screens/pinyin.js", "js/screens/progress.js", "js/screens/session.js", "js/screens/settings.js", "js/screens/words.js", "vendor/ts-fsrs.LICENSE", "vendor/ts-fsrs.mjs", "fonts/OFL.txt", "fonts/inter-latin-400.woff2", "fonts/inter-latin-600.woff2", "fonts/inter-latin-700.woff2", "fonts/inter-latin-ext-400.woff2", "fonts/inter-latin-ext-600.woff2", "fonts/inter-latin-ext-700.woff2", "fonts/inter-vietnamese-400.woff2", "fonts/inter-vietnamese-600.woff2", "fonts/inter-vietnamese-700.woff2", "data/lessons.json", "data/speech.json", "data/syllables.json", "data/words.json", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "data/offline.json"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Trang bấm "Cập nhật" thì bản mới thay bản cũ ngay
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

// Safari phát <audio> bằng các yêu cầu Range: phải trả 206 cắt từ file trong cache, không thì không phát được
async function withRange(req, res) {
  const range = req.headers.get('range');
  if (!range || !res) return res;
  const buf = await res.arrayBuffer();
  const [, a, b] = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = a ? Number(a) : 0;
  const end = b ? Math.min(Number(b), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const isAudio = url.pathname.includes('/audio/');
  e.respondWith((async () => {
    const hit = await caches.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: true });
    if (hit) return isAudio ? withRange(req, hit) : hit;
    const res = await fetch(isAudio ? new Request(req.url) : req);
    if (isAudio && res.ok) {
      const copy = res.clone();
      caches.open(AUDIO_CACHE).then((c) => c.put(req.url, copy));
      return withRange(req, res);
    }
    return res;
  })());
});
