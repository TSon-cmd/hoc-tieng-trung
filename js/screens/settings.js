import { state, settings, setMeta, reload, dayKey } from '../store.js';
import * as db from '../db.js';
import { zhVoice, speak } from '../audio.js';
import { syncConfig, connect, disconnect, syncNow, TOKEN_URL } from '../sync.js';
import { pwaEnabled, standalone, isIOS, audioStatus, downloadAudio, PUBLIC_URL } from '../pwa.js';
import { esc } from '../ui.js';

const BACKUP_FORMAT = 'hoc-tieng-trung-backup';

export function render(root) {
  const cfg = settings();
  const voice = zhVoice();
  const last = state.meta.lastBackup ? new Date(state.meta.lastBackup).toLocaleString('vi-VN') : 'chưa có';

  root.innerHTML = `
    <section class="settings-page">
      <h1>Cài đặt</h1>

      <h3>Chữ hiển thị</h3>
      <label class="field">Hiển thị bài học, bài tập và thẻ ôn bằng
        <select name="script" data-text>
          <option value="pinyin" ${cfg.script !== 'hanzi' ? 'selected' : ''}>Pinyin (học giao tiếp)</option>
          <option value="hanzi" ${cfg.script === 'hanzi' ? 'selected' : ''}>Chữ Hán</option>
        </select>
      </label>
      <p class="muted small">Chế độ Pinyin: lời giảng ngữ pháp viết bằng pinyin; từ, ví dụ và mẫu câu lấy pinyin làm chữ chính, chữ Hán nhỏ bên dưới.</p>

      <h3>Ôn tập hằng ngày</h3>
      <label class="field">Số câu luyện thanh điệu mỗi phiên
        <select name="pinyinPerSession">${[5, 10, 15, 20].map((n) => `<option ${n === cfg.pinyinPerSession ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>

      <h3>Sao lưu dữ liệu</h3>
      <p class="muted">Tiến độ chỉ lưu trên trình duyệt này. Xóa dữ liệu trình duyệt là mất, nên hãy sao lưu thường xuyên.
        Lần sao lưu gần nhất: <b>${last}</b>.</p>
      <div class="row">
        <button class="btn primary" data-action="export">Tải file sao lưu</button>
        <label class="btn">Khôi phục từ file<input type="file" accept="application/json,.json" hidden data-action="import"></label>
      </div>
      <p class="status" aria-live="polite"></p>

      <h3>Đồng bộ máy tính ↔ điện thoại</h3>
      <div class="sync-box"></div>

      <h3>Dùng trên điện thoại</h3>
      <div class="pwa-box"></div>

      <h3>Phát âm</h3>
      <p class="muted">Từ vựng và âm tiết dùng bản thu giọng người. Câu ví dụ dùng giọng đọc của trình duyệt:
        <b class="voice-name">${voice ? voice.name : 'chưa tìm thấy giọng tiếng Trung (zh-CN)'}</b>.</p>
      <button class="btn" data-action="test-voice">Thử giọng đọc</button>
      <details class="help">
        <summary>Cách cài giọng tiếng Trung trên Windows</summary>
        <ol>
          <li>Mở <b>Settings → Time &amp; Language → Speech</b>.</li>
          <li>Ở mục <b>Manage voices</b>, bấm <b>Add voices</b>, chọn <b>Chinese (Simplified, China)</b>.</li>
          <li>Cài xong thì khởi động lại trình duyệt.</li>
        </ol>
        <p class="muted">Hoặc mở app bằng Chrome/Edge: hai trình duyệt này có sẵn giọng tiếng Trung qua mạng. Lưu ý: đổi trình duyệt thì tiến độ không đi theo, cần sao lưu rồi khôi phục.</p>
      </details>

      <h3>Nguồn dữ liệu</h3>
      <ul class="credits">
        <li>Từ điển: <a href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict" target="_blank" rel="noopener">CC-CEDICT</a> (CC BY-SA 4.0)</li>
        <li>Danh sách HSK 3.0: <a href="https://github.com/drkameleon/complete-hsk-vocabulary" target="_blank" rel="noopener">complete-hsk-vocabulary</a> (MIT)</li>
        <li>Âm thanh: <a href="https://github.com/hugolpz/audio-cmn" target="_blank" rel="noopener">audio-cmn</a>, giọng Chen Wang và Yue Tan (CC BY-SA)</li>
        <li>Lịch ôn tập: <a href="https://github.com/open-spaced-repetition/ts-fsrs" target="_blank" rel="noopener">ts-fsrs</a> (MIT)</li>
      </ul>
    </section>`;

  const status = root.querySelector('.status');
  const syncBox = root.querySelector('.sync-box');
  const pwaBox = root.querySelector('.pwa-box');
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }) : 'chưa');

  function renderSync(msg = '') {
    const cfg = syncConfig();
    syncBox.innerHTML = cfg ? `
      <div class="panel">
        <p>✓ Đang đồng bộ qua GitHub <b>@${esc(cfg.login)}</b>. Lần gần nhất: <b>${fmt(cfg.lastSync)}</b>.</p>
        <p class="muted small">Tự đồng bộ khi mở app, sau khi học và khi rời app. Học ở máy nào cũng được, tiến độ được gộp lại, không ghi đè.</p>
        ${cfg.error ? `<p class="warn">${esc(cfg.error)}</p>` : ''}
        <div class="row">
          <button class="btn primary" data-action="sync-now">Đồng bộ ngay</button>
          <button class="btn" data-action="sync-off">Tắt trên máy này</button>
        </div>
        <p class="sync-msg muted small" aria-live="polite">${esc(msg)}</p>
      </div>` : `
      <div class="panel">
        <p>Bật đồng bộ để học trên cả máy tính và điện thoại mà tiến độ vẫn khớp nhau. Tiến độ được lưu trong một Gist bí mật trên tài khoản GitHub của anh.</p>
        <ol class="steps-list">
          <li>Đăng nhập GitHub rồi mở <a href="${TOKEN_URL}" target="_blank" rel="noopener">trang tạo mã truy cập</a>.
            Ô <b>Expiration</b> chọn <b>No expiration</b>, kéo xuống cuối bấm <b>Generate token</b>. Mã này chỉ có quyền <b>gist</b>.</li>
          <li>Chép mã (bắt đầu bằng <code>ghp_</code>), dán vào ô dưới, bấm <b>Kết nối</b>.</li>
          <li>Làm lại trên máy kia (tạo thêm một mã khác cũng được). Máy kết nối sau sẽ nhận và gộp tiến độ của máy trước.</li>
        </ol>
        <div class="row token-row">
          <input class="input" type="password" autocomplete="off" spellcheck="false" placeholder="ghp_…" aria-label="Mã truy cập GitHub">
          <button class="btn primary" data-action="sync-connect">Kết nối</button>
        </div>
        <p class="sync-msg muted small" aria-live="polite">${esc(msg)}</p>
      </div>`;
  }

  async function renderPWA() {
    if (!pwaEnabled()) {
      pwaBox.innerHTML = `<div class="panel"><p class="muted">Bản đang mở là bản chạy trên máy tính (${esc(location.host)}).
        ${PUBLIC_URL ? `Trên điện thoại, mở <a href="${PUBLIC_URL}" target="_blank" rel="noopener">${esc(PUBLIC_URL)}</a> bằng Safari rồi làm theo hướng dẫn trong mục này.` : 'Bản trên mạng (để cài lên điện thoại) chưa được đưa lên.'}</p></div>`;
      return;
    }
    const st = await audioStatus().catch(() => null);
    const full = st && st.done >= st.total;
    pwaBox.innerHTML = `
      <div class="panel">
        ${standalone() ? '<p>✓ Đang chạy như app trên màn hình chính.</p>' : isIOS() ? `
          <p><b>Cài ra màn hình chính</b> (để mở như app và học được khi không có mạng):</p>
          <ol class="steps-list">
            <li>Mở trang này bằng <b>Safari</b>.</li>
            <li>Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên) ở thanh dưới.</li>
            <li>Chọn <b>Thêm vào MH chính</b> (Add to Home Screen) → <b>Thêm</b>.</li>
          </ol>
          <p class="muted small">Cài rồi thì luôn mở app bằng biểu tượng 学 trên màn hình chính: tiến độ trong app cài và trong tab Safari là hai bộ riêng.</p>`
        : '<p>Có thể cài app: trên Chrome bấm biểu tượng cài đặt ở thanh địa chỉ, hoặc menu ⋮ → <b>Cài đặt ứng dụng</b>.</p>'}
        <p>Âm thanh để học offline: <b class="audio-count">${st ? `${st.done}/${st.total}` : '…'}</b> file ${full ? '✓' : ''}</p>
        ${full ? '' : '<button class="btn" data-action="audio-dl">Tải hết âm thanh về máy (~15 MB)</button>'}
      </div>`;
  }
  renderSync();
  renderPWA();

  // Chrome nạp danh sách giọng đọc bất đồng bộ
  if (!voice && 'speechSynthesis' in window) {
    speechSynthesis.addEventListener('voiceschanged', () => {
      const v = zhVoice();
      if (v) root.querySelector('.voice-name').textContent = v.name;
    }, { once: true });
  }

  root.addEventListener('change', async (e) => {
    const sel = e.target.closest('select');
    if (sel) {
      await setMeta('settings', { ...settings(), [sel.name]: 'text' in sel.dataset ? sel.value : Number(sel.value) });
      status.textContent = 'Đã lưu cài đặt.';
    }
    if (e.target.dataset.action === 'import') await importFile(e.target.files[0]);
  });

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'export') await exportFile();
    if (a === 'test-voice') speak('你好，很高兴认识你。');
    if (a === 'sync-connect') {
      const token = root.querySelector('.token-row input').value;
      if (!token.trim()) return;
      e.target.disabled = true;
      root.querySelector('.sync-msg').textContent = 'Đang kết nối…';
      try {
        const { changedLocal } = await connect(token);
        if (changedLocal) await reload();
        renderSync(changedLocal ? 'Đã kết nối và nhận tiến độ từ máy khác.' : 'Đã kết nối. Tiến độ trên máy này đã được lưu lên GitHub.');
      } catch (err) {
        e.target.disabled = false;
        root.querySelector('.sync-msg').textContent = `Không kết nối được: ${err.message}`;
      }
    }
    if (a === 'sync-now') {
      e.target.disabled = true;
      try {
        const { changedLocal } = await syncNow();
        if (changedLocal) await reload();
        renderSync(changedLocal ? 'Đã nhận thêm tiến độ từ máy khác.' : 'Đã đồng bộ, hai máy đang khớp nhau.');
      } catch (err) { renderSync(`Lỗi: ${err.message}`); }
    }
    if (a === 'sync-off' && confirm('Tắt đồng bộ trên máy này? Tiến độ trong máy và bản trên GitHub vẫn giữ nguyên.')) {
      disconnect();
      renderSync('Đã tắt đồng bộ trên máy này.');
    }
    if (a === 'audio-dl') {
      e.target.disabled = true;
      e.target.textContent = 'Đang tải…';
      await downloadAudio(({ done, total }) => { root.querySelector('.audio-count').textContent = `${done}/${total}`; });
      renderPWA();
    }
  });

  async function exportFile() {
    const data = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), ...(await db.exportAll()) };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: `hoc-tieng-trung-${dayKey()}.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    await setMeta('lastBackup', new Date().toISOString());
    status.textContent = `Đã tải file sao lưu (${state.cards.size} từ, ${data.reviews.length} lượt ôn).`;
  }

  async function importFile(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== BACKUP_FORMAT || !Array.isArray(data.cards) || !Array.isArray(data.reviews) || typeof data.meta !== 'object') {
        throw new Error('File không đúng định dạng sao lưu của app.');
      }
      const when = new Date(data.exportedAt).toLocaleString('vi-VN');
      if (!confirm(`Khôi phục bản sao lưu lúc ${when} (${data.cards.length} từ)?\nTiến độ hiện tại trên trình duyệt này sẽ bị thay thế.`)) return;
      await db.replaceAll(data);
      await reload();
      status.textContent = `Đã khôi phục ${data.cards.length} từ, ${data.reviews.length} lượt ôn.`;
    } catch (err) {
      status.textContent = `Không khôi phục được: ${err.message}`;
    }
  }
}
