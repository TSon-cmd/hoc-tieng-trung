// Kiểm tra trình độ: Thanh điệu -> lần lượt từng bài của lộ trình (1 từ + 2 câu mỗi bài),
// trượt 2 bài liền thì dừng. Kết quả: trình độ ước tính, điểm theo kỹ năng, so với mốc trong brief.
import { state, lessonProgress, saveLevelTest, placeLessons, currentLesson, PLACE_PER_DAY } from '../store.js';
import { makeQuestion, play as playSyllable } from '../drill.js';
import { levelSet, SKILLS } from '../exercises.js';
import { runQuiz } from '../quiz.js';
import { stop } from '../audio.js';
import { esc } from '../ui.js';
import { icon } from '../icons.js';

const TONE_QUESTIONS = 6;
const LESSON_PASS = 2;   // đúng 2/3 câu của một bài là đã nắm bài đó
const STOP_AFTER = 2;    // trượt 2 bài liền thì dừng
// Mốc trong brief: số từ và mẫu câu cần có
const MILESTONES = [['Tháng 1', 100, 10], ['Tháng 3', 250, 30], ['Tháng 6', 500, 60], ['Tháng 12', 1000, 120]];

const pct = ([c, t]) => (t ? Math.round((c / t) * 100) : 0);
const lessonLabel = (l) => {
  const stage = state.stages.find((s) => s.id === l.stage);
  const num = stage.lessons.findIndex((x) => x.id === l.id) + 1;
  return { stage, num };
};

// Các bài được tính là đã nắm: liên tục từ đầu lộ trình; bài ôn tập được tính khi bài ngay sau nó đạt
function masteredRun(lessonScores) {
  const run = [];
  let pending = [];
  for (const l of state.lessonOrder) {
    if (!state.lessons[l.id]) break;
    if (state.lessons[l.id].review) { pending.push(l.id); continue; }
    const r = lessonScores[l.id];
    if (!r || r[0] < LESSON_PASS) break;
    run.push(...pending, l.id);
    pending = [];
  }
  return run;
}

function estimate(ids) {
  const words = new Set(ids.flatMap((id) => state.lessons[id].words));
  const sents = new Set(ids.flatMap((id) => state.lessons[id].sentences.map((s) => s.id)));
  return { words: words.size, sentences: sents.size };
}

function levelText(r) {
  const last = state.lessonOrder.find((l) => l.id === r.reached);
  if (!last) return pct(r.tone) < 60 ? 'Mới bắt đầu' : 'Mới bắt đầu · đã nghe được thanh điệu';
  const { stage, num } = lessonLabel(last);
  return `${stage.title} · nắm đến bài ${num}`;
}

