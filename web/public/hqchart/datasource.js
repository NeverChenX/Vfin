/**
 * HQChart Backend DataSource Adapter (Stock Platform)
 *
 * 抽取自原 HQChart `frontend/app/index.html` 中的 `createDemoBackendDataSource`
 * 及其依赖辅助函数，使其可被 React/Next.js 通过 <script> 加载并复用。
 *
 * 用法（在 React 组件中）：
 *   window.HQCHART_API_BASE = '/api/hq';          // Next.js rewrites 到 Express gateway
 *   const ds = window.createHQChartDataSource();  // 由本文件挂上
 *   chart.SetOption({ NetworkFilter: ds.NetworkFilter.bind(ds), ...其他配置 });
 *
 * 该适配器只关心 HTTP 通信与 HQChart 协议格式转换；与 UI / DOM 无任何耦合。
 */
(function (global) {
  'use strict';

  function getApiBase() {
    var base = global.HQCHART_API_BASE || '/api/hq';
    return String(base).replace(/\/+$/, '');
  }

  function appendRequestOptions(query) {
    var data = {};
    if (query) {
      Object.keys(query).forEach(function (key) {
        var value = query[key];
        if (value === undefined || value === null || value === '') return;
        data[key] = value;
      });
    }
    if (global.HQCHART_API_PROVIDER) data.provider = global.HQCHART_API_PROVIDER;
    if (global.HQCHART_API_PROVIDER_MODE) data.providerMode = global.HQCHART_API_PROVIDER_MODE;
    return data;
  }

  function buildApiUrl(path, query) {
    var url = new URL(getApiBase() + path, global.location.origin);
    var data = appendRequestOptions(query);
    Object.keys(data).forEach(function (key) {
      url.searchParams.set(key, data[key]);
    });
    return url.toString();
  }

  async function apiRequest(method, path, option) {
    var requestOption = option || {};
    var init = { method: method, headers: { Accept: 'application/json' } };
    if (requestOption.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(requestOption.body);
    }
    var response = await fetch(buildApiUrl(path, requestOption.query), init);
    var text = await response.text();
    var data = {};
    if (text) {
      try { data = JSON.parse(text); }
      catch (_e) { data = { raw: text }; }
    }
    if (!response.ok) {
      var message = data && data.message ? data.message : method + ' ' + path + ' failed';
      var err = new Error(message);
      err.status = response.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  function apiGet(path, query) { return apiRequest('GET', path, { query: query }); }
  function apiPost(path, body, query) { return apiRequest('POST', path, { body: body, query: query }); }
  function apiDelete(path, query) { return apiRequest('DELETE', path, { query: query }); }

  function toNumber(value, fallback) {
    var number = Number(value);
    return isNaN(number) ? (fallback !== undefined ? fallback : 0) : number;
  }

  function padNumber(value, size) { return String(value).padStart(size, '0'); }

  function parseDateParts(value) {
    if (!value) return null;
    var text = String(value);
    var match = text.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/);
    if (match) return { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) };
    var date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }

  function toDateNumber(value) {
    var parts = parseDateParts(value);
    if (!parts) return 0;
    return parts.year * 10000 + parts.month * 100 + parts.day;
  }

  function shiftDateNumber(value, offset) {
    var parts = parseDateParts(value);
    if (!parts) return 0;
    var date = new Date(parts.year, parts.month - 1, parts.day);
    date.setDate(date.getDate() + offset);
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  }

  function toTimeNumber(value, withSeconds) {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    var text = String(value);
    var match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      var hour = parseInt(match[1]);
      var minute = parseInt(match[2]);
      var second = match[3] ? parseInt(match[3]) : 0;
      if (withSeconds) return hour * 10000 + minute * 100 + second;
      return hour * 100 + minute;
    }
    var compact = text.replace(/\D/g, '');
    return compact ? parseInt(compact) : 0;
  }

  function getRequestSymbol(item) {
    if (!item) return null;
    if (typeof item === 'string') return item;
    return item.OriginalSymbol || item.Symbol || item.symbol || null;
  }

  function getMarketLabel(symbol, market) {
    var code = (symbol || '').toLowerCase();
    var marketCode = (market || '').toLowerCase();
    if (!marketCode && code.includes('.')) marketCode = code.split('.').pop();
    if (marketCode === 'sh' || marketCode === 'sz' || marketCode === 'bj') return 'A股';
    if (marketCode === 'hk') return '港股';
    if (marketCode === 'us' || /^[a-z]{1,6}$/.test(code)) return '美股';
    return '其他';
  }

  function appendMarketLabel(name, symbol, market) {
    var text = (name || symbol || '').trim();
    if (!text) text = symbol || '';
    return '[' + getMarketLabel(symbol, market) + '] ' + text;
  }

  function getRiseFallPalette(mode) {
    if (mode === 'red-up-green-down') {
      return {
        up: 'rgb(238,21,21)', down: 'rgb(25,158,0)',
        upArea: 'rgba(238,21,21,0.2)', downArea: 'rgba(25,158,0,0.2)'
      };
    }
    return {
      up: 'rgb(25,158,0)', down: 'rgb(238,21,21)',
      upArea: 'rgba(25,158,0,0.2)', downArea: 'rgba(238,21,21,0.2)'
    };
  }

  function createReportMinuteData(yClose, price) {
    var count = 48;
    var data = [];
    var max = null, min = null;
    var startPrice = toNumber(yClose, price);
    var endPrice = toNumber(price, startPrice);
    for (var i = 0; i < count; ++i) {
      var rate = (i + 1) / count;
      var value = startPrice + (endPrice - startPrice) * rate;
      value = parseFloat(value.toFixed(2));
      data.push(value);
      if (max === null || value > max) max = value;
      if (min === null || value < min) min = value;
    }
    var mode = global.__HQ_RISE_FALL_MODE || 'green-up-red-down';
    var palette = getRiseFallPalette(mode);
    var color = endPrice >= startPrice ? palette.up : palette.down;
    var areaColor = endPrice >= startPrice ? palette.upArea : palette.downArea;
    return { Data: data, Max: max, Min: min, Count: count, YClose: startPrice, Color: color, AreaColor: areaColor };
  }

  function createReportKLineData(row) {
    var data = [row[3], row[4], row[5], row[6]];
    return { Data: data, AryData: [data.slice(), data.slice(), data.slice(), data.slice(), data.slice()] };
  }

  function createReportRow(quote) {
    var price = toNumber(quote.price);
    var yClose = toNumber(quote.yclose, quote.open !== undefined ? quote.open : price);
    var row = [];
    row[0] = quote.symbol;
    row[1] = (quote.name || quote.symbol || '').trim();
    if (!row[1]) row[1] = quote.symbol;
    row[2] = yClose;
    row[3] = toNumber(quote.open, price);
    row[4] = toNumber(quote.high, price);
    row[5] = toNumber(quote.low, price);
    row[6] = price;
    row[7] = toNumber(quote.volume);
    row[8] = toNumber(quote.amount);
    row[9] = parseFloat((price - 0.01).toFixed(2));
    row[10] = Math.max(parseInt(row[7] / 20), 1);
    row[11] = parseFloat((price + 0.01).toFixed(2));
    row[12] = Math.max(parseInt(row[7] / 18), 1);
    row[13] = parseFloat(((row[3] + price) / 2).toFixed(2));
    row[14] = Math.max(row[7], 1);
    row[15] = Math.max(parseInt(row[7] * 1.2), row[14]);
    row[23] = row[14] > 0 ? parseFloat(((row[7] / row[14]) * 100).toFixed(2)) : 0;
    row[27] = { Text: row[1] };
    row[32] = createReportMinuteData(yClose, price);
    row[33] = createReportKLineData(row);
    return row;
  }

  function createCallAuctionPayload(snapshot, date, isBefore, yClose) {
    var price = toNumber(snapshot && snapshot.price, yClose);
    var matched = Math.max(toNumber(snapshot && snapshot.matchedVolume, 3000), 1);
    var unmatched = Math.max(toNumber(snapshot && snapshot.unmatchedVolume, 300), 0);
    var direction = 0;
    if (snapshot && snapshot.direction === 'buy') direction = 1;
    else if (snapshot && snapshot.direction === 'sell') direction = 2;
    var timeRange = isBefore
      ? { start: 91500, end: 92459, last: 92458 }
      : { start: 145700, end: 145959, last: 145958 };
    var midPrice = parseFloat(((price + yClose) / 2).toFixed(2));
    var series = [
      [timeRange.start + 5, yClose, parseInt(matched * 0.15), parseFloat((yClose * matched * 0.15).toFixed(2)), direction, unmatched],
      [timeRange.start + 180, midPrice, parseInt(matched * 0.45), parseFloat((midPrice * matched * 0.45).toFixed(2)), direction, unmatched],
      [timeRange.last, price, matched, parseFloat((price * matched).toFixed(2)), direction, unmatched]
    ];
    return {
      data: series,
      info: { totalcount: 60 * 10, ver: 2.0, TimeConfig: { AryTime: [{ Start: timeRange.start, End: timeRange.end, Date: date }] } }
    };
  }

  function buildSingleMinuteResponse(symbol, quote, minute, auction) {
    var points = Array.isArray(minute.points) ? minute.points : [];
    var date = toDateNumber(minute.timestamp || quote.timestamp || new Date());
    var yClose = toNumber(quote.yclose, quote.open !== undefined ? quote.open : (points[0] ? points[0].price : quote.price));
    var prevClose = yClose;
    var minuteItems = [];
    for (var i = 0; i < points.length; ++i) {
      var point = points[i];
      var price = toNumber(point.price, prevClose);
      var avPrice = toNumber(point.avgPrice, price);
      minuteItems.push({
        time: toTimeNumber(point.time, false),
        open: prevClose,
        price: price,
        high: Math.max(prevClose, price),
        low: Math.min(prevClose, price),
        vol: toNumber(point.volume),
        amount: parseFloat((toNumber(point.volume) * price).toFixed(2)),
        avprice: avPrice
      });
      prevClose = price;
    }
    var stock = {
      symbol: symbol, name: quote.name || symbol, date: date,
      time: minuteItems.length > 0 ? minuteItems[minuteItems.length - 1].time : 930,
      yclose: yClose, minute: minuteItems
    };
    if (auction) {
      if (auction.before) { stock.before = auction.before.data; stock.beforeinfo = auction.before.info; }
      if (auction.after) { stock.after = auction.after.data; stock.afterinfo = auction.after.info; }
    }
    return { stock: [stock] };
  }

  function buildHistoryMinuteResponse(symbol, quote, minute, dayCount, auction) {
    var dayTotal = Math.max(parseInt(dayCount || 1), 1);
    var baseDate = toDateNumber(minute.timestamp || quote.timestamp || new Date());
    var points = Array.isArray(minute.points) ? minute.points : [];
    var response = { symbol: symbol, name: quote.name || symbol, data: [], code: 0 };
    for (var offset = 0; offset < dayTotal; ++offset) {
      var date = shiftDateNumber(baseDate, -offset);
      var priceOffset = (dayTotal - offset - 1) * 0.02;
      var yClose = parseFloat((toNumber(quote.open, quote.price) - priceOffset).toFixed(2));
      var prevClose = yClose;
      var minuteItems = [];
      for (var i = 0; i < points.length; ++i) {
        var point = points[i];
        var close = parseFloat((toNumber(point.price, prevClose) - priceOffset).toFixed(2));
        var open = prevClose;
        minuteItems.push([
          toTimeNumber(point.time, false), open, close,
          Math.max(open, close), Math.min(open, close),
          toNumber(point.volume),
          parseFloat((toNumber(point.volume) * close).toFixed(2)),
          parseFloat((toNumber(point.avgPrice, close) - priceOffset).toFixed(2))
        ]);
        prevClose = close;
      }
      var dayItem = { date: date, yclose: yClose, close: prevClose, minute: minuteItems };
      if (auction) {
        if (auction.before) {
          var b = auction.before.data[auction.before.data.length - 1];
          var beforeP = createCallAuctionPayload({ price: b[1], matchedVolume: b[2], unmatchedVolume: b[5], direction: 'buy' }, date, true, yClose);
          dayItem.before = beforeP.data; dayItem.beforeinfo = beforeP.info;
        }
        if (auction.after) {
          var a = auction.after.data[auction.after.data.length - 1];
          var afterP = createCallAuctionPayload({ price: a[1], matchedVolume: a[2], unmatchedVolume: a[5], direction: 'buy' }, date, false, prevClose);
          dayItem.after = afterP.data; dayItem.afterinfo = afterP.info;
        }
      }
      response.data.push(dayItem);
    }
    if (response.data.length > 0 && response.data[0].minute.length > 0) {
      response.updatetime = { date: response.data[0].date, time: response.data[0].minute[response.data[0].minute.length - 1][0] };
    }
    return response;
  }

  function getKLinePeriod(period) {
    switch (period) {
      case 1: return 'week';
      case 2: return 'month';
      case 3: return 'year';
      case 4: return '1m';
      case 5: return '5m';
      case 6: return '15m';
      case 7: return '30m';
      default: return 'day';
    }
  }

  function buildKLineHistoryResponse(symbol, quote, kline) {
    var items = Array.isArray(kline.items) ? kline.items : [];
    if (items.length <= 1) return { symbol: symbol, name: quote.name || symbol, data: [], ver: 2.0 };
    if (items.length <= 3) {
      var firstDate = toDateNumber(items[0].date);
      var lastDate = toDateNumber(items[items.length - 1].date);
      if (lastDate - firstDate > 20000) {
        return { symbol: symbol, name: quote.name || symbol, data: [], ver: 2.0 };
      }
    }
    var response = { symbol: symbol, name: quote.name || symbol, data: [], ver: 2.0 };
    var prevClose = items.length > 0 ? toNumber(items[0].open, items[0].close) : toNumber(quote.open, quote.price);
    for (var i = 0; i < items.length; ++i) {
      var item = items[i];
      var close = toNumber(item.close, prevClose);
      response.data.push([
        toDateNumber(item.date), prevClose,
        toNumber(item.open, close), toNumber(item.high, close), toNumber(item.low, close), close,
        toNumber(item.volume), toNumber(item.amount)
      ]);
      prevClose = close;
    }
    return response;
  }

  function buildKLineRealtimeResponse(symbol, quote, kline) {
    var items = Array.isArray(kline.items) ? kline.items : [];
    var lastItem = items.length > 0 ? items[items.length - 1] : null;
    var prevItem = items.length > 1 ? items[items.length - 2] : null;
    var close = toNumber(quote.price, lastItem ? toNumber(lastItem.close) : 0);
    return {
      code: 0,
      stock: [{
        symbol: symbol, name: quote.name || symbol,
        date: lastItem ? toDateNumber(lastItem.date) : toDateNumber(quote.timestamp || new Date()),
        open: lastItem ? toNumber(lastItem.open, close) : toNumber(quote.open, close),
        yclose: prevItem ? toNumber(prevItem.close, close) : toNumber(quote.open, close),
        high: lastItem ? Math.max(toNumber(lastItem.high), close) : toNumber(quote.high, close),
        low: lastItem ? Math.min(toNumber(lastItem.low), close) : toNumber(quote.low, close),
        price: close,
        vol: lastItem ? toNumber(lastItem.volume) : toNumber(quote.volume),
        amount: lastItem ? toNumber(lastItem.amount) : toNumber(quote.amount)
      }],
      LatestPointFlash: { FlashCount: 2 }
    };
  }

  function buildMinuteKLineHistoryResponse(symbol, quote, kline) {
    var items = Array.isArray(kline.items) ? kline.items : [];
    var response = { symbol: symbol, name: quote.name || symbol, data: [], ver: 2.0 };
    var prevClose = items.length > 0 ? toNumber(items[0].open, items[0].close) : toNumber(quote.open, quote.price);
    for (var i = 0; i < items.length; ++i) {
      var item = items[i];
      var date = toDateNumber(item.date || kline.timestamp || new Date());
      var timeValue = item.time || (9 + parseInt((30 + i) / 60)) + ':' + padNumber((30 + i) % 60, 2);
      var time = toTimeNumber(timeValue, false);
      var close = toNumber(item.close, prevClose);
      response.data.push([
        date, prevClose, toNumber(item.open, close),
        toNumber(item.high, close), toNumber(item.low, close), close,
        toNumber(item.volume), toNumber(item.amount), time
      ]);
      prevClose = close;
    }
    return response;
  }

  function buildMinuteKLineRealtimeResponse(symbol, quote, kline) {
    var items = Array.isArray(kline.items) ? kline.items : [];
    var lastItem = items.length > 0 ? items[items.length - 1] : null;
    var prevItem = items.length > 1 ? items[items.length - 2] : null;
    var date = toDateNumber(lastItem ? lastItem.date : (quote.timestamp || new Date()));
    var time = toTimeNumber(lastItem && lastItem.time ? lastItem.time : '09:30', false);
    var close = toNumber(quote.price, lastItem ? toNumber(lastItem.close) : 0);
    var yclose = prevItem ? toNumber(prevItem.close, close) : toNumber(quote.open, close);
    return {
      symbol: symbol, name: quote.name || symbol,
      data: [[
        date, yclose,
        lastItem ? toNumber(lastItem.open, close) : toNumber(quote.open, close),
        lastItem ? Math.max(toNumber(lastItem.high), close) : toNumber(quote.high, close),
        lastItem ? Math.min(toNumber(lastItem.low), close) : toNumber(quote.low, close),
        close,
        lastItem ? toNumber(lastItem.volume) : toNumber(quote.volume),
        lastItem ? toNumber(lastItem.amount) : toNumber(quote.amount),
        time
      ]],
      ver: 2.0
    };
  }

  function buildCapitalResponse(symbol, capital, kline) {
    var items = Array.isArray(kline.items) ? kline.items : [];
    var floatCapital = Math.max(
      Math.abs(toNumber(capital.mainNetInflow)) +
      Math.abs(toNumber(capital.largeNetInflow)) +
      Math.abs(toNumber(capital.mediumNetInflow)) +
      Math.abs(toNumber(capital.smallNetInflow)),
      1
    );
    return {
      stock: [{
        symbol: symbol,
        stockday: items.map(function (item) {
          return {
            date: toDateNumber(item.date),
            capital: { a: floatCapital, total: floatCapital, arate: 1 }
          };
        })
      }]
    };
  }

  function buildTradeDetailResponse(symbol, quote, tradeDetail) {
    var trades = Array.isArray(tradeDetail.trades) ? tradeDetail.trades : [];
    var yClose = toNumber(quote.open, quote.price);
    var date = toDateNumber(tradeDetail.timestamp || quote.timestamp || new Date());
    return {
      symbol: symbol, name: quote.name || symbol, ver: 2.0,
      data: trades.map(function (item) {
        var flag = 0;
        if (item.side === 'buy') flag = 1;
        else if (item.side === 'sell') flag = 2;
        return [
          date, toTimeNumber(item.time, true), yClose,
          toNumber(item.price, yClose), toNumber(item.volume),
          parseFloat((toNumber(item.price, yClose) * toNumber(item.volume)).toFixed(2)),
          flag
        ];
      })
    };
  }

  function buildNewsResponse(symbol, news) {
    var items = Array.isArray(news.items) ? news.items : [];
    return {
      symbol: symbol,
      list: items.map(function (item, index) {
        return {
          date: toDateNumber(item.publishedAt),
          title: item.title || symbol + ' 新闻 ' + (index + 1),
          url: item.url || '', type: 1,
          ID: item.id || symbol + '-news-' + (index + 1)
        };
      })
    };
  }

  function buildAnnouncementsResponse(symbol, announcements) {
    var items = Array.isArray(announcements.items) ? announcements.items : [];
    return {
      symbol: symbol,
      report: items.map(function (item, index) {
        return {
          releasedate: toDateNumber(item.publishedAt),
          time: toTimeNumber(item.publishedAt, false),
          title: item.title || symbol + ' 公告 ' + (index + 1),
          url: item.url || ''
        };
      })
    };
  }

  function createDataSource() {
    return {
      Explain: '后端 API 数据',

      RunRequest: function (data, callback, requestFn, option) {
        var requestOption = option || {};
        data.PreventDefault = true;
        var safeCallback = function (response) {
          try { callback(response); }
          catch (e) { console.warn('[HQDataSource] callback error', e && e.message); }
        };
        requestFn()
          .then(function (response) { safeCallback(response); })
          .catch(function (error) {
            console.warn('[HQDataSource]', data.Name, error && (error.message || error));
            safeCallback(requestOption.emptyResponse || null);
          });
      },

      RequestStockListData: function (data, callback) {
        return this.RunRequest(
          data, callback,
          function () {
            return apiGet('/watchlist').then(function (response) {
              return {
                data: (response.items || []).map(function (item) {
                  var name = item.displayName || item.symbol;
                  return [item.symbol, appendMarketLabel(name, item.symbol, item.market)];
                })
              };
            });
          },
          { allowFallback: false, emptyResponse: { data: [] } }
        );
      },

      RequestMemberListData: function (data, callback) {
        var symbol = data.Request && data.Request.Data ? data.Request.Data.symbol : '';
        return this.RunRequest(
          data, callback,
          function () {
            return apiGet('/watchlist').then(function (response) {
              return {
                code: 0, symbol: symbol, name: symbol,
                data: (response.items || []).map(function (item) { return item.symbol; })
              };
            });
          },
          { allowFallback: false, emptyResponse: { code: 0, symbol: symbol, name: symbol, data: [] } }
        );
      },

      RequestReportStockData: function (data, callback) {
        var stocks = (data.Request && data.Request.Data && data.Request.Data.stocks) ? data.Request.Data.stocks : [];
        return this.RunRequest(
          data, callback,
          function () {
            return Promise.all(stocks.map(function (item) {
              var symbol = getRequestSymbol(item);
              if (!symbol) return Promise.resolve(null);
              return apiGet('/stock', { symbol: symbol }).then(function (quote) { return createReportRow(quote); });
            })).then(function (rows) {
              return { code: 0, data: rows.filter(function (item) { return !!item; }) };
            });
          }
        );
      },

      _fetchMinuteWithAuction: function (symbol, callcation) {
        return Promise.all([
          apiGet('/stock', { symbol: symbol }),
          apiGet('/minute', { symbol: symbol }),
          (callcation.Before || callcation.After) ? apiGet('/callauction', { symbol: symbol }) : Promise.resolve(null)
        ]).then(function (response) {
          var quote = response[0]; var minute = response[1]; var callauction = response[2];
          var auctionData = null;
          if (callauction) {
            auctionData = {};
            if (callcation.Before) auctionData.before = createCallAuctionPayload(callauction, toDateNumber(minute.timestamp || quote.timestamp || new Date()), true, toNumber(quote.open, quote.price));
            if (callcation.After) auctionData.after = createCallAuctionPayload(callauction, toDateNumber(minute.timestamp || quote.timestamp || new Date()), false, toNumber(quote.price, quote.open));
          }
          return { quote: quote, minute: minute, auctionData: auctionData };
        });
      },

      RequestMinuteData: function (data, callback) {
        var self = this;
        var symbol = data.Request.Data.symbol[0];
        var callcation = data.Request.Data.callcation || {};
        return this.RunRequest(data, callback, function () {
          return self._fetchMinuteWithAuction(symbol, callcation).then(function (r) {
            return buildSingleMinuteResponse(symbol, r.quote, r.minute, r.auctionData);
          });
        });
      },

      RequestHistoryMinuteData: function (data, callback) {
        var self = this;
        var symbol = data.Request.Data.symbol;
        var dayCount = data.Request.Data.daycount;
        var callcation = data.Request.Data.callcation || {};
        return this.RunRequest(data, callback, function () {
          return self._fetchMinuteWithAuction(symbol, callcation).then(function (r) {
            return buildHistoryMinuteResponse(symbol, r.quote, r.minute, dayCount, r.auctionData);
          });
        });
      },

      RequestHistoryData: function (data, callback) {
        var symbol = data.Request.Data.symbol;
        var period = getKLinePeriod(data.Request.Data.period);
        var isLongCycle = (period === 'day' || period === 'week' || period === 'month' || period === 'year');
        return this.RunRequest(data, callback, function () {
          return Promise.all([
            apiGet('/stock', { symbol: symbol }),
            apiGet('/kline', isLongCycle
              ? { symbol: symbol, period: period, allHistory: true }
              : { symbol: symbol, period: period, count: data.Request.Data.count || 200 })
          ]).then(function (response) {
            return buildKLineHistoryResponse(symbol, response[0], response[1]);
          });
        });
      },

      RequestRealtimeData: function (data, callback) {
        var symbol = data.Request.Data.symbol[0];
        var period = getKLinePeriod(data.Request.Data.period);
        return this.RunRequest(data, callback, function () {
          return Promise.all([
            apiGet('/stock', { symbol: symbol }),
            apiGet('/kline', { symbol: symbol, period: period, count: 2 })
          ]).then(function (response) {
            return buildKLineRealtimeResponse(symbol, response[0], response[1]);
          });
        });
      },

      RequestFlowCapitalData: function (data, callback) {
        var symbol = data.Request.Data.symbol[0];
        return this.RunRequest(data, callback, function () {
          return Promise.all([
            apiGet('/capital', { symbol: symbol }),
            apiGet('/kline', { symbol: symbol, period: 'day', count: 120 })
          ]).then(function (response) {
            return buildCapitalResponse(symbol, response[0], response[1]);
          });
        });
      },

      RequestHistoryMinuteKLineData: function (data, callback) {
        var symbol = data.Request.Data.symbol;
        var period = getKLinePeriod(data.Request.Data.period);
        var dayCount = data.Request.Data.count || 5;
        var barsPerDay = ({ '1m': 240, '5m': 48, '15m': 16, '30m': 8 })[period] || 48;
        var count = Math.min(dayCount * barsPerDay, 800);
        return this.RunRequest(data, callback, function () {
          return Promise.all([
            apiGet('/stock', { symbol: symbol }),
            apiGet('/kline', { symbol: symbol, period: period, count: count })
          ]).then(function (response) {
            return buildMinuteKLineHistoryResponse(symbol, response[0], response[1]);
          });
        });
      },

      RequestRealtimeMinuteKLineData: function (data, callback) {
        var symbol = data.Request.Data.symbol[0];
        var period = getKLinePeriod(data.Request.Data.period);
        return this.RunRequest(data, callback, function () {
          return Promise.all([
            apiGet('/stock', { symbol: symbol }),
            apiGet('/kline', { symbol: symbol, period: period, count: 2 })
          ]).then(function (response) {
            return buildMinuteKLineRealtimeResponse(symbol, response[0], response[1]);
          });
        });
      },

      RequestTradeDetailData: function (data, callback) {
        var symbol = data.Request.Data.symbol;
        return this.RunRequest(data, callback, function () {
          return Promise.all([
            apiGet('/stock', { symbol: symbol }),
            apiGet('/trade-detail', { symbol: symbol })
          ]).then(function (response) {
            return buildTradeDetailResponse(symbol, response[0], response[1]);
          });
        });
      },

      RequestNewsData: function (data, callback) {
        var symbol = data.Request.Symbol;
        return this.RunRequest(data, callback, function () {
          return apiGet('/news', { symbol: symbol }).then(function (response) {
            return buildNewsResponse(symbol, response);
          });
        });
      },

      RequestAnnouncementsData: function (data, callback) {
        var symbol = data.Request.Symbol;
        return this.RunRequest(data, callback, function () {
          return apiGet('/announcements', { symbol: symbol }).then(function (response) {
            return buildAnnouncementsResponse(symbol, response);
          });
        });
      },

      NetworkFilter: function (data, callback) {
        switch (data.Name) {
          case 'JSReportChartContainer::RequestStockListData':
            return this.RequestStockListData(data, callback);
          case 'JSReportChartContainer::RequestMemberListData':
            return this.RequestMemberListData(data, callback);
          case 'JSDealChartContainer::RequestStockData':
            return this.RequestReportStockData(data, callback);
          case 'MinuteChartContainer::RequestMinuteData':
            return this.RequestMinuteData(data, callback);
          case 'MinuteChartContainer::RequestHistoryMinuteData':
            return this.RequestHistoryMinuteData(data, callback);
          case 'KLineChartContainer::RequestHistoryData':
            return this.RequestHistoryData(data, callback);
          case 'KLineChartContainer::RequestRealtimeData':
            return this.RequestRealtimeData(data, callback);
          case 'KLineChartContainer::RequestFlowCapitalData':
            return this.RequestFlowCapitalData(data, callback);
          case 'KLineChartContainer::ReqeustHistoryMinuteData':
            return this.RequestHistoryMinuteKLineData(data, callback);
          case 'KLineChartContainer::RequestMinuteRealtimeData':
            return this.RequestRealtimeMinuteKLineData(data, callback);
          case 'KLineChartContainer::RequestTickData':
          case 'KLineChartContainer::RequestTickRealtimeData':
            return this.RequestTradeDetailData(data, callback);
          case 'NewsInfo::RequestData':
            return this.RequestNewsData(data, callback);
          case 'AnnouncementInfo::RequestData':
            return this.RequestAnnouncementsData(data, callback);
          default:
            return null;
        }
      }
    };
  }

  // ── Public surface ──────────────────────────────────────────────
  global.createHQChartDataSource = createDataSource;
  global.HQChartApi = {
    get: apiGet,
    post: apiPost,
    del: apiDelete,
    appendMarketLabel: appendMarketLabel
  };
})(window);
