import { useState } from 'react';
import {
  Box,
  Text,
  Heading,
  Button,
  IconButton,
  TextInput,
  Checkbox,
  Dropdown,
  SelectInput,
  DropdownOverlay,
  ActionList,
  ActionListItem,
  ArrowLeftIcon,
  SparklesIcon,
} from '@razorpay/blade/components';
import { formatRupees, frequencyLabel, sameFrequency } from './plansData.js';
import { normalisePhone, fmtPhone, toInputDate, fromInputDate, today } from './membersData.js';

const optionKey = (p) => `${p.interval}-${p.unit}`;

function FieldLabel({ children, required }) {
  return (
    <Text size="small" weight="semibold" color="surface.text.gray.subtle">
      {children}
      {required && <span style={{ color: '#d92d20' }}>*</span>}
    </Text>
  );
}

function FieldError({ children }) {
  return children ? (
    <Box marginTop="spacing.2">
      <Text size="small" color="feedback.text.negative.intense">
        {children}
      </Text>
    </Box>
  ) : null;
}

/**
 * One form for "New member", "Edit member" and members filled in by voice.
 * - initialMember: edit this member
 * - prefill + voiceTranscript: a new member whose fields the AI filled in
 * - neither: a blank new member
 */
export default function MemberFormScreen({ plans, initialMember, prefill, voiceTranscript, onCancel, onSave }) {
  const isEdit = Boolean(initialMember);
  const startPlanId = initialMember?.planId ?? prefill?.planId ?? '';
  const startPrice = initialMember?.price ?? prefill?.billing ?? null;

  const [name, setName] = useState(initialMember?.name ?? prefill?.name ?? '');
  const [phone, setPhone] = useState(
    initialMember ? fmtPhone(initialMember.phone) : prefill?.phone ? (normalisePhone(prefill.phone) ? fmtPhone(normalisePhone(prefill.phone)) : prefill.phone) : '',
  );
  const [email, setEmail] = useState(initialMember?.email ?? prefill?.email ?? '');
  const [planId, setPlanId] = useState(plans.some((p) => p.id === startPlanId) ? startPlanId : '');
  const [option, setOption] = useState(startPrice ? optionKey(startPrice) : '');
  const [startDate, setStartDate] = useState(
    toInputDate(initialMember?.periodStart ?? (prefill?.startDate ? fromInputDate(prefill.startDate) : today())),
  );
  const [alreadyPaid, setAlreadyPaid] = useState(prefill?.alreadyPaid ?? (isEdit ? false : true));
  // For AI-filled members, show missing mandatory fields in red straight away
  const [triedSubmit, setTriedSubmit] = useState(Boolean(prefill));

  const plan = plans.find((p) => p.id === planId);
  // If the plan was edited, match the saved option by frequency
  const selectedPrice = plan?.prices.find(
    (p) => optionKey(p) === option || (startPrice && option === optionKey(startPrice) && sameFrequency(p, startPrice)),
  );

  /* ---- Validation ---- */
  const errors = {
    name: name.trim() ? null : 'Enter the member’s name',
    phone: !phone.trim()
      ? 'Enter a phone number'
      : normalisePhone(phone)
        ? null
        : 'Enter a valid 10-digit Indian mobile number',
    email: email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email, or leave it empty' : null,
    plan: plan
      ? null
      : prefill?.planSaid && !prefill?.planId && !planId
        ? `No plan called "${prefill.planSaid}". Pick one, or create it in Plans first.`
        : 'Pick a plan',
    option: plan && !selectedPrice ? 'Pick a billing option' : null,
    startDate: startDate ? null : 'Pick a start date',
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const show = (key) => (triedSubmit ? errors[key] : null);

  const handleSave = () => {
    setTriedSubmit(true);
    if (hasErrors) return;
    onSave({
      name: name.trim(),
      phone: normalisePhone(phone),
      email: email.trim().toLowerCase(),
      plan,
      price: selectedPrice,
      startDate: fromInputDate(startDate),
      paid: alreadyPaid,
    });
  };

  const showPaidBox = !isEdit || !initialMember.paid;

  return (
    <div className="full-screen">
      <Box display="flex" alignItems="center" gap="spacing.2" paddingX="spacing.3" paddingY="spacing.3">
        <IconButton icon={ArrowLeftIcon} size="large" accessibilityLabel="Back" onClick={onCancel} />
        <Heading size="medium" weight="semibold">
          {isEdit ? 'Edit member' : 'New member'}
        </Heading>
      </Box>

      <div className="full-screen-body">
        {voiceTranscript && (
          <div className="voice-banner">
            <Box display="flex" gap="spacing.2" alignItems="flex-start">
              <Box paddingTop="spacing.1">
                <SparklesIcon size="small" color="interactive.icon.primary.normal" />
              </Box>
              <Box>
                <Text size="small" weight="semibold" color="interactive.text.primary.normal">
                  {hasErrors
                    ? "Filled from your voice note. Add what's missing in red."
                    : 'Filled from your voice note. Check the phone number.'}
                </Text>
                <Text size="small" color="surface.text.gray.muted">
                  You said: "{voiceTranscript}"
                </Text>
              </Box>
            </Box>
          </div>
        )}

        <Box display="flex" flexDirection="column" gap="spacing.5">
          <TextInput
            label="Name"
            necessityIndicator="required"
            placeholder="Meera Iyer"
            value={name}
            onChange={({ value }) => setName(value ?? '')}
            validationState={show('name') ? 'error' : 'none'}
            errorText={show('name') ?? undefined}
          />
          <TextInput
            label="Phone"
            necessityIndicator="required"
            type="telephone"
            prefix="+91"
            placeholder="98765 43210"
            value={phone.replace(/^\+91\s?/, '')}
            onChange={({ value }) => setPhone(value ?? '')}
            validationState={show('phone') ? 'error' : 'none'}
            errorText={show('phone') ?? undefined}
          />
          <TextInput
            label="Email"
            necessityIndicator="optional"
            type="email"
            placeholder="meera@example.com"
            value={email}
            onChange={({ value }) => setEmail(value ?? '')}
            validationState={show('email') ? 'error' : 'none'}
            errorText={show('email') ?? undefined}
          />

          {/* Plan */}
          <Box>
            <FieldLabel required>Plan</FieldLabel>
            <Box marginTop="spacing.2">
              <Dropdown selectionType="single">
                <SelectInput
                  accessibilityLabel="Plan"
                  placeholder="Pick a plan"
                  value={planId}
                  validationState={show('plan') ? 'error' : 'none'}
                  onChange={({ values }) => {
                    if (!values[0] || values[0] === planId) return;
                    setPlanId(values[0]);
                    const next = plans.find((p) => p.id === values[0]);
                    // A plan with one option needs no extra tap
                    setOption(next?.prices.length === 1 ? optionKey(next.prices[0]) : '');
                  }}
                />
                <DropdownOverlay>
                  <ActionList>
                    {plans.map((p) => (
                      <ActionListItem key={p.id} title={p.name} value={p.id} />
                    ))}
                  </ActionList>
                </DropdownOverlay>
              </Dropdown>
            </Box>
            <FieldError>{show('plan')}</FieldError>
            {plans.length === 0 && (
              <Box marginTop="spacing.2">
                <Text size="small" color="surface.text.gray.muted">
                  You don't have any plans yet. Create one in the Plans tab first.
                </Text>
              </Box>
            )}
          </Box>

          {/* Billing option: tap a row */}
          {plan && (
            <Box>
              <FieldLabel required>Billing option</FieldLabel>
              <div className="option-list" role="radiogroup" aria-label="Billing option">
                {plan.prices.map((p) => {
                  const on = selectedPrice === p;
                  return (
                    <button
                      key={optionKey(p)}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`option-row${on ? ' is-on' : ''}${show('option') ? ' has-error' : ''}`}
                      onClick={() => setOption(optionKey(p))}
                    >
                      <span>{frequencyLabel(p)}</span>
                      <span className="option-price">{formatRupees(p.amount)}</span>
                    </button>
                  );
                })}
              </div>
              <FieldError>{show('option')}</FieldError>
            </Box>
          )}

          {/* Start date */}
          <Box>
            <FieldLabel required>Start date</FieldLabel>
            <input
              type="date"
              className={`date-input${show('startDate') ? ' has-error' : ''}`}
              aria-label="Start date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <FieldError>{show('startDate')}</FieldError>
          </Box>

          {showPaidBox && (
            <Checkbox
              isChecked={alreadyPaid}
              onChange={({ isChecked }) => setAlreadyPaid(isChecked)}
              helpText={
                alreadyPaid
                  ? 'Member is added as active.'
                  : 'Member is added with payment pending.'
              }
            >
              Already paid (cash or UPI)
            </Checkbox>
          )}
        </Box>
      </div>

      <div className="full-screen-footer">
        <Box display="flex" gap="spacing.3">
          <div style={{ flex: 1 }} className="rzp-blue-btn">
            <Button size="large" isFullWidth onClick={handleSave}>
              {isEdit ? 'Save changes' : 'Add member'}
            </Button>
          </div>
          <Box flex="1">
            <Button size="large" variant="secondary" isFullWidth onClick={onCancel}>
              Cancel
            </Button>
          </Box>
        </Box>
      </div>
    </div>
  );
}
