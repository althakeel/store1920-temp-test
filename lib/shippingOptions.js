const SHIPPING_LOGIC_TYPES = ['FLAT_RATE', 'PER_ITEM', 'WEIGHT_BASED', 'FREE'];

export function createShippingOptionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyShippingOption(overrides = {}) {
  return {
    id: createShippingOptionId(),
    name: 'Standard Delivery',
    enabled: true,
    isDefault: false,
    estimatedDays: '3-5',
    shippingType: 'FLAT_RATE',
    flatRate: 5,
    perItemFee: 2,
    maxItemFee: null,
    weightUnit: 'kg',
    baseWeight: 1,
    baseWeightFee: 5,
    additionalWeightFee: 2,
    availableStates: [],
    sortOrder: 0,
    ...overrides,
  };
}

function normalizeOption(option = {}, index = 0) {
  // Default params only apply for `undefined`, not `null` DB holes.
  const src = option && typeof option === 'object' ? option : {};
  const shippingType = SHIPPING_LOGIC_TYPES.includes(src.shippingType)
    ? src.shippingType
    : 'FLAT_RATE';

  return {
    id: String(src.id || createShippingOptionId()),
    name: String(src.name || `Delivery Option ${index + 1}`).trim(),
    enabled: src.enabled !== false,
    isDefault: Boolean(src.isDefault),
    estimatedDays: String(src.estimatedDays || '3-5').trim(),
    shippingType,
    flatRate: Number(src.flatRate ?? 0),
    perItemFee: Number(src.perItemFee ?? 0),
    maxItemFee: src.maxItemFee == null || src.maxItemFee === ''
      ? null
      : Number(src.maxItemFee),
    weightUnit: src.weightUnit === 'lb' ? 'lb' : 'kg',
    baseWeight: Number(src.baseWeight ?? 1),
    baseWeightFee: Number(src.baseWeightFee ?? 0),
    additionalWeightFee: Number(src.additionalWeightFee ?? 0),
    availableStates: Array.isArray(src.availableStates)
      ? src.availableStates.map((state) => String(state || '').trim()).filter(Boolean)
      : [],
    sortOrder: Number.isFinite(Number(src.sortOrder)) ? Number(src.sortOrder) : index,
  };
}

export function buildShippingOptionsFromLegacy(setting = {}) {
  const options = [
    normalizeOption(
      {
        id: 'standard',
        name: 'Standard Delivery',
        enabled: true,
        isDefault: true,
        estimatedDays: setting.estimatedDays || '3-5',
        shippingType: setting.shippingType || 'FLAT_RATE',
        flatRate: setting.flatRate ?? 5,
        perItemFee: setting.perItemFee ?? 2,
        maxItemFee: setting.maxItemFee,
        weightUnit: setting.weightUnit || 'kg',
        baseWeight: setting.baseWeight ?? 1,
        baseWeightFee: setting.baseWeightFee ?? 5,
        additionalWeightFee: setting.additionalWeightFee ?? 2,
        availableStates: [],
        sortOrder: 0,
      },
      0,
    ),
  ];

  if (setting.enableExpressShipping) {
    const baseFlat = Number(setting.flatRate ?? 0);
    options.push(
      normalizeOption(
        {
          id: 'express',
          name: 'Express Shipping',
          enabled: true,
          isDefault: false,
          estimatedDays: setting.expressEstimatedDays || '1-2',
          shippingType: 'FLAT_RATE',
          flatRate: baseFlat + Number(setting.expressShippingFee ?? 20),
          availableStates: [],
          sortOrder: 1,
        },
        1,
      ),
    );
  }

  return options;
}

export function resolveShippingOptions(setting) {
  if (!setting) return buildShippingOptionsFromLegacy({});

  let options;
  if (Array.isArray(setting.shippingOptions) && setting.shippingOptions.length > 0) {
    options = setting.shippingOptions
      .map((option, index) => normalizeOption(option, index))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } else {
    return buildShippingOptionsFromLegacy(setting);
  }

  const hasExpressOption = options.some(
    (option) => option?.id === 'express' || /express/i.test(option?.name || ''),
  );

  if (setting.enableExpressShipping && !hasExpressOption) {
    const defaultOption = options.find((option) => option.isDefault) || options[0];
    const baseFlat =
      defaultOption?.shippingType === 'FLAT_RATE'
        ? Number(defaultOption.flatRate ?? 0)
        : Number(setting.flatRate ?? 0);

    options.push(
      normalizeOption(
        {
          id: 'express',
          name: 'Express Shipping',
          enabled: true,
          isDefault: false,
          estimatedDays: setting.expressEstimatedDays || '1-2',
          shippingType: 'FLAT_RATE',
          flatRate: baseFlat + Number(setting.expressShippingFee ?? 0),
          availableStates: [],
          sortOrder: options.length,
        },
        options.length,
      ),
    );
  }

  if (!options.some((option) => option.isDefault)) {
    const firstEnabled = options.find((option) => option.enabled) || options[0];
    if (firstEnabled) firstEnabled.isDefault = true;
  }

  return options;
}

