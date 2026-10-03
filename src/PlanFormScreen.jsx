import { useState } from 'react';
import {
  Box,
  Text,
  Heading,
  Button,
  IconButton,
  TextInput,
  TextArea,
  Dropdown,
  SelectInput,
  DropdownOverlay,
  ActionList,
  ActionListItem,
  ArrowLeftIcon,
  CloseIcon,
  PlusIcon,
  InfoIcon,
  SparklesIcon,
} from '@razorpay/blade/components';
import { UNITS, sameFrequency, frequencyLabel, formatRupees } from './plansData.js';

let rowCounter = 0;
// `orig` remembers which saved price a row started as (edit mode only),
// so we can tell what the merchant changed.
const newRow = (interval, unit, amount = '', orig = null) => ({
  key: `row-${rowCounter++}`,
  interval: String(interval),
  unit,
  amount: String(amount),
  orig,
});

// When "Add another billing option" is tapped, suggest the next common
// frequency the merchant hasn't used yet.
const SUGGESTIONS = [
  { interval: 1, unit: 'month' },
  { interval: 3, unit: 'month' },
  { interval: 6, unit: 'month' },
  { interval: 1, unit: 'year' },
  { interval: 1, unit: 'week' },
];
const nextSuggestion = (rows) =>
  SUGGESTIONS.find((s) => !rows.some((r) => sameFrequency(r, s))) ?? { interval: 1, unit: 'month' };

// Label with a red * like Blade's required fields, for the custom
// "Billing frequency" row (which is two inputs side by side)
function RequiredLabel({ children }) {
  return (
    <Text size="small" weight="semibold" color="surface.text.gray.subtle">
      {children}
      <span style={{ color: '#d92d20' }}>*</span>
    </Text>
  );
}

function InfoNote({ children }) {
  return (
    <Box display="flex" gap="spacing.2" alignItems="flex-start" marginTop="spacing.2">
      <Box paddingTop="spacing.1">
        <InfoIcon size="small" color="surface.icon.gray.muted" />
      </Box>
      <Text size="small" color="surface.text.gray.muted">
        {children}
      </Text>
    </Box>
  );
}

