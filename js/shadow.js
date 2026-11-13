// Đọc to theo mẫu: nghe giọng mẫu -> ghi âm giọng mình -> nghe lại, so sánh -> tự đánh giá.
// Bản ghi chỉ nằm trong bộ nhớ trình duyệt, không lưu, không gửi đi đâu.
import { speakAndWait, playUrlAndWait, stop } from './audio.js';
import { pinyinMode } from './store.js';
import { esc, SPEAKER } from './ui.js';
import { icon } from './icons.js';

const MAX_SECONDS = 10; // tự dừng ghi âm nếu quên bấm dừng

// items: [{ zh, pinyin, vi }]. Xong thì onDone({ good, total })
export function runShadow(root, items, { onDone, doneLabel = 'Xong' }) {
  let i = 0, good = 0, stream = null, recorder = null, recUrl = null, timer = null, busy = false;

  function show() {
    const s = items[i];
    const py = pinyinMode();
    root.innerHTML = `
      <div class="shadow">
        <div class="progress-text">Đọc theo mẫu · câu ${i + 1}/${items.length}</div>
        <div class="bar"><span style="width:${(i / items.length) * 100}%"></span></div>
        <div class="sh-text">
          <div class="${py ? 'sh-main py' : 'sh-main zh'}">${esc(py ? s.pinyin : s.zh)}</div>
          <div class="sh-sub ${py ? 'zh' : ''}">${esc(py ? s.zh : s.pinyin)}</div>
          <div class="sh-vi">${esc(s.vi)}</div>
        </div>
        <div class="sh-steps">
          <button class="btn" data-sh="sample">${SPEAKER} Nghe mẫu <kbd>R</kbd></button>
          <button class="btn primary sh-rec" data-sh="rec">${icon('mic')} Ghi âm <kbd>Space</kbd></button>
        </div>
        <div class="sh-steps sh-after" hidden>
          <button class="btn" data-sh="mine">${icon('play')} Giọng mình</button>
          <button class="btn" data-sh="both">${icon('repeat')} Mẫu rồi giọng mình</button>
        </div>
        <p class="sh-status muted" aria-live="polite">Nghe mẫu, rồi bấm ghi âm và đọc to theo.</p>
        <div class="sh-rate" hidden>
          <button class="btn" data-sh="again">Chưa giống, đọc lại</button>
          <button class="btn primary" data-sh="good">${icon('check')} Giống rồi · ${i + 1 < items.length ? 'câu tiếp' : doneLabel} <kbd>Enter</kbd></button>
        </div>
        <button class="btn link sh-skip" data-sh="skip">Bỏ qua câu này</button>
      </div>`;
    sample();
  }

  const status = (t) => { const el = root.querySelector('.sh-status'); if (el) el.textContent = t; };

  async function sample() {
    await speakAndWait(items[i].zh);
  }

  async function toggleRec() {
    if (recorder?.state === 'recording') return recorder.stop();
    if (busy) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      return status('Trình duyệt này không cho dùng micro. Vẫn có thể nghe mẫu và đọc to theo.');
    }
    busy = true;
    try {
      stream ??= await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      busy = false;
      return status('Chưa được phép dùng micro. Bấm vào biểu tượng ổ khóa trên thanh địa chỉ để cho phép, rồi thử lại.');
    }
    stop();
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      clearTimeout(timer);
      if (recUrl) URL.revokeObjectURL(recUrl);
      recUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
      const btn = root.querySelector('.sh-rec');
      if (btn) { btn.innerHTML = `${icon('mic')} Ghi lại <kbd>Space</kbd>`; btn.classList.remove('recording'); }
      root.querySelector('.sh-after')?.removeAttribute('hidden');
      root.querySelector('.sh-rate')?.removeAttribute('hidden');
      status('So sánh giọng mình với giọng mẫu: thanh điệu, nhịp, chỗ ngắt hơi.');
      playBoth();
    };
    recorder.start();
    busy = false;
    root.querySelector('.sh-rec').innerHTML = `${icon('stop')} Dừng <kbd>Space</kbd>`;
    root.querySelector('.sh-rec').classList.add('recording');
    status('Đang ghi âm… đọc to câu trên, xong bấm Dừng.');
    timer = setTimeout(() => recorder?.state === 'recording' && recorder.stop(), MAX_SECONDS * 1000);
  }

  async function playBoth() {
    await speakAndWait(items[i].zh);
    if (recUrl) await playUrlAndWait(recUrl);
  }

  function next(ok) {
    if (recorder?.state === 'recording') return;
    if (ok) good++;
    if (recUrl) { URL.revokeObjectURL(recUrl); recUrl = null; }
    if (++i < items.length) show();
    else { release(); onDone({ good, total: items.length }); }
  }

  function again() {
    if (recUrl) { URL.revokeObjectURL(recUrl); recUrl = null; }
    show();
  }

  function release() {
    clearTimeout(timer);
    if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); }
    stream?.getTracks().forEach((t) => t.stop()); // tắt micro
    stream = null;
    stop();
  }

  const onClick = (e) => {
    const a = e.target.closest('[data-sh]')?.dataset.sh;
    if (a === 'sample') sample();
    if (a === 'rec') toggleRec();
    if (a === 'mine' && recUrl) playUrlAndWait(recUrl);
    if (a === 'both') playBoth();
    if (a === 'again') again();
    if (a === 'good') next(true);
    if (a === 'skip') next(false);
  };
  const onKey = (e) => {
    if (e.target.closest('input, textarea, select') || e.repeat) return;
    if (e.key === ' ') { e.preventDefault(); toggleRec(); }
    else if (e.key === 'r' || e.key === 'R') sample();
    else if (e.key === 'Enter' && recUrl && !e.target.closest('button')) next(true);
  };
  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  show();
  return () => { release(); root.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
}
