function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

import { createTimestamp as beijingNow, beijingToday } from '../utils/time.js';

function parseTencentTimestamp(value) {
  if (!value || value.length !== 14) {
    return beijingNow();
  }
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10);
  const minute = value.slice(10, 12);
  const second = value.slice(12, 14);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
}

export function parseTencentQuote(raw) {
  const match = raw.match(/="(.*)";/);
  if (!match) {
    throw new Error('Invalid Tencent quote payload');
  }
  const parts = match[1].split('~');
  const info = (parts[35] || '').split('/');

  return {
    name: parts[1],
    code: parts[2],
    now: toNumber(parts[3]),
    prevClose: toNumber(parts[4]),
    open: toNumber(parts[5]),
    high: toNumber(parts[33]),
    low: toNumber(parts[34]),
    volume: toNumber(parts[6]),
    turnover: toNumber(info[2]) || toNumber(parts[37]),
    time: parseTencentTimestamp(parts[30])
  };
}

export function parseSinaQuote(raw) {
  const match = raw.match(/="(.*)";/);
  if (!match) {
    throw new Error('Invalid Sina quote payload');
  }
  const parts = match[1].split(',');
  const date = parts[30] || '';
  const time = parts[31] || '';

  return {
    name: parts[0],
    open: toNumber(parts[1]),
    prevClose: toNumber(parts[2]),
    now: toNumber(parts[3]),
    high: toNumber(parts[4]),
    low: toNumber(parts[5]),
    volume: toNumber(parts[8]),
    turnover: toNumber(parts[9]),
    time: date && time ? `${date}T${time}+08:00` : beijingNow()
  };
}

export function parseTencentMinute(raw) {
  const list = raw?.data ?? [];
  const points = list.map((item) => {
    const [timeRaw, price, volume, amount] = item.split(' ');
    const time = `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}`;
    const vol = toNumber(volume);
    const amt = toNumber(amount);
    const avgPrice = vol > 0 ? amt / vol / 100 : toNumber(price);

    return {
      time,
      price: toNumber(price),
      volume: vol,
      avgPrice
    };
  });

  return { points };
}

export function parseTencentMultiDayMinuteToKline(raw, period) {
  // 腾讯5日分时数据格式: { "0": { data: ["0930 price vol amt", ...], date: "20260408" }, ... }
  const intervalMinutes = { '1m': 1, '5m': 5, '15m': 15, '30m': 30 }[period] ?? 5;
  const klineBars = [];

  // 按日期排序处理每天的数据
  const dayKeys = Object.keys(raw).sort((a, b) => {
    const dateA = raw[a]?.date || a;
    const dateB = raw[b]?.date || b;
    return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
  });

  for (const dayKey of dayKeys) {
    const dayData = raw[dayKey];
    if (!dayData?.data || !Array.isArray(dayData.data)) continue;
    const dateRaw = dayData.date || '';
    const date = dateRaw.length === 8
      ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      : beijingToday();

    const points = dayData.data.map((item) => {
      const [timeRaw, price, cumVolume, cumAmount] = item.split(' ');
      const hour = Number(timeRaw.slice(0, 2));
      const minute = Number(timeRaw.slice(2, 4));
      return {
        minuteIndex: hour * 60 + minute,
        timeStr: `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}`,
        price: toNumber(price),
        cumVolume: toNumber(cumVolume),
        cumAmount: toNumber(cumAmount)
      };
    });

    if (points.length === 0) continue;

    // 按 intervalMinutes 分组
    const firstMinuteIndex = points[0].minuteIndex;
    const groups = [];
    for (const p of points) {
      const groupIndex = Math.floor((p.minuteIndex - firstMinuteIndex) / intervalMinutes);
      if (!groups[groupIndex]) groups[groupIndex] = [];
      groups[groupIndex].push(p);
    }

    let prevCumVolume = 0;
    let prevCumAmount = 0;

    for (const group of groups) {
      if (!group || group.length === 0) continue;
      const firstP = group[0];
      const lastP = group[group.length - 1];
      const allPrices = group.map((p) => p.price);
      klineBars.push({
        date,
        time: firstP.timeStr,
        open: firstP.price,
        high: Math.max(...allPrices),
        low: Math.min(...allPrices),
        close: lastP.price,
        volume: lastP.cumVolume - prevCumVolume,
        amount: lastP.cumAmount - prevCumAmount
      });
      prevCumVolume = lastP.cumVolume;
      prevCumAmount = lastP.cumAmount;
    }
  }

  return { period, list: klineBars };
}

