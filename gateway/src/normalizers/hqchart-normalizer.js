function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function beijingNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`;
}

function toTimestamp(value) {
  if (!value) return beijingNow();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return beijingNow();
  // If value already has timezone info, preserve it; otherwise assume Beijing time
  if (typeof value === 'string' && (value.includes('+') || value.endsWith('Z'))) {
    return value;
  }
  return beijingNow();
}

function basePayload(raw, context) {
  return {
    symbol: raw.symbol ?? raw.code ?? context.symbol,
    market: raw.market ?? context.market,
    provider: context.provider,
    timestamp: toTimestamp(raw.timestamp ?? raw.time)
  };
}

function normalizeMinutePoints(raw) {
  if (Array.isArray(raw.points)) {
    return raw.points.map((point) => ({
      time: point.time,
      price: toNumber(point.price),
      volume: toNumber(point.volume),
      avgPrice: toNumber(point.avgPrice)
    }));
  }

  return (raw.line ?? []).map(([time, price, volume, avgPrice]) => ({
    time,
    price: toNumber(price),
    volume: toNumber(volume),
    avgPrice: toNumber(avgPrice)
  }));
}

function normalizeKlineItems(raw) {
  if (Array.isArray(raw.list)) {
    return raw.list.map((item) => ({
      date: item.date,
      time: item.time,
      open: toNumber(item.open),
      high: toNumber(item.high),
      low: toNumber(item.low),
      close: toNumber(item.close),
      volume: toNumber(item.volume),
      amount: toNumber(item.amount)
    }));
  }

  return (raw.candles ?? []).map(([date, open, high, low, close, volume, amount, time]) => ({
    date,
    time,
    open: toNumber(open),
    high: toNumber(high),
    low: toNumber(low),
    close: toNumber(close),
    volume: toNumber(volume),
    amount: toNumber(amount)
  }));
}

function normalizeTrades(raw) {
  if (Array.isArray(raw.trades)) {
    return raw.trades.map((trade) => ({
      time: trade.time,
      price: toNumber(trade.price),
      volume: toNumber(trade.volume),
      side: trade.side
    }));
  }

  return (raw.records ?? []).map(([time, price, volume, side]) => ({
    time,
    price: toNumber(price),
    volume: toNumber(volume),
    side
  }));
}

export function createHqchartNormalizer() {
  return {
    normalizeQuote(raw, context) {
      return {
        ...basePayload(raw, context),
        name: raw.name ?? raw.title ?? `Mock ${context.symbol}`,
        price: toNumber(raw.now ?? raw.price),
        yclose: toNumber(raw.prevClose ?? raw.yclose, 0),
        open: toNumber(raw.open ?? raw.openPrice),
        high: toNumber(raw.high ?? raw.maxPrice),
        low: toNumber(raw.low ?? raw.minPrice),
        volume: toNumber(raw.volume ?? raw.totalVolume),
        amount: toNumber(raw.turnover ?? raw.totalAmount)
      };
    },

    normalizeMinute(raw, context) {
      return {
        ...basePayload(raw, context),
        points: normalizeMinutePoints(raw)
      };
    },

    normalizeKline(raw, context) {
      return {
        ...basePayload(raw, context),
        period: raw.period ?? raw.cycle ?? context.period ?? 'day',
        items: normalizeKlineItems(raw)
      };
    },

    normalizeCapital(raw, context) {
      const flows = raw.flows ?? raw;

      return {
        ...basePayload(raw, context),
        mainNetInflow: toNumber(flows.mainNetInflow ?? flows.main),
        largeNetInflow: toNumber(flows.largeNetInflow ?? flows.large),
        mediumNetInflow: toNumber(flows.mediumNetInflow ?? flows.medium),
        smallNetInflow: toNumber(flows.smallNetInflow ?? flows.small)
      };
    },

    normalizeCallauction(raw, context) {
      const auction = raw.auction ?? raw;

      return {
        ...basePayload(raw, context),
        price: toNumber(auction.price),
        matchedVolume: toNumber(auction.matchedVolume),
        unmatchedVolume: toNumber(auction.unmatchedVolume),
        direction: auction.direction ?? 'unknown'
      };
    },

    normalizeTradeDetail(raw, context) {
      return {
        ...basePayload(raw, context),
        trades: normalizeTrades(raw)
      };
    },

    normalizeNews(raw, context) {
      return {
        ...basePayload(raw, context),
        items: (raw.items ?? raw.news ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          publishedAt: toTimestamp(item.publishedAt),
          summary: item.summary ?? ''
        }))
      };
    },

    normalizeAnnouncements(raw, context) {
      return {
        ...basePayload(raw, context),
        items: (raw.items ?? raw.announcements ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          publishedAt: toTimestamp(item.publishedAt),
          url: item.url ?? ''
        }))
      };
    }
  };
}