// One form for "New plan", "Edit plan" and plans filled in by voice.
// - initialPlan: edit this existing plan
// - prefill + voiceTranscript: a new plan whose fields the AI filled in
// - neither: a blank new plan
export default function PlanFormScreen({ initialPlan, prefill, voiceTranscript, onCancel, onSave }) {
  const isEdit = Boolean(initialPlan);
  const start = initialPlan ?? prefill;
  const [name, setName] = useState(start?.name ?? '');
  const [description, setDescription] = useState(start?.description ?? '');
  const [rows, setRows] = useState(() => {
    if (isEdit) return initialPlan.prices.map((p, i) => newRow(p.interval, p.unit, p.amount, i));
    if (prefill?.prices?.length) return prefill.prices.map((p) => newRow(p.interval, p.unit, p.amount ?? ''));
    return [newRow(1, 'month')];
  });
  // For AI-filled plans, show missing mandatory fields in red straight away
  const [triedSubmit, setTriedSubmit] = useState(Boolean(prefill));
  const [confirmChanges, setConfirmChanges] = useState(null); // list of price changes awaiting OK

  const updateRow = (key, changes) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  const removeRow = (key) => setRows((rs) => rs.filter((r) => r.key !== key));
  const addRow = () =>
    setRows((rs) => {
      const s = nextSuggestion(rs);
      return [...rs, newRow(s.interval, s.unit)];
    });

  /* ---- Validation (shown only after the first "Create plan" tap) ---- */
  const nameError = name.trim() === '' ? 'Enter a plan name' : null;
  const frequencyError = (row, index) => {
    const n = Number(row.interval);
    if (!Number.isInteger(n) || n < 1) return 'Enter a whole number, like 1 or 3';
    if (rows.slice(0, index).some((r) => sameFrequency(r, row)))
      return 'This billing frequency is already added above';
    return null;
  };
  const amountError = (row) => (!(Number(row.amount) > 0) ? 'Enter a billing amount' : null);
  const hasErrors = nameError || rows.some((r, i) => frequencyError(r, i) || amountError(r));

  const payload = () => ({
    name: name.trim(),
    description: description.trim(),
    prices: rows.map((r) => ({ interval: Number(r.interval), unit: r.unit, amount: Number(r.amount) })),
  });

  // Edit mode: which existing prices were changed or removed?
  // (Newly added options don't affect existing members, so they're not listed.)
  const priceChanges = () => {
    if (!isEdit) return [];
    const out = [];
    initialPlan.prices.forEach((old, i) => {
      const row =
        rows.find((r) => r.orig === i) ??
        // Removed and re-added with the same frequency counts as a price change
        rows.find((r) => r.orig === null && sameFrequency(r, old));
      const was = `${frequencyLabel(old)} ${formatRupees(old.amount)}`;
      if (!row) {
        out.push({ from: was, to: 'Removed' });
        return;
      }
      const now = { interval: Number(row.interval), unit: row.unit, amount: Number(row.amount) };
      if (!sameFrequency(old, now) || old.amount !== now.amount) {
        out.push({ from: was, to: `${frequencyLabel(now)} ${formatRupees(now.amount)}` });
      }
    });
    return out;
  };

  const handleSave = () => {
    setTriedSubmit(true);
    if (hasErrors) return;
    const changes = priceChanges();
    if (changes.length > 0) {
      setConfirmChanges(changes); // ask first
    } else {
      onSave(payload());
    }
  };

  return (
    <div className="full-screen">
      {/* Header */}
      <Box display="flex" alignItems="center" gap="spacing.2" paddingX="spacing.3" paddingY="spacing.3">
        <IconButton icon={ArrowLeftIcon} size="large" accessibilityLabel="Back" onClick={onCancel} />
        <Heading size="medium" weight="semibold">
          {isEdit ? 'Edit plan' : 'New plan'}
        </Heading>
      </Box>

      {/* Scrollable form */}
      <div className="full-screen-body">
        {voiceTranscript && (
          <div className="voice-banner">
            <Box display="flex" gap="spacing.2" alignItems="flex-start">
              <Box paddingTop="spacing.1">
                <SparklesIcon size="small" color="interactive.icon.primary.normal" />
              </Box>
              <Box>
                <Text size="small" weight="semibold" color="interactive.text.primary.normal">
                  {hasErrors ? 'Filled from your voice note. Add what\'s missing in red.' : 'Filled from your voice note. Check the details.'}
                </Text>
                <Text size="small" color="surface.text.gray.muted">
                  You said: "{voiceTranscript}"
                </Text>
              </Box>
            </Box>
          </div>
        )}
        <TextInput
          label="Plan name"
          necessityIndicator="required"
          placeholder="The name known to your customers"
          value={name}
          onChange={({ value }) => setName(value ?? '')}
          validationState={triedSubmit && nameError ? 'error' : 'none'}
          errorText={nameError ?? undefined}
        />

        <Box marginTop="spacing.5">
          <TextArea
            label="Plan description"
            necessityIndicator="optional"
            placeholder="What's included in this plan"
            numberOfLines={2}
            value={description}
            onChange={({ value }) => setDescription(value ?? '')}
          />
          <InfoNote>The plan name and description will appear on the invoice as entered above.</InfoNote>
        </Box>

        {/* One block per billing option */}
        <Box marginTop="spacing.6" display="flex" flexDirection="column" gap="spacing.4">
          {rows.map((row, index) => {
            const fErr = triedSubmit ? frequencyError(row, index) : null;
            const aErr = triedSubmit ? amountError(row) : null;
            return (
              <div key={row.key} className={rows.length > 1 ? 'billing-option' : undefined}>
                {rows.length > 1 && (
                  <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom="spacing.3">
                    <Text size="small" weight="semibold" color="surface.text.gray.muted">
                      BILLING OPTION {index + 1}
                    </Text>
                    <IconButton
                      icon={CloseIcon}
                      size="medium"
                      accessibilityLabel={`Remove billing option ${index + 1}`}
                      onClick={() => removeRow(row.key)}
                    />
                  </Box>
                )}

                {/* Billing frequency: Every [1] [Month(s)] */}
                <RequiredLabel>Billing frequency</RequiredLabel>
                <Box display="flex" alignItems="center" gap="spacing.3" marginTop="spacing.2">
                  <Text size="medium" color="surface.text.gray.normal">
                    Every
                  </Text>
                  <Box width="64px">
                    <TextInput
                      accessibilityLabel="Billing interval"
                      type="number"
                      value={row.interval}
                      onChange={({ value }) => updateRow(row.key, { interval: value ?? '' })}
                      validationState={fErr ? 'error' : 'none'}
                    />
                  </Box>
                  <Box flex="1">
                    <Dropdown selectionType="single">
                      <SelectInput
                        accessibilityLabel="Billing period"
                        value={row.unit}
                        onChange={({ values }) => values[0] && updateRow(row.key, { unit: values[0] })}
                      />
                      <DropdownOverlay>
                        <ActionList>
                          {UNITS.map((u) => (
                            <ActionListItem key={u.value} title={u.plural} value={u.value} />
                          ))}
                        </ActionList>
                      </DropdownOverlay>
                    </Dropdown>
                  </Box>
                </Box>
                {fErr && (
                  <Box marginTop="spacing.2">
                    <Text size="small" color="feedback.text.negative.intense">
                      {fErr}
                    </Text>
                  </Box>
                )}

                {/* Billing amount: ₹ [100.00] per unit */}
                <Box marginTop="spacing.4">
                  <TextInput
                    label="Billing amount"
                    necessityIndicator="required"
                    type="number"
                    prefix="₹"
                    suffix="per unit"
                    placeholder="100.00"
                    value={row.amount}
                    onChange={({ value }) => updateRow(row.key, { amount: value ?? '' })}
                    validationState={aErr ? 'error' : 'none'}
                    errorText={aErr ?? undefined}
                  />
                </Box>
              </div>
            );
          })}
        </Box>

        <InfoNote>
          You can change billing amounts and frequencies later. Changes apply from each member's next
          billing cycle.
        </InfoNote>

        <Box marginTop="spacing.4">
          <Button variant="tertiary" icon={PlusIcon} iconPosition="left" onClick={addRow}>
            Add another billing option
          </Button>
        </Box>
      </div>

      {/* Footer: Create plan + Cancel side by side, like the dashboard */}
      <div className="full-screen-footer">
        <Box display="flex" gap="spacing.3">
          <div style={{ flex: 1 }} className="rzp-blue-btn">
            <Button size="large" isFullWidth onClick={handleSave}>
              {isEdit ? 'Save changes' : 'Create plan'}
            </Button>
          </div>
          <Box flex="1">
            <Button size="large" variant="secondary" isFullWidth onClick={onCancel}>
              Cancel
            </Button>
          </Box>
        </Box>
      </div>

      {/* Edit mode: confirm price changes before saving */}
      {confirmChanges && (
        <div className="sheet-backdrop" onClick={() => setConfirmChanges(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Confirm price changes">
            <div className="sheet-handle" />
            <Heading size="medium" weight="semibold">
              Update billing for {name.trim()}?
            </Heading>

            <Box marginTop="spacing.4" display="flex" flexDirection="column" gap="spacing.3">
              {confirmChanges.map((c, i) => (
                <Box key={i}>
                  <Text size="small" color="surface.text.gray.muted">
                    {c.from}
                  </Text>
                  <Text size="medium" weight="semibold" color="surface.text.gray.normal">
                    → {c.to}
                  </Text>
                </Box>
              ))}
            </Box>

            <Box marginTop="spacing.5" padding="spacing.4" borderRadius="medium" backgroundColor="surface.background.gray.moderate">
              <Text size="small" color="surface.text.gray.normal">
                Members already on this plan keep paying their current amount until their next billing
                cycle. We'll notify them about the change with their next payment link.
              </Text>
            </Box>

            <Box marginTop="spacing.5" display="flex" gap="spacing.3">
              <div style={{ flex: 1 }} className="rzp-blue-btn">
                <Button isFullWidth onClick={() => onSave(payload())}>
                  Save changes
                </Button>
              </div>
              <Box flex="1">
                <Button variant="secondary" isFullWidth onClick={() => setConfirmChanges(null)}>
                  Go back
                </Button>
              </Box>
            </Box>
          </div>
        </div>
      )}
    </div>
  );
}
