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
} from '@razorpay/blade/components';
import { formatRupees, optionsSummary, frequencyLabel, sortPrices } from './plansData.js';

/* ---------- One card in the list: name + "3 options · Monthly, ..." ---------- */

function PlanCard({ plan, onOpen }) {
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
      </CardBody>
    </Card>
  );
}

/* ---------- Panel that slides up when a plan is tapped ---------- */

function PlanSheet({ plan, onClose, onEdit, onDelete }) {
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
        {plan.description && (
          <Box marginTop="spacing.1">
            <Text size="small" color="surface.text.gray.muted">
              {plan.description}
            </Text>
          </Box>
        )}

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
                onClick={() => setConfirming(true)}
              >
                Delete plan
              </Button>
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

/* ---------- The Plans tab ---------- */

export default function PlansTab({ plans, onEditPlan, onDeletePlan }) {
  const [query, setQuery] = useState('');
  const [openPlanId, setOpenPlanId] = useState(null);

  const q = query.trim().toLowerCase();
  const visible = q ? plans.filter((p) => p.name.toLowerCase().includes(q)) : plans;
  const openPlan = plans.find((p) => p.id === openPlanId);

  if (plans.length === 0) {
    return (
      <Empty
        icon={LayersIcon}
        title="No plans yet"
        description="Create a plan to start collecting membership fees."
      />
    );
  }

  return (
    <Box>
      <SearchInput
        accessibilityLabel="Search plans"
        placeholder="Search plans"
        value={query}
        onChange={({ value }) => setQuery(value ?? '')}
        onClearButtonClick={() => setQuery('')}
      />

      <Box marginTop="spacing.4" display="flex" flexDirection="column" gap="spacing.3">
        {visible.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onOpen={() => setOpenPlanId(plan.id)} />
        ))}
        {visible.length === 0 && (
          <Empty
            icon={SearchIcon}
            title="No matching plans"
            description={`Nothing matches "${query.trim()}". Try another name.`}
          />
        )}
      </Box>

      {openPlan && (
        <PlanSheet
          key={openPlan.id}
          plan={openPlan}
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
    </Box>
  );
}
