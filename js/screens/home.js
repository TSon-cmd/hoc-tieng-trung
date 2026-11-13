import { state, dueCards, streak, currentLesson, lessonProgress, isUnlocked, pinyinMode } from '../store.js';
import { esc } from '../ui.js';
import { icon } from '../icons.js';
import { QUICK_CARDS } from './session.js';
import { syncConfig } from '../sync.js';

const title = (l) => (pinyinMode() ? l.py ?? l.zh : l.zh);

// Chặng nào đang mở: lưu trong trình duyệt (chỉ là tiện ích hiển thị, mất cũng không sao)
const OPEN_KEY = 'home-open-stages';
const loadOpen = () => { try { return JSON.parse(localStorage.getItem(OPEN_KEY)); } catch { return null; } };
const saveOpen = (ids) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(ids)); } catch { /* bỏ qua */ } };

function lessonRow(l, n) {
  const p = lessonProgress(l.id);
  const cur = currentLesson()?.id === l.id;
  const [cls, mark, hint] = p?.passedAt ? ['done', icon('check'), p.placed ? 'Đã nắm' : `${Math.round(p.best * 100)}%`]
    : !l.ready ? ['soon', icon('pencil'), 'Đang soạn']
    : cur || isUnlocked(l.id) ? ['current', n, 'Học tiếp']
    : ['locked', icon('lock'), ''];
  return `<a class="lesson-row ${cls}" href="#/lesson?id=${l.id}">
    <span class="l-icon">${mark}</span>
    <span class="l-main"><span class="l-zh ${pinyinMode() ? '' : 'zh'}">${esc(title(l))}</span><span class="l-title">Bài ${n} · ${esc(l.title)}</span></span>
    ${hint ? `<span class="l-hint">${hint}</span>` : ''}
  </a>`;
}

export function render(root) {
  const due = dueCards().length;
  const cur = currentLesson();
  const curStage = cur && state.stages.find((s) => s.lessons.some((l) => l.id === cur.id));
  const passed = state.lessonOrder.filter((l) => lessonProgress(l.id)?.passedAt).length;
  const learnedWords = state.words.filter((w) => state.cards.has(w.id)).length;
  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });

  const lastBackup = state.meta.lastBackup ? new Date(state.meta.lastBackup) : null;
  const backupDays = lastBackup ? Math.floor((Date.now() - lastBackup) / 864e5) : null;
  // Đã bật đồng bộ thì tiến độ có bản trên GitHub, không cần nhắc tải file sao lưu
  const needBackup = state.cards.size > 0 && !syncConfig() && (backupDays === null || backupDays >= 7);
  // Mặc định chỉ mở chặng đang học; người dùng tự mở/đóng thì nhớ lại
  const open = new Set(loadOpen() ?? [curStage?.id ?? state.stages[0]?.id]);

  root.innerHTML = `
    <section class="home">
      <header class="home-head">
        <div><p class="muted cap">${today}</p><h1>Hôm nay học gì?</h1></div>
        <span class="streak-pill" title="Số ngày học liên tiếp">${icon('flame')} <b>${streak()}</b></span>
      </header>

      <div class="today">
        ${cur ? `<a class="action-card primary" href="#/lesson?id=${cur.id}">
          <span class="ac-label">Học tiếp · ${esc(curStage.title)}</span>
          <span class="ac-title"><span class="ac-zh ${pinyinMode() ? '' : 'zh'}">${esc(title(cur))}</span>${esc(cur.title)}</span>
          <span class="ac-sub">${cur.ready ? 'Từ vựng · Ngữ pháp · Mẫu câu · Luyện tập · Kiểm tra' : 'Bài đang được soạn'}</span>
          <span class="ac-go" aria-hidden="true">${icon('arrow')}</span>
        </a>` : ''}
        <a class="action-card review" href="#/session">
          <span class="ac-count">${due}</span>
          <span class="ac-text"><span class="ac-title">${due ? 'thẻ cần ôn hôm nay' : 'Không có thẻ đến hạn'}</span>
          <span class="ac-sub">${due ? 'Từ và mẫu câu · thanh điệu · đọc to' : 'Vẫn luyện nghe thanh điệu được'}</span></span>
          <span class="ac-go" aria-hidden="true">${icon('arrow')}</span>
        </a>
      </div>

      <div class="tiles">
        <a class="tile" href="#/session?quick=1"><span class="t-ico">${icon('clock')}</span><b>Ôn nhanh 5 phút</b><span>${due ? `${Math.min(due, QUICK_CARDS)} thẻ · giữ streak` : 'Ngày bận vẫn giữ streak'}</span></a>
        <a class="tile" href="#/level"><span class="t-ico">${icon('target')}</span><b>Kiểm tra trình độ</b><span>${state.meta.levelTests?.length ? `Lần gần nhất ${new Date(state.meta.levelTests.at(-1).at).toLocaleDateString('vi-VN')}` : 'Chưa làm lần nào'}</span></a>
        <a class="tile" href="#/words"><span class="t-ico">${icon('book')}</span><b>Từ vựng</b><span>${learnedWords} từ đã học</span></a>
        <a class="tile" href="#/progress"><span class="t-ico">${icon('chart')}</span><b>Tiến độ</b><span>${passed}/${state.lessonOrder.length} bài đã qua</span></a>
      </div>

      ${needBackup ? `<div class="warn">${icon('alert')}<span>${lastBackup ? `Đã ${backupDays} ngày chưa sao lưu.` : 'Chưa sao lưu lần nào.'}
        Dữ liệu chỉ nằm trên trình duyệt này. <a href="#/settings">Sao lưu ngay</a></span></div>` : ''}

      <h2 class="section-title">Lộ trình</h2>
      ${state.stages.map((s) => {
        const done = s.lessons.filter((l) => lessonProgress(l.id)?.passedAt).length;
        return `
        <details class="stage" data-stage="${s.id}" ${open.has(s.id) ? 'open' : ''}>
          <summary class="stage-head">
            <div class="stage-title"><b>${esc(s.title)}</b><span class="stage-time">${esc(s.time)}</span>
              ${s.lessons.length ? `<span class="stage-count">${done}/${s.lessons.length}</span>` : ''}
              <span class="stage-toggle">${icon('chevron')}</span></div>
            ${s.lessons.length ? `<div class="stage-bar"><span style="width:${(done / s.lessons.length) * 100}%"></span></div>` : ''}
            <p class="muted small">${esc(s.desc)}</p>
          </summary>
          <div class="path">
          ${s.link ? `<a class="lesson-row pinyin-row-link" href="${s.link}"><span class="l-icon">${icon('wave')}</span><span class="l-main"><span class="l-zh">Pinyin</span><span class="l-title">Thanh điệu · Bảng âm tiết · Luyện nghe</span></span><span class="l-hint">Mở</span></a>` : ''}
          ${s.lessons.map((l, i) => lessonRow(l, i + 1)).join('')}
          ${!s.link && !s.lessons.length ? '<p class="muted small path-empty">Sẽ mở sau khi hoàn thành chặng trước.</p>' : ''}
          </div>
        </details>`;
      }).join('')}
    </section>`;

  root.querySelectorAll('details.stage').forEach((d) => d.addEventListener('toggle', () => {
    saveOpen([...root.querySelectorAll('details.stage[open]')].map((x) => x.dataset.stage));
  }));
}