export function render(root) {
  let cleanup = null;
  const finish = () => { cleanup?.(); cleanup = null; stop(); };

  function intro() {
    finish();
    const tests = [...(state.meta.levelTests ?? [])].reverse();
    root.innerHTML = `
      <section class="level">
        <h1>Kiểm tra trình độ</h1>
        <p>Bài kiểm tra đi từ dễ đến khó: <b>${TONE_QUESTIONS} câu thanh điệu</b>, sau đó <b>3 câu cho mỗi bài</b> của lộ trình
          (từ vựng, ghép câu, điền từ, nghe hiểu). Trượt ${STOP_AFTER} bài liền thì bài kiểm tra tự dừng, nên người mới chỉ mất vài phút.</p>
        <p class="muted small">Câu nào không biết thì bấm <b>Không biết</b>, đừng đoán, kết quả sẽ chính xác hơn.
          Làm lại mỗi tháng một lần để xem tiến bộ.</p>
        <button class="btn primary wide" data-action="start">Bắt đầu kiểm tra</button>
        ${tests.length ? `
          <h2 class="section-title">Các lần kiểm tra</h2>
          <div class="lv-history">${tests.map((t) => `
            <div class="lv-row">
              <span class="muted">${new Date(t.at).toLocaleDateString('vi-VN')}</span>
              <span class="lv-row-main">${esc(levelText(t))}</span>
              <span class="muted small">~${t.words} từ · ${t.sentences} câu · thanh điệu ${pct(t.tone)}%</span>
            </div>`).join('')}
          </div>` : ''}
      </section>`;
  }

  function start() {
    finish();
    const order = state.lessonOrder.filter((l) => state.lessons[l.id] && !state.lessons[l.id].review);
    const t = { tone: [0, 0], skills: {}, lessons: {}, failStreak: 0, li: 0, block: [], stopped: false };

    root.innerHTML = `
      <section class="level">
        <div class="quiz-host"></div>
        <button class="btn link lv-stop" data-action="stop">Dừng và xem kết quả</button>
      </section>`;
    const host = root.querySelector('.quiz-host');

    const tag = (text) => `<span class="lv-tag">${esc(text)}</span>`;

    function nextQuestion(i) {
      if (t.stopped) return null;
      if (i < TONE_QUESTIONS) {
        const d = makeQuestion();
        return { kind: 'choice', prompt: `${tag('Thanh điệu')}${d.prompt}`, play: () => playSyllable(d), options: d.options, skill: 'tone' };
      }
      if (!t.block.length) {
        if (t.failStreak >= STOP_AFTER || t.li >= order.length) return null;
        const l = order[t.li++];
        t.block = levelSet(l.id).map((make) => ({ make, lesson: l }));
        t.lessons[l.id] = [0, 0];
      }
      const { make, lesson } = t.block.shift();
      const { stage, num } = lessonLabel(lesson);
      const q = make();
      return { ...q, prompt: `${tag(`${stage.title} · Bài ${num}`)}${q.prompt}`, lesson: lesson.id, last: !t.block.length };
    }

    function onAnswer(q, ok) {
      const add = (arr) => { arr[0] += ok ? 1 : 0; arr[1]++; };
      add(t.skills[q.skill] ??= [0, 0]);
      if (q.skill === 'tone') add(t.tone);
      if (!q.lesson) return;
      add(t.lessons[q.lesson]);
      if (q.last) t.failStreak = t.lessons[q.lesson][0] >= LESSON_PASS ? 0 : t.failStreak + 1;
    }

    cleanup = runQuiz(host, {
      total: Infinity, label: 'Câu', allowSkip: true, next: nextQuestion, onAnswer, doneLabel: 'Xem kết quả',
      onDone: () => result(t),
    });
    root.querySelector('[data-action="stop"]').addEventListener('click', () => { t.stopped = true; result(t); });
  }

  async function result(t) {
    finish();
    // Bài đang làm dở khi bấm dừng thì bỏ, không tính
    const lessons = Object.fromEntries(Object.entries(t.lessons).filter(([, r]) => r[1] === 3));
    const run = masteredRun(lessons);
    const est = estimate(run);
    const r = {
      at: new Date().toISOString(), tone: t.tone, skills: t.skills, lessons,
      reached: run.filter((id) => !state.lessons[id].review).at(-1) ?? null, ...est,
    };
    await saveLevelTest(r);

    const reachedMs = MILESTONES.filter(([, w, s]) => est.words >= w && est.sentences >= s).at(-1);
    const nextMs = MILESTONES.find(([, w, s]) => est.words < w || est.sentences < s);
    const toPlace = run.filter((id) => !lessonProgress(id)?.passedAt);
    const scores = Object.fromEntries(toPlace.map((id) => [id, lessons[id] ? lessons[id][0] / 3 : 1]));
    const nextLesson = state.lessonOrder[state.lessonOrder.findIndex((l) => l.id === run.at(-1)) + 1] ?? null;
    const cur = currentLesson();

    let advice;
    if (pct(t.tone) < 60) advice = `Tai nghe thanh điệu còn yếu (${pct(t.tone)}%). Nên luyện thêm ở mục <a href="#/pinyin">Pinyin</a> vài ngày trước khi học bài mới.`;
    else if (toPlace.length) advice = `Bạn đã nắm <b>${toPlace.length} bài</b> mà app chưa ghi nhận. Có thể mở khóa để học tiếp từ bài phù hợp.`;
    else if (cur) advice = `Trình độ khớp với tiến độ trong app. Học tiếp bài <a href="#/lesson?id=${cur.id}">${esc(cur.zh)} ${esc(cur.title)}</a>.`;
    else advice = 'Bạn đã nắm toàn bộ các bài hiện có. Chặng tiếp theo sẽ mở khi có bài mới.';

    const skillRows = Object.entries(SKILLS).filter(([k]) => t.skills[k]).map(([k, name]) => `
      <div class="lv-skill"><span>${name}</span>
        <span class="lv-meter"><span style="width:${pct(t.skills[k])}%"></span></span>
        <b>${pct(t.skills[k])}%</b><span class="muted small">${t.skills[k][0]}/${t.skills[k][1]}</span></div>`).join('');

    const lessonRows = state.lessonOrder.filter((l) => lessons[l.id]).map((l) => {
      const ok = lessons[l.id][0] >= LESSON_PASS;
      const { num } = lessonLabel(l);
      return `<div class="lv-lesson ${ok ? 'ok' : 'bad'}"><span>${icon(ok ? 'check' : 'x', 'sm')}</span>
        <span>Bài ${num} · <span class="zh">${esc(l.zh)}</span> ${esc(l.title)}</span><span class="muted">${lessons[l.id][0]}/3</span></div>`;
    }).join('');

    root.innerHTML = `
      <section class="level">
        <div class="summary">
          <p class="muted cap">Kết quả kiểm tra trình độ</p>
          <h2>${esc(levelText(r))}</h2>
          <div class="stats">
            <div class="stat"><b>~${est.words}</b><span>từ đã nắm</span></div>
            <div class="stat"><b>${est.sentences}</b><span>mẫu câu</span></div>
            <div class="stat"><b>${pct(t.tone)}%</b><span>thanh điệu</span></div>
          </div>
        </div>
        <p class="goal">${icon('target')} ${reachedMs ? `Đã đạt mốc <b>${reachedMs[0]}</b> trong kế hoạch.` : 'Chưa đạt mốc đầu tiên.'}
          ${nextMs ? `Mốc tiếp theo <b>${nextMs[0]}</b>: ${nextMs[1]} từ, ${nextMs[2]} mẫu câu (còn thiếu ${[[nextMs[1] - est.words, 'từ'], [nextMs[2] - est.sentences, 'câu']].filter(([n]) => n > 0).map(([n, u]) => `${n} ${u}`).join(', ')}).` : ''}</p>
        <p>${advice}</p>
        ${toPlace.length ? `
          <button class="btn primary wide" data-action="place">Mở khóa ${toPlace.length} bài đã nắm${nextLesson ? `, học tiếp từ ${esc(nextLesson.title)}` : ''}</button>
          <p class="muted small">Từ và mẫu câu của các bài này sẽ vào lịch ôn tập, rải dần tối đa ${PLACE_PER_DAY} thẻ mỗi ngày.</p>` : ''}
        <p class="status" aria-live="polite"></p>

        <h2 class="section-title">Theo kỹ năng</h2>
        <div class="lv-skills">${skillRows}</div>
        ${lessonRows ? `<h2 class="section-title">Theo bài</h2><div class="lv-lessons">${lessonRows}</div>` : ''}
        <div class="row center lv-actions">
          <button class="btn" data-action="intro">Xem các lần kiểm tra</button>
          <a class="btn primary" href="#/">Về lộ trình</a>
        </div>
      </section>`;

    root.querySelector('[data-action="place"]')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      const n = await placeLessons(scores);
      e.target.remove();
      root.querySelector('.status').innerHTML = `✓ Đã mở khóa ${toPlace.length} bài, thêm ${n} thẻ vào lịch ôn.
        ${nextLesson ? `<a href="#/lesson?id=${nextLesson.id}">Học bài ${esc(nextLesson.zh)} ${esc(nextLesson.title)} →</a>` : ''}`;
    });
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'start') start();
    if (a === 'intro') intro();
  });

  intro();
  return finish;
}
