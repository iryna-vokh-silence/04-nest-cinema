import { isCalendarDate } from './is-calendar-date.decorator';

describe('isCalendarDate', () => {
  it('accepts real dates in YYYY-MM-DD format', () => {
    expect(isCalendarDate('2030-01-15')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
  });

  it('rejects wrong formats and impossible dates', () => {
    expect(isCalendarDate('2030-1-15')).toBe(false);
    expect(isCalendarDate('15-01-2030')).toBe(false);
    expect(isCalendarDate('2030-02-30')).toBe(false);
    expect(isCalendarDate('2029-02-29')).toBe(false);
    expect(isCalendarDate(20300115)).toBe(false);
  });
});
