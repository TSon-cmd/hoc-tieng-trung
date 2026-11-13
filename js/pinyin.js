// Tiện ích pinyin. Âm tiết gốc viết không dấu, ü viết là v (khớp tên file: cmn-lv3.mp3)
const MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };

export const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];

// So sánh gần đúng với âm tiếng Việt, để người mới bắt đầu có điểm tựa
export const INITIAL_TIPS = {
  b: 'như "p" không bật hơi', p: 'như "p" bật hơi mạnh', m: 'như "m"', f: 'như "ph"',
  d: 'như "t" không bật hơi', t: 'như "th" bật hơi', n: 'như "n"', l: 'như "l"',
  g: 'như "c/k" không bật hơi', k: 'như "kh" bật hơi', h: 'như "h", hơi cọ ở cuống lưỡi',
  j: 'như "ch", mặt lưỡi áp vòm', q: 'như "ch" bật hơi', x: 'như "x" mềm',
  zh: 'như "tr", uốn lưỡi', ch: 'như "tr" uốn lưỡi + bật hơi', sh: 'như "s" uốn lưỡi', r: 'như "r" nhẹ, uốn lưỡi',
  z: 'như "ch" đầu lưỡi thẳng, không bật hơi', c: 'như "ch" đầu lưỡi thẳng, bật hơi', s: 'như "x"',
  y: 'như "d" nhẹ / "i"', w: 'như "u" lướt nhanh', '': 'âm tiết bắt đầu bằng nguyên âm',
};

export function mark(base, tone) {
  const s = base.replace(/v/g, 'ü');
  if (!(tone >= 1 && tone <= 4)) return s;
  let i = s.search(/[ae]/);
  if (i < 0) i = s.indexOf('ou');
  if (i < 0) for (let k = s.length - 1; k >= 0; k--) if ('iouü'.includes(s[k])) { i = k; break; }
  if (i < 0) return s;
  return s.slice(0, i) + MARKS[s[i]][tone - 1] + s.slice(i + 1);
}

// "ni3 men5" -> [{base:'ni', tone:3}, {base:'men', tone:5}]
export function parse(numeric) {
  return numeric.split(/\s+/).filter(Boolean).map((s) => {
    const m = s.match(/^([a-zü:v]+?)([1-5])?$/i);
    const base = (m ? m[1] : s).toLowerCase().replace(/ü|u:/g, 'v');
    return { base, tone: m?.[2] ? Number(m[2]) : 5 };
  });
}

export function split(base) {
  const initial = INITIALS.find((i) => base.startsWith(i) && base.length > i.length) ?? '';
  return [initial, base.slice(initial.length)];
}

const INITIAL_PAIRS = [['zh', 'z', 'j'], ['ch', 'c', 'q'], ['sh', 's', 'x'], ['b', 'p'], ['d', 't'], ['g', 'k'], ['n', 'l'], ['r', 'l'], ['f', 'h']];
const FINAL_PAIRS = [['an', 'ang'], ['en', 'eng'], ['in', 'ing'], ['ian', 'iang'], ['uan', 'uang'], ['un', 'ong'], ['u', 'v'], ['ie', 'ei'], ['ou', 'uo'], ['ao', 'ou'], ['ai', 'ei']];

// Các âm tiết dễ nhầm với base (đổi thanh mẫu hoặc vận mẫu), chỉ giữ âm có thật
export function confusables(base, exists) {
  const [ini, fin] = split(base);
  const out = new Set();
  for (const g of INITIAL_PAIRS) if (g.includes(ini)) g.forEach((x) => out.add(x + fin));
  for (const g of FINAL_PAIRS) if (g.includes(fin)) g.forEach((x) => out.add(ini + x));
  out.delete(base);
  return [...out].filter(exists);
}
