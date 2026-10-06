import { useState } from 'react';
import { Box, Text, Heading, Button, LinkIcon, ChevronRightIcon, EditIcon } from '@razorpay/blade/components';
import { formatRupees, frequencyLabel, sameFrequency } from './plansData.js';
import {
  memberStatus,
  periodAfterPayment,
  fmtDay,
  sentAgo,
  today,
  toInputDate,
  fromInputDate,
} from './membersData.js';

const sameDay = (a, b) => toInputDate(a) === toInputDate(b);
const optionKey = (p) => `${p.interval}-${p.unit}`;

// The plan a member is on right now, in the shape the renewal panel uses
export const currentPlanOf = (m) => ({ planId: m.planId, planName: m.planName, price: m.price });
export const isPlanChange = (m, plan) =>
  plan.planId !== m.planId || !sameFrequency(plan.price, m.price) || plan.price.amount !== m.price.amount;

/* ---------- Change plan (inside the renewal panel) ---------- */

function PlanPicker({ plans, member, value, onDone, onCancel }) {
  const [planId, setPlanId] = useState(plans.some((p) => p.id === value.planId) ? value.planId : '');
  const [option, setOption] = useState(planId ? optionKey(value.price) : '');
  const plan = plans.find((p) => p.id === planId);
  const price = plan?.prices.find((p) => optionKey(p) === option);
  const period = price ? periodAfterPayment(member, today(), price) : null;

  return (
    <>
      <Heading size="medium" weight="semibold">
        Change plan
      </Heading>
      <Text size="small" color="surface.text.gray.muted">
        Applies from this {member.paid ? 'renewal' : 'payment'}. They switch once they've paid.
      </Text>

      <Box marginTop="spacing.4">
        <Text size="small" weight="semibold" color="surface.text.gray.normal">
          Plan
        </Text>
        <div className="plan-pills" role="radiogroup" aria-label="Plan">
          {plans.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={p.id === planId}
              className={p.id === planId ? 'is-on' : ''}
              onClick={() => {
                setPlanId(p.id);
                // Keep the same billing frequency if the new plan has it
                const same = p.prices.find((x) => price && sameFrequency(x, price));
                setOption(same ? optionKey(same) : p.prices.length === 1 ? optionKey(p.prices[0]) : '');
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Box>

      {plan && (
        <Box marginTop="spacing.4">
          <Text size="small" weight="semibold" color="surface.text.gray.normal">
            Billing
          </Text>
          <div className="option-list" role="radiogroup" aria-label="Billing option">
            {plan.prices.map((p) => {
              const on = optionKey(p) === option;
              return (
                <button
                  key={optionKey(p)}
                  role="radio"
                  aria-checked={on}
                  className={`option-row${on ? ' is-on' : ''}`}
                  onClick={() => setOption(optionKey(p))}
                >
                  <span>{frequencyLabel(p)}</span>
                  <span className="option-price">{formatRupees(p.amount)}</span>
                </button>
              );
            })}
          </div>
        </Box>
      )}

      {period && (
        <div className="cash-preview">
          Next period: {fmtDay(period.start)} – {fmtDay(period.end)} · {formatRupees(price.amount)}
        </div>
      )}

      <Box marginTop="spacing.5" display="flex" gap="spacing.3">
        <Box flex="1">
          <Button variant="secondary" isFullWidth onClick={onCancel}>
            Cancel
          </Button>
        </Box>
        <div style={{ flex: 1 }} className="rzp-blue-btn">
          <Button
            isFullWidth
            isDisabled={!price}
            onClick={() => onDone({ planId: plan.id, planName: plan.name, price: { ...price } })}
          >
            Done
          </Button>
        </div>
      </Box>
    </>
  );
}

/* ---------- Renew: plan card + "link or cash?" ---------- */

/**
 * Opens from Renew / Send link / Collect payment. Shows the plan for the next
 * period (✎ Edit to change it, only here) and asks how they're paying.
 */
export function PayChoiceSheet({ member, plans, onLink, onCash, onClose }) {
  const [plan, setPlan] = useState(currentPlanOf(member));
  const [editing, setEditing] = useState(false);
  const pending = memberStatus(member) === 'pending';
  const changed = isPlanChange(member, plan);
  const period = periodAfterPayment(member, today(), plan.price);
  const amount = formatRupees(plan.price.amount);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={pending ? 'Collect payment' : 'Renew'}>
        <div className="sheet-handle" />
        {editing ? (
          <PlanPicker
            plans={plans}
            member={member}
            value={plan}
            onCancel={() => setEditing(false)}
            onDone={(p) => {
              setPlan(p);
              setEditing(false);
            }}
          />
        ) : (
          <>
            <Heading size="medium" weight="semibold">
              {pending ? `Payment from ${member.name}` : `Renew ${member.name}`}
            </Heading>

            {/* Plan for the next period, with Edit at the top right */}
            <div className={`renew-plan${changed ? ' is-changed' : ''}`}>
              <button className="renew-plan-edit" onClick={() => setEditing(true)} aria-label="Edit plan">
                <EditIcon size="small" color="interactive.icon.primary.normal" />
                Edit
              </button>
              <Text size="small" color="surface.text.gray.muted">
                {pending ? 'Plan' : 'Plan for next period'}
                {changed && <span className="changed-tag"> · changed</span>}
              </Text>
              <Text size="medium" weight="semibold" color="surface.text.gray.normal">
                {plan.planName} · {frequencyLabel(plan.price)}
              </Text>
              <div className="renew-plan-amount">{amount}</div>
              <Text size="small" color="surface.text.gray.muted">
                {fmtDay(period.start)} – {fmtDay(period.end)}
                {changed && ` · was ${frequencyLabel(member.price)} ${formatRupees(member.price.amount)}`}
              </Text>
            </div>

            <Box marginTop="spacing.3" display="flex" flexDirection="column" gap="spacing.3">
              <button className="choice-option" onClick={() => onLink(plan)}>
                <span className="choice-icon">
                  <LinkIcon size="medium" color="interactive.icon.primary.normal" />
                </span>
                <span className="choice-text">
                  <strong>{member.linkSent && !changed ? 'Resend payment link' : 'Send payment link'}</strong>
                  <span>
                    {changed
                      ? `Link for ${amount} · ${frequencyLabel(plan.price)}`
                      : member.linkSent
                        ? `Link sent ${sentAgo(member.linkSent.sentAt)}. Razorpay texts them a new one.`
                        : 'Razorpay texts them a link to pay online'}
                  </span>
                </span>
                <ChevronRightIcon size="medium" color="surface.icon.gray.muted" />
              </button>
              <button className="choice-option" onClick={() => onCash(plan)}>
                <span className="choice-icon">₹</span>
                <span className="choice-text">
                  <strong>Record cash payment</strong>
                  <span>{changed ? `${amount} paid in cash or UPI to your QR` : 'They paid you in cash or by UPI to your QR'}</span>
                </span>
                <ChevronRightIcon size="medium" color="surface.icon.gray.muted" />
              </button>
            </Box>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Record cash payment ---------- */

/** Record money paid directly to the owner (not through Razorpay). */
export default function CashPaymentSheet({ member, plan = currentPlanOf(member), onSave, onClose }) {
  const [paidOn, setPaidOn] = useState(toInputDate(today()));
  const [how, setHow] = useState('cash'); // 'cash' | 'upi'
  const date = paidOn ? fromInputDate(paidOn) : today();
  const { start, end, firstPayment, restarted } = periodAfterPayment(member, date, plan.price);
  const changed = isPlanChange(member, plan);
  const first = member.name.split(' ')[0];

  let preview;
  if (firstPayment) preview = <>Marks {first} as paid. Membership runs {fmtDay(start)} – <b>{fmtDay(end)}</b>.</>;
  else if (restarted)
    preview = (
      <>
        Membership ended on {fmtDay(member.periodEnd)}, so it restarts {sameDay(start, today()) ? <b>today</b> : <>on <b>{fmtDay(start)}</b></>}{' '}
        and runs till <b>{fmtDay(end)}</b>.
      </>
    );
  else
    preview = (
      <>
        Membership continues from {fmtDay(start)} and runs till <b>{fmtDay(end)}</b>.
      </>
    );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Record cash payment">
        <div className="sheet-handle" />
        <Heading size="medium" weight="semibold">
          Record cash payment
        </Heading>
        <Text size="small" color="surface.text.gray.muted">
          {member.name} · paid to you directly, not through Razorpay
        </Text>

        <Box marginTop="spacing.4">
          <Text size="small" weight="semibold" color="surface.text.gray.normal">
            Amount
          </Text>
          <div className="readonly-field">
            <strong>{formatRupees(plan.price.amount)}</strong> · {plan.planName} · {frequencyLabel(plan.price)}
          </div>
        </Box>

        <Box marginTop="spacing.4">
          <label htmlFor="paid-on">
            <Text size="small" weight="semibold" color="surface.text.gray.normal">
              Paid on
            </Text>
          </label>
          <input
            id="paid-on"
            className="date-input"
            type="date"
            value={paidOn}
            max={toInputDate(today())}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </Box>

        <Box marginTop="spacing.4">
          <Text size="small" weight="semibold" color="surface.text.gray.normal">
            How
          </Text>
          <div className="seg-toggle" role="radiogroup" aria-label="How they paid">
            <button role="radio" aria-checked={how === 'cash'} className={how === 'cash' ? 'is-on' : ''} onClick={() => setHow('cash')}>
              Cash
            </button>
            <button role="radio" aria-checked={how === 'upi'} className={how === 'upi' ? 'is-on' : ''} onClick={() => setHow('upi')}>
              UPI to my QR
            </button>
          </div>
        </Box>

        <div className="cash-preview">
          {preview}
          {changed && <> Switches to {plan.planName} · {frequencyLabel(plan.price)}.</>}
        </div>

        <Box marginTop="spacing.5" display="flex" gap="spacing.3">
          <Box flex="1">
            <Button variant="secondary" isFullWidth onClick={onClose}>
              Cancel
            </Button>
          </Box>
          <div style={{ flex: 1 }} className="rzp-blue-btn">
            <Button isFullWidth onClick={() => onSave({ date, method: how === 'cash' ? 'Cash' : 'UPI to your QR' })}>
              Save payment
            </Button>
          </div>
        </Box>
      </div>
    </div>
  );
}