export function parseTencentMinuteToKline(raw, period) {
  const list = raw?.data ?? [];
  const intervalMinutes = { '1m': 1, '5m': 5, '15m': 15, '30m': 30 }[period] ?? 1;

  const points = list.map((item) => {
    const [timeRaw, price, cumVolume, cumAmount] = item.split(' ');
    const hour = Number(timeRaw.slice(0, 2));
    const minute = Number(timeRaw.slice(2, 4));
    return {
      minuteIndex: hour * 60 + minute,
      timeStr: `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}`,
      price: toNumber(price),
      cumVolume: toNumber(cumVolume),
      cumAmount: toNumber(cumAmount)
    };
  });

  if (points.length === 0) return { period, list: [] };

  const today = beijingToday();
  const klineBars = [];

  if (intervalMinutes === 1) {
    // Each Tencent minute point records the close price at that minute mark.
    // Bar "T" covers the interval [T, T+1): open = price[T], close = price[T+1].
    // Label the bar with the START time (point[i].timeStr), not the end time.
    for (let i = 0; i < points.length - 1; i++) {
      const openP = points[i];
      const closeP = points[i + 1];
      klineBars.push({
        date: today,
        time: openP.timeStr,
        open: openP.price,
        high: Math.max(openP.price, closeP.price),
        low: Math.min(openP.price, closeP.price),
        close: closeP.price,
        volume: closeP.cumVolume - openP.cumVolume,
        amount: closeP.cumAmount - openP.cumAmount
      });
    }
    // Add the in-progress bar using the last data point as its open
    const lastP = points[points.length - 1];
    klineBars.push({
      date: today,
      time: lastP.timeStr,
      open: lastP.price,
      high: lastP.price,
      low: lastP.price,
      close: lastP.price,
      volume: 0,
      amount: 0
    });
  } else {
    // For N-minute bars: group consecutive minute points into intervals.
    // Label each bar with the START time of its interval (firstP.timeStr).
    const firstMinuteIndex = points[0].minuteIndex;
    const groups = [];
    for (const p of points) {
      const groupIndex = Math.floor((p.minuteIndex - firstMinuteIndex) / intervalMinutes);
      if (!groups[groupIndex]) groups[groupIndex] = [];
      groups[groupIndex].push(p);
    }

    let prevCumVolume = 0;
    let prevCumAmount = 0;

    for (const group of groups) {
      if (!group || group.length === 0) continue;
      const firstP = group[0];
      const lastP = group[group.length - 1];
      const allPrices = group.map((p) => p.price);
      klineBars.push({
        date: today,
        time: firstP.timeStr,
        open: firstP.price,
        high: Math.max(...allPrices),
        low: Math.min(...allPrices),
        close: lastP.price,
        volume: lastP.cumVolume - prevCumVolume,
        amount: lastP.cumAmount - prevCumAmount
      });
      prevCumVolume = lastP.cumVolume;
      prevCumAmount = lastP.cumAmount;
    }
  }

  return { period, list: klineBars };
}

export function parseTencentKline(raw, period) {
  const keyCandidates = [period, `${period}qfq`, `${period}hfq`];
  const list = keyCandidates
    .map((key) => raw?.[key])
    .find((item) => Array.isArray(item)) ?? [];

  function parseRow(row) {
    if (Array.isArray(row)) return row;
    if (typeof row === 'string') return row.split(',');
    return [];
  }

  return {
    period,
    list: list.map((row) => {
      const [dateRaw, open, close, high, low, volume, amount] = parseRow(row);
      let date = dateRaw;
      let time;
      const isMinute = typeof dateRaw === 'string' && /^\d{12}$/.test(dateRaw);

      if (isMinute) {
        date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
        time = `${dateRaw.slice(8, 10)}:${dateRaw.slice(10, 12)}`;
      }

      const vol = toNumber(volume);
      const cls = toNumber(close);
      const amt = toNumber(amount);
      // 腾讯mkline分钟K线第7字段为{}(空对象)，amount无效；用 close×volume×100 估算（A股1手=100股）
      const finalAmount = amt > 0 ? amt : (isMinute && vol > 0 ? parseFloat((cls * vol * 100).toFixed(2)) : 0);

      return {
        date,
        time,
        open: toNumber(open),
        high: toNumber(high),
        low: toNumber(low),
        close: cls,
        volume: vol,
        amount: finalAmount
      };
    })
  };
}

export function parseEastmoneyTradeDetail(raw) {
  const details = raw?.details ?? [];
  return {
    records: details.map((row) => {
      const [time, price, volume, amount, sideRaw] = row.split(',');
      const side = sideRaw === '1' ? 'buy' : sideRaw === '2' ? 'sell' : 'unknown';
      return [time, toNumber(price), toNumber(volume), side];
    })
  };
}

export function parseEastmoneyAnnouncements(raw) {
  const list = raw?.list ?? [];
  return {
    items: list.map((item) => {
      const stockCode = item?.codes?.[0]?.stock_code || '';
      return {
        id: item.art_code,
        title: item.title || item.title_ch || '',
        publishedAt: item.notice_date || item.display_time || '',
        url: stockCode && item.art_code
          ? `https://data.eastmoney.com/notices/detail/${stockCode}/${item.art_code}.html`
          : ''
      };
    })
  };
}

export function parseSinaUSKline(items) {
  // 新浪美股K线格式: { d: "2026-04-08", o: "258.45", h: "259.75", l: "256.53", c: "258.90", v: "41016009", a: "10593200000" }
  if (!Array.isArray(items)) return { list: [] };
  return {
    list: items.map((item) => ({
      date: item.d,
      open: toNumber(item.o),
      high: toNumber(item.h),
      low: toNumber(item.l),
      close: toNumber(item.c),
      volume: toNumber(item.v),
      amount: toNumber(item.a)
    }))
  };
}

export function parseEastmoneyKline(raw) {
  const klines = raw?.klines ?? [];
  return {
    list: klines.map((row) => {
      const parts = row.split(',');
      // 东方财富格式: 日期,开盘,收盘,最高,最低,成交量,成交额,振幅
      const [date, open, close, high, low, volume, amount] = parts;
      return {
        date,
        open: toNumber(open),
        high: toNumber(high),
        low: toNumber(low),
        close: toNumber(close),
        volume: toNumber(volume),
        amount: toNumber(amount)
      };
    })
  };
}

export function parseEastmoneyCapital(raw) {
  const latest = raw?.klines?.[raw.klines.length - 1];
  if (!latest) {
    return { mainNetInflow: 0, largeNetInflow: 0, mediumNetInflow: 0, smallNetInflow: 0 };
  }

  const [, main, large, medium, small] = latest.split(',');
  return {
    mainNetInflow: toNumber(main),
    largeNetInflow: toNumber(large),
    mediumNetInflow: toNumber(medium),
    smallNetInflow: toNumber(small)
  };
}
