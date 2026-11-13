import { init, reload } from './store.js';
import { registerPWA } from './pwa.js';
import { startAutoSync } from './sync.js';
import * as home from './screens/home.js';
import * as session from './screens/session.js';
import * as pinyin from './screens/pinyin.js';
import * as words from './screens/words.js';
import * as settings from './screens/settings.js';
import * as lesson from './screens/lesson.js';
import * as level from './screens/level.js';
import * as progress from './screens/progress.js';

const ROUTES = { '': home, session, pinyin, words, settings, lesson, level, progress };
let cleanup = null;

function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const screen = ROUTES[path] ?? home;
  cleanup?.();
  // Thay phần tử gốc để bỏ hết event listener của màn trước
  const old = document.getElementById('app');
  const root = old.cloneNode(false);
  old.replaceWith(root);
  // Bài học, từ vựng, kiểm tra trình độ mở từ trang Học nên sáng tab Học
  const tab = ['lesson', 'words', 'level'].includes(path) ? '' : path;
  document.querySelectorAll('.topbar nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${tab}`));
  document.body.dataset.screen = path || 'home';
  cleanup = screen.render(root, new URLSearchParams(query)) ?? null;
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(html, ms = 6000) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = Object.assign(document.createElement('div'), { className: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

async function start() {
  try {
    await init();
  } catch (err) {
    document.getElementById('app').innerHTML = `<p class="warn">Không tải được dữ liệu: ${err.message}.<br>Hãy mở app bằng file <b>start.bat</b> (không mở trực tiếp index.html).</p>`;
    return;
  }
  if ('speechSynthesis' in window) speechSynthesis.getVoices(); // nạp sẵn giọng đọc
  window.addEventListener('tts-unavailable', () => toast(
    'Máy chưa có giọng đọc tiếng Trung nên chưa đọc được câu ví dụ. Từ vựng vẫn nghe bình thường. Xem hướng dẫn ở <a href="#/settings">Cài đặt</a>.'));
  window.addEventListener('hashchange', route);
  route();

  registerPWA({
    onUpdate: (apply) => {
      toast('Có bản cập nhật mới của app. <button class="btn sm" data-update>Cập nhật</button>', 0);
      document.querySelector('[data-update]').addEventListener('click', apply, { once: true });
    },
  }).catch(() => {});

  // Nhận tiến độ từ máy kia: nạp lại dữ liệu; đang ở màn xem (không phải giữa bài học / phiên ôn) thì vẽ lại luôn
  startAutoSync({
    onRemoteChange: async () => {
      await reload();
      const screen = document.body.dataset.screen;
      if (!['lesson', 'session', 'level'].includes(screen)) route();
      toast('Đã đồng bộ tiến độ từ máy khác.');
    },
  });
}

start();