function stateMatchesList(shippingState, states = []) {
  if (!states.length) return true;
  const normalized = String(shippingState || '').trim().toLowerCase();
  return states.some((state) => String(state || '').trim().toLowerCase() === normalized);
}

export function getAvailableShippingOptions(setting, shippingState = '') {
  return resolveShippingOptions(setting).filter(
    (option) => option.enabled && stateMatchesList(shippingState, option.availableStates),
  );
}

export function getShippingOptionById(setting, optionId) {
  const options = resolveShippingOptions(setting);
  return options.find((option) => option.id === optionId) || null;
}

export function getDefaultShippingOption(setting, shippingState = '') {
  const available = getAvailableShippingOptions(setting, shippingState);
  return available.find((option) => option.isDefault) || available[0] || null;
}

export function syncLegacyFieldsFromOptions(options = []) {
  const normalized = options.map((option, index) => normalizeOption(option, index));
  const defaultOption =
    normalized.find((option) => option.isDefault && option.enabled)
    || normalized.find((option) => option.enabled)
    || normalized[0];

  const expressOption = normalized.find(
    (option) => option?.id === 'express' || /express/i.test(option?.name || ''),
  );

  if (!defaultOption) {
    return {};
  }

  const legacy = {
    shippingType: defaultOption.shippingType,
    flatRate: defaultOption.flatRate,
    perItemFee: defaultOption.perItemFee,
    maxItemFee: defaultOption.maxItemFee,
    weightUnit: defaultOption.weightUnit,
    baseWeight: defaultOption.baseWeight,
    baseWeightFee: defaultOption.baseWeightFee,
    additionalWeightFee: defaultOption.additionalWeightFee,
    estimatedDays: defaultOption.estimatedDays,
    enableExpressShipping: Boolean(expressOption?.enabled),
    expressEstimatedDays: expressOption?.estimatedDays || '1-2',
    expressShippingFee: expressOption
      ? Math.max(0, Number(expressOption.flatRate || 0) - Number(defaultOption.flatRate || 0))
      : 0,
  };

  return legacy;
}

export function sanitizeShippingOptionsPayload(options) {
  if (!Array.isArray(options)) return [];

  const normalized = options
    .map((option, index) => normalizeOption(option, index))
    .filter((option) => option.name);

  if (normalized.length && !normalized.some((option) => option.isDefault)) {
    const firstEnabled = normalized.find((option) => option.enabled) || normalized[0];
    if (firstEnabled) firstEnabled.isDefault = true;
  }

  return normalized;
}

export const SHIPPING_LOGIC_LABELS = {
  FLAT_RATE: 'Flat Rate',
  PER_ITEM: 'Per Item',
  WEIGHT_BASED: 'Weight Based',
  FREE: 'Free Shipping',
};

export function findExpressShippingOption(options = []) {
  return options.find((option) => option?.id === 'express' || /express/i.test(option?.name || '')) || null;
}

export function getStandardShippingOption(options = []) {
  return options.find((option) => option.isDefault) || options[0] || null;
}

export function getExpressExtraFee(options = []) {
  const express = findExpressShippingOption(options);
  if (!express) return 0;
  const standard = getStandardShippingOption(options);
  const standardFlat =
    standard?.shippingType === 'FLAT_RATE' ? Number(standard.flatRate || 0) : 0;
  const expressFlat = express.shippingType === 'FLAT_RATE' ? Number(express.flatRate || 0) : 0;
  return Math.max(0, expressFlat - standardFlat) || expressFlat;
}

export function upsertExpressShippingOption(options = [], { enabled, extraFee, estimatedDays } = {}) {
  const next = [...options];
  const standard = getStandardShippingOption(next);
  const standardFlat =
    standard?.shippingType === 'FLAT_RATE' ? Number(standard.flatRate || 0) : 0;
  const existingIndex = next.findIndex(
    (option) => option?.id === 'express' || /express/i.test(option?.name || ''),
  );

  if (!enabled) {
    if (existingIndex === -1) return next;
    next[existingIndex] = { ...next[existingIndex], enabled: false };
    return next;
  }

  const expressOption = normalizeOption(
    {
      id: 'express',
      name: 'Express Shipping',
      enabled: true,
      isDefault: false,
      estimatedDays: estimatedDays || '1-2',
      shippingType: 'FLAT_RATE',
      flatRate: standardFlat + Number(extraFee || 0),
      availableStates: [],
      sortOrder: existingIndex === -1 ? next.length : next[existingIndex].sortOrder,
    },
    existingIndex === -1 ? next.length : existingIndex,
  );

  if (existingIndex === -1) {
    next.push(expressOption);
  } else {
    next[existingIndex] = { ...next[existingIndex], ...expressOption };
  }

  return next;
}
