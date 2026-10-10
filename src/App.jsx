import { useRef, useState } from 'react'
import AnalyzedConversation from './components/AnalyzedConversation'
import ConversationInput from './components/ConversationInput'
import ExampleSelector from './components/ExampleSelector'
import Header from './components/Header'
import PatternTimeline from './components/PatternTimeline'
import RiskScore from './components/RiskScore'
import SafetyAdvice from './components/SafetyAdvice'
import ScoreBreakdown from './components/ScoreBreakdown'
import { demoScenarios } from './data/demoScenarios'
import { analyzeConversation } from './services/gemini'
import { calculateRisk } from './services/riskEngine'

const LEVEL_LABELS = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very High Risk',
}

const ANALYSIS_ERROR = "We couldn't analyze this conversation. Please try again."

const EXAMPLE_LABELS = {
  instagram: 'Instagram',
  marketplace: 'Marketplace',
  bank: 'Bank',
  normal: 'Normal Conversation',
}

const examples = ['instagram', 'marketplace', 'bank', 'normal'].map((id) => {
  const scenario = demoScenarios.find((item) => item.id === id)
  return {
    id: scenario.id,
    label: EXAMPLE_LABELS[scenario.id],
    transcript: scenario.conversation,
  }
})

export default function App() {
  const [view, setView] = useState('input')
  const [conversation, setConversation] = useState('')
  const [selectedExampleId, setSelectedExampleId] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const requestRef = useRef(0)

  function handleExampleSelect(example) {
    if (loading) return
    setSelectedExampleId(example.id)
    setConversation(example.transcript)
    setError('')
    setErrorDetail('')
  }

  function handleConversationChange(value) {
    setConversation(value)
    const match = examples.find((example) => example.transcript === value)
    setSelectedExampleId(match ? match.id : null)
    setError('')
    setErrorDetail('')
  }

  function showInput() {
    setView('input')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleAnalyze() {
    const transcript = conversation.trim()
    if (!transcript || loading) return

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setError('')
    setErrorDetail('')
    setLoading(true)

    try {
      const result = await analyzeConversation(transcript)
      if (requestId !== requestRef.current) return
      const risk = calculateRisk(result.patterns)
      setAnalysis({
        ...result,
        score: risk.riskScore,
        level: LEVEL_LABELS[risk.riskLevel],
        riskLevel: risk.riskLevel,
        scoringBreakdown: risk.scoringBreakdown,
        recommendations: result.safety,
      })
      setView('results')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      if (requestId !== requestRef.current) return
      setAnalysis(null)
      setError(ANALYSIS_ERROR)
      setErrorDetail(import.meta.env.DEV ? error?.message || '' : '')
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }

  return (
    <div className="min-h-svh bg-[#f6f5f2] text-slate-950">
      <Header onHome={showInput} />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        {view === 'input' ? (
          <div>
            <div className="text-center">
              <h1 className="text-4xl font-semibold tracking-tight text-balance text-slate-950 sm:text-5xl sm:leading-tight">
                See the pattern before it's too late.
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                ScamTrail analyzes how conversations evolve to identify patterns of manipulation
                before you take action.
              </p>
            </div>
            <ConversationInput
              value={conversation}
              onChange={handleConversationChange}
              onAnalyze={handleAnalyze}
              loading={loading}
              error={error}
              errorDetail={errorDetail}
            />
            <ExampleSelector
              examples={examples}
              selectedId={selectedExampleId}
              onSelect={handleExampleSelect}
              disabled={loading}
            />
          </div>
        ) : analysis ? (
          <div className="rise space-y-8">
            <RiskScore score={analysis.score} level={analysis.level} summary={analysis.summary} />
            <PatternTimeline stages={analysis.stages} />
            <AnalyzedConversation messages={analysis.messages} patterns={analysis.patterns} />
            <ScoreBreakdown score={analysis.score} breakdown={analysis.scoringBreakdown} />
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
              One warning sign alone does not prove a scam. ScamTrail raises risk when multiple
              manipulation signals combine or escalate across a conversation.
            </p>
            {analysis.safety.length > 0 && <SafetyAdvice items={analysis.safety} />}
            <button
              type="button"
              onClick={showInput}
              className="w-full rounded-2xl border border-stone-300 bg-white px-5 py-3.5 text-base font-medium text-slate-900 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              Analyze Another Conversation
            </button>
          </div>
        ) : null}
      </main>
    </div>
  )
}
