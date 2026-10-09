import { Box, Text, Heading, IconButton, SearchInput, ArrowLeftIcon, CloseIcon } from '@razorpay/blade/components';
import { formatRupees, frequencyLabel } from './plansData.js';
import { monthReport, isRazorpayPayment, fmtDay } from './membersData.js';
import { Avatar } from './MemberListScreen.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function FilterChips({ label, options, value, onChange }) {
  return (
    <div className="filter-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value ?? 'all'}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Every payment this month, grouped by day, filtered by how it was paid
 * (Razorpay or cash/UPI) and searchable by name. Opens from the Collected card
 * (all plans) or from a plan under By plan (shown as a removable tag).
 * `view` = { plan, source, query }, kept by the parent so filters survive a
 * trip to a member's details and back.
 */
export default function PaymentsScreen({ members, view = {}, onViewChange, onBack, onOpenMember }) {
  const plan = view.plan ?? null; // null = all plans
  const source = view.source ?? 'all'; // 'all' | 'razorpay' | 'recorded'
  const query = view.query ?? '';
  const r = monthReport(members);
  const month = MONTHS[new Date().getMonth()];

  const planOf = (x) => x.payment.planName ?? x.member.planName;
  const q = query.trim().toLowerCase();
  const inPlan = r.payments.filter(
    (x) => (!plan || planOf(x) === plan) && (!q || x.member.name.toLowerCase().includes(q)),
  );
  const rz = inPlan.filter((x) => isRazorpayPayment(x.payment));
  const shown = source === 'razorpay' ? rz : source === 'recorded' ? inPlan.filter((x) => !isRazorpayPayment(x.payment)) : inPlan;
  const total = shown.reduce((s, x) => s + x.payment.amount, 0);

  // Group by day, newest first
  const days = [];
  for (const x of shown) {
    const key = fmtDay(x.payment.date);
    if (days.at(-1)?.key !== key) days.push({ key, items: [] });
    days.at(-1).items.push(x);
  }

  const summary = [
    `${shown.length} ${shown.length === 1 ? 'payment' : 'payments'}`,
    plan,
    source === 'razorpay' ? 'via Razorpay' : source === 'recorded' ? 'cash/UPI' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="full-screen">
      <Box display="flex" alignItems="center" gap="spacing.2" paddingX="spacing.3" paddingY="spacing.3">
        <IconButton icon={ArrowLeftIcon} size="large" accessibilityLabel="Back" onClick={onBack} />
        <Heading size="medium" weight="semibold">
          {month} payments
        </Heading>
      </Box>

      <div className="full-screen-body">
        <Box marginBottom="spacing.3">
          <SearchInput
            accessibilityLabel="Search payments by name"
            placeholder="Search by name"
            value={query}
            onChange={({ value }) => onViewChange({ ...view, query: value ?? '' })}
            onClearButtonClick={() => onViewChange({ ...view, query: '' })}
          />
        </Box>

        {/* Came from a plan under By plan: show it, tap ✕ to see all plans */}
        {plan && (
          <button className="plan-tag" onClick={() => onViewChange({ ...view, plan: null })} aria-label={`Remove ${plan} filter`}>
            {plan}
            <CloseIcon size="small" color="interactive.icon.primary.normal" />
          </button>
        )}

        <FilterChips
          label="Paid through"
          value={source}
          onChange={(s) => onViewChange({ ...view, source: s })}
          options={[
            { value: 'all', label: `All ${inPlan.length}` },
            { value: 'razorpay', label: `Razorpay ${rz.length}` },
            { value: 'recorded', label: `Cash/UPI ${inPlan.length - rz.length}` },
          ]}
        />

        <Box display="flex" justifyContent="space-between" marginTop="spacing.2" marginBottom="spacing.1">
          <Text size="small" color="surface.text.gray.muted">
            {summary}
          </Text>
          <Text size="small" weight="semibold" color="surface.text.gray.normal">
            {formatRupees(total)}
          </Text>
        </Box>

        {days.map((d) => (
          <div key={d.key}>
            <div className="pay-day">{d.key}</div>
            {d.items.map(({ member, payment }, i) => {
              const isRz = isRazorpayPayment(payment);
              return (
                <button
                  key={`${member.id}-${i}`}
                  className="pay-row"
                  onClick={() => onOpenMember(member.id)}
                  aria-label={`${member.name} paid ${formatRupees(payment.amount)}`}
                >
                  <Avatar name={member.name} size={34} />
                  <span className="pay-main">
                    <span className="pay-name">{member.name}</span>
                    <span className="pay-sub">
                      {payment.planName ?? member.planName} · {frequencyLabel(member.price)}
                      <span className={`pay-tag${isRz ? ' is-razorpay' : ''}`}>{isRz ? 'Razorpay' : payment.method}</span>
                    </span>
                  </span>
                  <span className="pay-amount">{formatRupees(payment.amount)}</span>
                </button>
              );
            })}
          </div>
        ))}

        {shown.length === 0 && (
          <Box paddingY="spacing.8">
            <Text size="medium" color="surface.text.gray.muted" textAlign="center">
              {q ? `No payments from "${query.trim()}" this month.` : 'No payments match these filters this month.'}
            </Text>
          </Box>
        )}
      </div>
    </div>
  );
}
