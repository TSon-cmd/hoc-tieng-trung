// Ưu tiên file thu sẵn (giọng người, hoặc câu đọc sẵn bằng ElevenLabs); không có thì dùng giọng zh-CN của trình duyệt
let current;
let speechFiles = {}; // văn bản -> tên file trong audio/speech/

export const setSpeechFiles = (map) => { speechFiles = map ?? {}; };

export function stop() {
  current?.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function playFile(path, fallbackText) {
  stop();
  current = new Audio(path);
  return current.play().catch(() => fallbackText && browserSpeak(fallbackText));
}

// Có file đọc sẵn thì phát file, không thì đọc bằng giọng trình duyệt
// quiet: phát tự động (không do người dùng bấm) thì không báo lỗi để khỏi làm phiền
export function speak(text, opts = {}) {
  const file = speechFiles[text?.trim()];
  if (file) return playFile(`audio/speech/${file}`);
  return browserSpeak(text, opts);
}

// Không có giọng zh-CN thì trình duyệt sẽ lấy giọng tiếng Anh đọc chữ Hán: báo lỗi thay vì đọc sai
function browserSpeak(text, { rate = 0.85, quiet = false } = {}) {
  const voice = zhVoice();
  if (!voice) {
    if (!quiet) window.dispatchEvent(new CustomEvent('tts-unavailable'));
    return;
  }
  stop();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = rate;
  u.voice = voice;
  speechSynthesis.speak(u);
}

export function zhVoice() {
  if (!('speechSynthesis' in window)) return null;
  return speechSynthesis.getVoices().find((v) => /^zh[-_]CN/i.test(v.lang)) ?? null;
}

// Phát rồi chờ phát xong (để nối "mẫu -> giọng mình"). Không đọc được thì resolve ngay
export function speakAndWait(text) {
  const file = speechFiles[text?.trim()];
  if (file) return playUrlAndWait(`audio/speech/${file}`);
  const voice = zhVoice();
  if (!voice) { browserSpeak(text); return Promise.resolve(); }
  return new Promise((resolve) => {
    stop();
    const u = new SpeechSynthesisUtterance(text);
    Object.assign(u, { lang: 'zh-CN', rate: 0.85, voice, onend: resolve, onerror: resolve });
    speechSynthesis.speak(u);
  });
}

export function playUrlAndWait(url) {
  stop();
  current = new Audio(url);
  return new Promise((resolve) => {
    current.onended = current.onerror = resolve;
    current.play().catch(resolve);
  });
}

// Đọc được đoạn này không (có file sẵn hoặc có giọng trình duyệt)
export const canSpeak = (text) => !!speechFiles[text?.trim()] || !!zhVoice();

export const playWord = (word) =>
  word.audio ? playFile(`audio/words/${encodeURIComponent(word.hanzi)}.mp3`, word.hanzi) : speak(word.hanzi);

export const playSyllable = (base, tone) => playFile(`audio/syllables/cmn-${base}${tone}.mp3`);
