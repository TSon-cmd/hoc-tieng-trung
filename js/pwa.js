// Chạy như app trên điện thoại: đăng ký service worker (học offline), tải sẵn âm thanh, báo có bản mới.
// Chỉ bật khi app chạy trên HTTPS (bản đưa lên mạng). Bản localhost trên máy tính giữ nguyên như cũ để sửa bài là thấy ngay.
// Địa chỉ bản trên mạng (GitHub Pages), điền sau khi đưa lên lần đầu
export const PUBLIC_URL = 'https://tson-cmd.github.io/hoc-tieng-trung/';

// 127.0.0.1 (không phải localhost) chỉ dùng khi kiểm thử chế độ offline trên máy dev
export const pwaEnabled = () => (location.protocol === 'https:' || location.hostname === '127.0.0.1') && 'serviceWorker' in navigator;

// Đã mở từ biểu tượng trên màn hình chính (không phải tab Safari)
export const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function registerPWA({ onUpdate } = {}) {
  if (!pwaEnabled()) return;
  const reg = await navigator.serviceWorker.register('sw.js');
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) location.reload();
  });
  // Có bản mới đã tải xong và đang chờ: hỏi người dùng thay vì tự tải lại giữa bài học
  const offer = (worker) => onUpdate?.(() => { reloading = true; worker.postMessage('skip-waiting'); });
  if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
    });
  });
  // App trên điện thoại có thể mở nhiều ngày liền: mỗi lần quay lại app thì kiểm tra bản mới
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
  downloadAudio().catch(() => {});
}

let audioList;
async function audioInfo() {
  audioList ??= await fetch('data/offline.json').then((r) => r.json());
  return audioList;
}

// Số file âm thanh đã lưu trong máy / tổng số
export async function audioStatus() {
  if (!pwaEnabled()) return null;
  const { audio, audioCache } = await audioInfo();
  const have = new Set((await (await caches.open(audioCache)).keys()).map((r) => new URL(r.url).pathname));
  const done = audio.filter((u) => have.has(new URL(u, location.href).pathname)).length;
  return { done, total: audio.length };
}

let downloading = null;
// Tải dần các file âm thanh còn thiếu (6 file song song). onProgress({ done, total })
export function downloadAudio(onProgress) {
  if (!pwaEnabled()) return Promise.resolve();
  if (downloading) { downloading.listeners.add(onProgress); return downloading.promise; }
  const listeners = new Set([onProgress]);
  const promise = (async () => {
    const { audio, audioCache } = await audioInfo();
    const cache = await caches.open(audioCache);
    const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    const todo = audio.filter((u) => !have.has(new URL(u, location.href).pathname));
    let done = audio.length - todo.length;
    const report = () => listeners.forEach((f) => f?.({ done, total: audio.length }));
    report();
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const u = todo[i++];
        try {
          await cache.add(u);
          done++;
          if (done % 20 === 0) report();
        } catch { /* mất mạng giữa chừng: lần sau tải tiếp */ }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    report();
  })().finally(() => { downloading = null; });
  downloading = { promise, listeners };
  return promise;
}
