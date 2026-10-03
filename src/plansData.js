// A billing option = "Every <interval> <unit>" + an amount.
// Same shape as Razorpay's plan form (Billing Frequency + Billing Amount).
export const UNITS = [
  { value: 'week', singular: 'Week', plural: 'Week(s)' },
  { value: 'month', singular: 'Month', plural: 'Month(s)' },
  { value: 'year', singular: 'Year', plural: 'Year(s)' },
];

// Friendly name for a frequency: Monthly, Quarterly, Every 2 weeks, ...
export const frequencyLabel = ({ interval, unit }) => {
  const n = Number(interval);
  if (unit === 'week') return n === 1 ? 'Weekly' : `Every ${n} weeks`;
  if (unit === 'year') return n === 1 ? 'Yearly' : `Every ${n} years`;
  const named = { 1: 'Monthly', 3: 'Quarterly', 6: 'Half-yearly', 12: 'Yearly' };
  return named[n] ?? `Every ${n} months`;
};

// Length in days, used to sort options shortest → longest and to spot
// duplicates (12 months and 1 year count as the same frequency).
const lengthKey = ({ interval, unit }) => {
  const n = Number(interval);
  if (unit === 'week') return n * 7;
  if (unit === 'month') return n * 30;
  return n * 360; // year
};
export const sameFrequency = (a, b) => lengthKey(a) === lengthKey(b);

export const sortPrices = (prices) => [...prices].sort((a, b) => lengthKey(a) - lengthKey(b));

// ₹1,499 (Indian digit grouping: ₹1,49,999)
export const formatRupees = (amount) =>
  '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// "3 options · Monthly, Quarterly, Yearly"
export const optionsSummary = (prices) => {
  const n = prices.length;
  const names = sortPrices(prices).map(frequencyLabel).join(', ');
  return `${n} ${n === 1 ? 'option' : 'options'} · ${names}`;
};

// Sample plans so the list isn't empty on first load. Newest first.
export const SAMPLE_PLANS = [
  {
    id: 'p3',
    name: 'Gold gym',
    description: 'Full gym access, all branches',
    createdAt: '2026-09-30T00:58:33',
    prices: [
      { interval: 1, unit: 'month', amount: 1499 },
      { interval: 3, unit: 'month', amount: 3999 },
      { interval: 1, unit: 'year', amount: 14999 },
    ],
  },
  {
    id: 'p2',
    name: 'Yoga classes',
    description: '',
    createdAt: '2026-09-28T16:10:00',
    prices: [
      { interval: 1, unit: 'month', amount: 999 },
      { interval: 6, unit: 'month', amount: 5499 },
    ],
  },
  {
    id: 'p1',
    name: 'Swimming',
    description: '',
    createdAt: '2026-09-25T09:02:00',
    prices: [{ interval: 1, unit: 'month', amount: 1200 }],
  },
];
