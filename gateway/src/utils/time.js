// H2: format dates in Asia/Shanghai regardless of host TZ.
// The earlier implementation read getHours()/getDate() in the host's local
// time and *appended* "+08:00", so when the process ran in UTC (most Docker
// images, cloud VPS) every timestamp was off by up to 8 hours — breaking
// "24h high/low" comparisons and intraday minute alignment.
const BEIJING_TZ = 'Asia/Shanghai';

function partsBeijing(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIJING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  // Intl returns "24" for midnight in some locales; normalise to "00".
  if (map.hour === '24') map.hour = '00';
  return map;
}

export function createTimestamp() {
  const p = partsBeijing(new Date());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+08:00`;
}

export function beijingToday() {
  const p = partsBeijing(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}
