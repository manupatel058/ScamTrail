const PATTERN_ORDER = [
  'authority',
  'fear_reward',
  'urgency',
  'isolation',
  'sensitive_request',
  'money_action',
]

const BASE_WEIGHTS = {
  authority: 8,
  fear_reward: 12,
  urgency: 12,
  isolation: 18,
  sensitive_request: 22,
  money_action: 22,
}

const COMBINATIONS = [
  {
    name: 'authority + urgency + sensitive_request',
    types: ['authority', 'urgency', 'sensitive_request'],
    points: 10,
  },
  {
    name: 'authority + fear_reward + isolation',
    types: ['authority', 'fear_reward', 'isolation'],
    points: 12,
  },
  {
    name: 'urgency + isolation + money_action',
    types: ['urgency', 'isolation', 'money_action'],
    points: 15,
  },
  {
    name: 'isolation + sensitive_request',
    types: ['isolation', 'sensitive_request'],
    points: 12,
  },
  {
    name: 'sensitive_request + money_action',
    types: ['sensitive_request', 'money_action'],
    points: 10,
  },
]

const RANK = Object.fromEntries(PATTERN_ORDER.map((type, index) => [type, index]))

function riskLevelFor(score) {
  if (score <= 29) return 'low'
  if (score <= 59) return 'moderate'
  if (score <= 79) return 'high'
  return 'very_high'
}

function progressionBonusFor(length) {
  if (length >= 5) return 15
  if (length >= 4) return 10
  if (length >= 3) return 5
  return 0
}

function earliestByType(patterns) {
  const unique = new Map()

  for (const pattern of patterns) {
    const type = pattern?.type
    if (!Object.hasOwn(BASE_WEIGHTS, type)) continue

    const messageIndex = Number(pattern.messageIndex)
    const index = Number.isFinite(messageIndex) ? messageIndex : Number.POSITIVE_INFINITY
    const current = unique.get(type)
    if (!current || index < current.messageIndex) {
      unique.set(type, { type, messageIndex: index })
    }
  }

  return unique
}

function longestForwardProgression(unique) {
  const chronological = [...unique.values()].sort(
    (a, b) => a.messageIndex - b.messageIndex || RANK[a.type] - RANK[b.type],
  )
  const lengths = Array(chronological.length).fill(1)
  let best = chronological.length > 0 ? 1 : 0

  for (let i = 0; i < chronological.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const laterStage = RANK[chronological[j].type] < RANK[chronological[i].type]
      const laterMessage = chronological[j].messageIndex < chronological[i].messageIndex
      if (laterStage && laterMessage) {
        lengths[i] = Math.max(lengths[i], lengths[j] + 1)
      }
    }
    best = Math.max(best, lengths[i])
  }

  return best
}

function devLoggingEnabled() {
  const env = import.meta.env
  return Boolean(env && env.DEV)
}

export function calculateRisk(patterns) {
  const findings = Array.isArray(patterns) ? patterns : []
  const unique = earliestByType(findings)
  const detected = new Set(unique.keys())

  const basePatterns = PATTERN_ORDER.filter((type) => detected.has(type)).map((type) => ({
    type,
    points: BASE_WEIGHTS[type],
  }))
  const baseScore = basePatterns.reduce((sum, pattern) => sum + pattern.points, 0)

  const combinations = COMBINATIONS.filter((combination) =>
    combination.types.every((type) => detected.has(type)),
  ).map((combination) => ({
    name: combination.name,
    points: combination.points,
  }))
  const combinationScore = combinations.reduce((sum, combination) => sum + combination.points, 0)

  const progressionLength = longestForwardProgression(unique)
  const progressionBonus = detected.size === 0 ? 0 : progressionBonusFor(progressionLength)

  const riskScore = Math.min(100, baseScore + combinationScore + progressionBonus)
  const riskLevel = riskLevelFor(riskScore)

  if (devLoggingEnabled()) {
    console.log(
      'Detected patterns:',
      basePatterns.map((pattern) => pattern.type).join(', ') || 'none',
    )
    console.log('Base pattern score:', baseScore)
    console.log(
      'Combination bonuses:',
      combinations.map((combination) => `${combination.name} +${combination.points}`).join('; ') ||
        'none',
    )
    console.log('Progression bonus:', progressionBonus)
    console.log('Final ScamTrail score:', riskScore)
  }

  return {
    riskScore,
    riskLevel,
    scoringBreakdown: {
      basePatterns,
      combinations,
      progressionBonus,
    },
  }
}
