function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseTencentTimestamp(value) {
  if (!value || value.length !== 14) {
    return new Date().toISOString();
  }

  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10);
  const minute = value.slice(10, 12);
  const second = value.slice(12, 14);
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
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
    turnover: toNumber(info[2]),
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
    time: date && time ? new Date(`${date}T${time}Z`).toISOString() : new Date().toISOString()
  };
}

export function parseTencentMinute(raw) {
  const data = raw?.data ?? {};
  const list = data.data ?? [];
  const points = list.map((item) => {
    const [timeRaw, price, volume, amount] = item.split(' ');
    const time = `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}`;
    const vol = toNumber(volume);
    const amt = toNumber(amount);
    const avgPrice = vol > 0 ? amt / (vol * 100) : toNumber(price);

    return {
      time,
      price: toNumber(price),
      volume: vol,
      avgPrice
    };
  });

  return { points };
}

export function parseTencentKline(raw, period) {
  const list = raw?.[period] ?? [];
  return {
    period,
    list: list.map(([date, open, close, high, low, volume]) => ({
      date,
      open: toNumber(open),
      high: toNumber(high),
      low: toNumber(low),
      close: toNumber(close),
      volume: toNumber(volume),
      amount: 0
    }))
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
