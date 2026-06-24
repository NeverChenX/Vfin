import { describe, expect, it } from 'vitest';
import {
  parseTencentQuote,
  parseSinaQuote,
  parseTencentMinute,
  parseTencentKline,
  parseEastmoneyTradeDetail,
  parseEastmoneyAnnouncements,
  parseEastmoneyCapital
} from '../src/providers/live-mappers.js';

describe('live mappers', () => {
  it('parses tencent quote', () => {
    const raw = 'v_sh600000="1~浦发银行~600000~10.12~10.25~10.25~411518~0~0~10.12~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~~20260403161426~-0.13~-1.27~10.25~10.08~10.12/411518/417211984~";';
    const parsed = parseTencentQuote(raw);
    expect(parsed).toMatchObject({
      name: '浦发银行',
      code: '600000',
      now: 10.12,
      open: 10.25,
      high: 10.25,
      low: 10.08,
      volume: 411518,
      turnover: 417211984
    });
    expect(parsed.time).toBe('2026-04-03T16:14:26+08:00');
  });

  it('parses tencent quote market multiples', () => {
    const raw = 'v_sh600519="1~贵州茅台~600519~1215.00~1240.00~1235.00~57472~25106~32365~1215.00~123~1214.95~2~1214.88~1~1214.48~1~1214.40~1~1215.28~1~1215.96~1~1216.00~2~1218.00~1~1218.89~1~~20260618161404~-25.00~-2.02~1238.87~1211.22~1215.00/57472/7016713941~57472~701671~0.46~18.36~~1238.87~1211.22~5.67~15188.49~15188.49~";';
    const parsed = parseTencentQuote(raw);

    expect(parsed).toMatchObject({
      peTtm: 18.36,
      pb: 5.67
    });
  });

  it('parses tencent A-share market multiples from full quote payload', () => {
    const raw = 'v_sz000858="51~五 粮 液~000858~75.61~76.55~76.15~278774~128981~149793~75.60~3~75.59~46~75.58~154~75.57~97~75.56~132~75.61~30~75.62~69~75.63~32~75.64~1~75.65~59~~20260623120506~-0.94~-1.23~78.32~75.59~75.61/278774/2147269695~278774~214727~0.72~23.29~~78.32~75.59~3.57~2934.81~2934.88~2.29~84.21~68.90~2.03~241~77.03~9.10~32.78~~~0.38~214726.9695~0.0000~0~ ~GP-A~-28.63~-5.05~7.60~9.84~6.54~129.27~74.79~-5.44~-10.14~-25.39~3881513391~3881608005~38.68~-38.72~3881513391~~~-32.81~-0.15~~CNY~0~~75.51~175~";';
    const parsed = parseTencentQuote(raw);

    expect(parsed).toMatchObject({
      peTtm: 9.1,
      pb: 2.29,
    });
  });

  it('parses sina quote', () => {
    const raw = 'var hq_str_sh600000="浦发银行,10.250,10.250,10.120,10.250,10.080,10.120,10.130,41151821,417211984.000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-04-03,15:00:01,00,";';
    const parsed = parseSinaQuote(raw);
    expect(parsed).toMatchObject({
      name: '浦发银行',
      open: 10.25,
      prevClose: 10.25,
      now: 10.12,
      high: 10.25,
      low: 10.08,
      volume: 41151821,
      turnover: 417211984
    });
    expect(parsed.time).toBe('2026-04-03T15:00:01+08:00');
  });

  it('parses tencent minute', () => {
    const raw = {
      data: {
        data: ['0930 10.25 640 656000.00', '0931 10.20 7499 7666904.00'],
        date: '20260403'
      }
    };
    const parsed = parseTencentMinute(raw);
    expect(parsed.points[0]).toMatchObject({ time: '09:30', price: 10.25, volume: 640, avgPrice: 10.25 });
  });

  it('parses tencent kline', () => {
    const raw = {
      day: [['2026-04-03', '10.250', '10.120', '10.250', '10.080', '411518.000']]
    };
    const parsed = parseTencentKline(raw, 'day');
    expect(parsed.list[0]).toMatchObject({
      date: '2026-04-03',
      open: 10.25,
      close: 10.12,
      high: 10.25,
      low: 10.08,
      volume: 411518
    });
  });

  it('parses tencent kline string rows', () => {
    const raw = {
      day: ['2026-04-03,10.250,10.120,10.250,10.080,411518.000,417211984.00']
    };
    const parsed = parseTencentKline(raw, 'day');
    expect(parsed.list[0]).toMatchObject({
      date: '2026-04-03',
      open: 10.25,
      close: 10.12,
      high: 10.25,
      low: 10.08,
      volume: 411518,
      amount: 417211984
    });
  });

  it('parses tencent minute kline datetime', () => {
    const raw = {
      m1: ['202604031431,5.20,5.20,5.21,5.20,41174.00']
    };
    const parsed = parseTencentKline(raw, 'm1');
    expect(parsed.list[0]).toMatchObject({
      date: '2026-04-03',
      time: '14:31',
      open: 5.2,
      close: 5.2,
      high: 5.21,
      low: 5.2,
      volume: 41174
    });
  });

  it('parses eastmoney trade detail', () => {
    const raw = {
      details: ['14:56:35,10.13,153,26,2', '14:56:38,10.12,180,32,1']
    };
    const parsed = parseEastmoneyTradeDetail(raw);
    expect(parsed.records[0]).toEqual(['14:56:35', 10.13, 153, 'sell']);
    expect(parsed.records[1]).toEqual(['14:56:38', 10.12, 180, 'buy']);
  });

  it('parses eastmoney announcements', () => {
    const raw = {
      list: [{ art_code: 'AN1', title: '公告', notice_date: '2026-04-03 00:00:00', codes: [{ stock_code: '600000' }] }]
    };
    const parsed = parseEastmoneyAnnouncements(raw);
    expect(parsed.items[0]).toMatchObject({ id: 'AN1', title: '公告' });
  });

  it('parses eastmoney capital', () => {
    const raw = { klines: ['2026-04-03,1,2,3,4,5'] };
    const parsed = parseEastmoneyCapital(raw);
    expect(parsed).toMatchObject({
      mainNetInflow: 1,
      largeNetInflow: 2,
      mediumNetInflow: 3,
      smallNetInflow: 4
    });
  });
});
