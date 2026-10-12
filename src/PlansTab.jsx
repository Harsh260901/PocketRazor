import { useState } from 'react';
import {
  Box,
  Card,
  CardBody,
  Text,
  Heading,
  Button,
  IconButton,
  SearchInput,
  Divider,
  CloseIcon,
  TrashIcon,
  EditIcon,
  LayersIcon,
  SearchIcon,
  ArrowLeftIcon,
  PlusIcon,
} from '@razorpay/blade/components';
import { formatRupees, optionsSummary, frequencyLabel, sortPrices } from './plansData.js';
import { memberStatus } from './membersData.js';

/* ---------- One card in the list: name + "3 options · Monthly, ..." ---------- */

// Members currently on a plan (paid up or waiting for their first payment)
export const membersOnPlan = (plan, members) =>
  members.filter((m) => m.planId === plan.id && ['active', 'expiring', 'pending'].includes(memberStatus(m)));
const fromPrice = (plan) => Math.min(...plan.prices.map((p) => p.amount));

function PlanCard({ plan, count, onOpen }) {
  return (
    <Card
      onClick={onOpen}
      accessibilityLabel={plan.name}
      elevation="none"
      padding="spacing.5"
      borderRadius="large"
    >
      <CardBody>
        <Text size="large" weight="semibold" color="surface.text.gray.normal">
          {plan.name}
        </Text>
        <Box marginTop="spacing.1">
          <Text size="small" color="surface.text.gray.muted">
            {optionsSummary(plan.prices)}
          </Text>
        </Box>
        <Text size="small" color="surface.text.gray.muted">
          {count} {count === 1 ? 'member' : 'members'} · from {formatRupees(fromPrice(plan))}
        </Text>
      </CardBody>
    </Card>
  );
}

/* ---------- Panel that slides up when a plan is tapped ---------- */

function PlanSheet({ plan, count, onClose, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  return (
    // Tapping the dark area closes the panel
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={plan.name}>
        <div className="sheet-handle" />

        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Heading size="medium" weight="semibold">
            {plan.name}
          </Heading>
          <IconButton icon={CloseIcon} accessibilityLabel="Close" onClick={onClose} />
        </Box>
        <Box marginTop="spacing.1">
          <Text size="small" color="surface.text.gray.muted">
            {[plan.description, `${count} ${count === 1 ? 'member' : 'members'}`].filter(Boolean).join(' · ')}
          </Text>
        </Box>

        {/* One row per price */}
        <Box marginTop="spacing.4">
          {sortPrices(plan.prices).map((price, i) => (
            <Box key={i}>
              {i > 0 && <Divider />}
              <Box display="flex" justifyContent="space-between" paddingY="spacing.4">
                <Text size="medium" color="surface.text.gray.normal">
                  {frequencyLabel(price)}
                </Text>
                <Text size="medium" weight="semibold" color="surface.text.gray.normal">
                  {formatRupees(price.amount)}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Delete, with an "are you sure?" step */}
        <Box marginTop="spacing.6">
          {!confirming ? (
            <Box display="flex" flexDirection="column" gap="spacing.3">
              <Button variant="secondary" icon={EditIcon} iconPosition="left" isFullWidth onClick={onEdit}>
                Edit plan
              </Button>
              <Button
                variant="secondary"
                color="negative"
                icon={TrashIcon}
                iconPosition="left"
                isFullWidth
                isDisabled={count > 0}
                onClick={() => setConfirming(true)}
              >
                Delete plan
              </Button>
              {/* Can't delete a plan people are on: their renewals depend on it */}
              {count > 0 && (
                <div className="plan-delete-note">
                  {count} {count === 1 ? 'member is' : 'members are'} on this plan, so it can't be deleted yet. You can still
                  edit it; price changes apply from each member's next renewal.
                </div>
              )}
            </Box>
          ) : (
            <Box>
              <Text size="medium" weight="semibold" color="surface.text.gray.normal">
                Delete {plan.name}?
              </Text>
              <Box marginTop="spacing.1" marginBottom="spacing.4">
                <Text size="small" color="surface.text.gray.muted">
                  This removes the plan and all its prices. You can't undo this.
                </Text>
              </Box>
              <Box display="flex" gap="spacing.3">
                <Box flex="1">
                  <Button variant="secondary" isFullWidth onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </Box>
                <Box flex="1">
                  <Button color="negative" isFullWidth onClick={onDelete}>
                    Delete
                  </Button>
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      </div>
    </div>
  );
}

/* ---------- Empty states ---------- */

function Empty({ icon: Icon, title, description }) {
  return (
    <Card elevation="none" padding="spacing.7" borderRadius="large">
      <CardBody>
        <Box display="flex" flexDirection="column" alignItems="center" gap="spacing.3">
          <Icon size="xlarge" color="surface.icon.gray.muted" />
          <Box marginTop="spacing.3">
            <Text size="large" weight="semibold" color="surface.text.gray.normal">
              {title}
            </Text>
          </Box>
          <Text size="medium" color="surface.text.gray.muted" textAlign="center">
            {description}
          </Text>
        </Box>
      </CardBody>
    </Card>
  );
}

/* ---------- The Plans screen (opens from the Plans card on the home page) ---------- */

export default function PlansTab({ plans, members, onBack, onNewPlan, onEditPlan, onDeletePlan }) {
  const [query, setQuery] = useState('');
  const [openPlanId, setOpenPlanId] = useState(null);

  const q = query.trim().toLowerCase();
  const visible = q ? plans.filter((p) => p.name.toLowerCase().includes(q)) : plans;
  const openPlan = plans.find((p) => p.id === openPlanId);

  return (
    <div className="main-screen">
      <div className="main-header">
        <div className="main-header-row">
          <Box display="flex" alignItems="center" gap="spacing.2">
            <IconButton icon={ArrowLeftIcon} size="large" accessibilityLabel="Back" onClick={onBack} />
            <Heading size="medium" weight="semibold">
              Plans
            </Heading>
          </Box>
          <div className="header-add rzp-blue-btn">
            <Button size="small" icon={PlusIcon} iconPosition="left" onClick={onNewPlan}>
              Plan
            </Button>
          </div>
        </div>
        {plans.length > 0 && (
          <SearchInput
            accessibilityLabel="Search plans"
            placeholder="Search plans"
            value={query}
            onChange={({ value }) => setQuery(value ?? '')}
            onClearButtonClick={() => setQuery('')}
          />
        )}
      </div>

      <div className="main-body">
        {plans.length === 0 ? (
          <Empty icon={LayersIcon} title="No plans yet" description="Create a plan to start collecting membership fees." />
        ) : (
          <Box display="flex" flexDirection="column" gap="spacing.3">
            {visible.map((plan) => (
              <PlanCard key={plan.id} plan={plan} count={membersOnPlan(plan, members).length} onOpen={() => setOpenPlanId(plan.id)} />
            ))}
            {visible.length === 0 && (
              <Empty
                icon={SearchIcon}
                title="No matching plans"
                description={`Nothing matches "${query.trim()}". Try another name.`}
              />
            )}
          </Box>
        )}
      </div>

      {openPlan && (
        <PlanSheet
          key={openPlan.id}
          plan={openPlan}
          count={membersOnPlan(openPlan, members).length}
          onClose={() => setOpenPlanId(null)}
          onEdit={() => {
            setOpenPlanId(null);
            onEditPlan(openPlan.id);
          }}
          onDelete={() => {
            onDeletePlan(openPlan.id);
            setOpenPlanId(null);
          }}
        />
      )}
    </div>
  );
}
