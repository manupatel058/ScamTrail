import { calculateRisk } from './riskEngine.js'

let failed = 0

function assertEqual(name, actual, expected) {
  const pass = actual === expected
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${actual} (expected ${expected})`)
  if (!pass) failed += 1
}

function pattern(type, messageIndex) {
  return { type, messageIndex }
}

const none = calculateRisk([])
assertEqual('A no patterns', none.riskScore, 0)
assertEqual('A risk level', none.riskLevel, 'low')

const urgency = calculateRisk([pattern('urgency', 0)])
assertEqual('B urgency only', urgency.riskScore, 12)
assertEqual('B risk level', urgency.riskLevel, 'low')

const authorityUrgency = calculateRisk([pattern('authority', 0), pattern('urgency', 1)])
assertEqual('C authority + urgency', authorityUrgency.riskScore, 20)
assertEqual('C combinations', authorityUrgency.scoringBreakdown.combinations.length, 0)
assertEqual('C progression', authorityUrgency.scoringBreakdown.progressionBonus, 0)

const trio = calculateRisk([
  pattern('authority', 0),
  pattern('urgency', 1),
  pattern('sensitive_request', 2),
])
assertEqual(
  'D base',
  trio.scoringBreakdown.basePatterns.reduce((sum, item) => sum + item.points, 0),
  42,
)
assertEqual('D combination', trio.scoringBreakdown.combinations[0]?.points, 10)
assertEqual('D progression', trio.scoringBreakdown.progressionBonus, 5)
assertEqual('D total', trio.riskScore, 57)
assertEqual('D risk level', trio.riskLevel, 'moderate')

const five = calculateRisk([
  pattern('authority', 0),
  pattern('fear_reward', 1),
  pattern('urgency', 2),
  pattern('isolation', 3),
  pattern('sensitive_request', 4),
])
const fiveBase = five.scoringBreakdown.basePatterns.reduce((sum, item) => sum + item.points, 0)
const fiveCombinations = five.scoringBreakdown.combinations.reduce(
  (sum, item) => sum + item.points,
  0,
)
assertEqual('E base', fiveBase, 72)
assertEqual('E combinations', fiveCombinations, 34)
assertEqual('E progression', five.scoringBreakdown.progressionBonus, 15)
assertEqual('E uncapped', fiveBase + fiveCombinations + five.scoringBreakdown.progressionBonus, 121)
assertEqual('E capped score', five.riskScore, 100)
assertEqual('E risk level', five.riskLevel, 'very_high')

const duplicateUrgency = calculateRisk([
  pattern('urgency', 0),
  pattern('urgency', 3),
  pattern('urgency', 5),
])
assertEqual('F duplicate urgency score', duplicateUrgency.riskScore, 12)
assertEqual('F base entries', duplicateUrgency.scoringBreakdown.basePatterns.length, 1)

const overflow = calculateRisk([
  pattern('authority', 0),
  pattern('fear_reward', 1),
  pattern('urgency', 2),
  pattern('isolation', 3),
  pattern('sensitive_request', 4),
  pattern('money_action', 5),
])
const overflowRaw =
  overflow.scoringBreakdown.basePatterns.reduce((sum, item) => sum + item.points, 0) +
  overflow.scoringBreakdown.combinations.reduce((sum, item) => sum + item.points, 0) +
  overflow.scoringBreakdown.progressionBonus
assertEqual('G uncapped above 100', overflowRaw > 100, true)
assertEqual('G capped score', overflow.riskScore, 100)

if (failed > 0) {
  console.log(`${failed} failed`)
  process.exit(1)
}

console.log('All risk-engine tests passed')
