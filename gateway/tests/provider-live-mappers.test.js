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
    expect(parsed.time).toBe('2026-04-03T16:14:26.000Z');
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
    expect(parsed.time).toBe('2026-04-03T15:00:01.000Z');
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
