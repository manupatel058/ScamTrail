import { useRef, useState } from 'react'
import AnalyzedConversation from './components/AnalyzedConversation'
import ConversationInput from './components/ConversationInput'
import ExplanationNotice from './components/ExplanationNotice'
import ExampleSelector from './components/ExampleSelector'
import Header from './components/Header'
import HomeHero from './components/HomeHero'
import LiveDemo from './components/LiveDemo'
import LiveMonitor from './components/live/LiveMonitor'
import PatternTimeline from './components/PatternTimeline'
import RiskScore from './components/RiskScore'
import SafetyAdvice from './components/SafetyAdvice'
import ScoreBreakdown from './components/ScoreBreakdown'
import { demoScenarios } from './data/demoScenarios'
import { analyzeConversation } from './services/gemini'
import { getLiveRisk } from './services/liveRisk'
import { buildPasteAnalysis } from './services/pasteAnalysis'

const MODEL_UNAVAILABLE = 'The trained fraud-risk model is unavailable in this session.'

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
  const [view, setView] = useState('home')
  const [conversation, setConversation] = useState('')
  const [selectedExampleId, setSelectedExampleId] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [pasteFailure, setPasteFailure] = useState(null)
  const [liveStartToken, setLiveStartToken] = useState(0)
  const requestRef = useRef(0)

  function handleExampleSelect(example) {
    if (loading) return
    setSelectedExampleId(example.id)
    setConversation(example.transcript)
    setError('')
    setErrorDetail('')
    setPasteFailure(null)
  }

  function handleConversationChange(value) {
    setConversation(value)
    const match = examples.find((example) => example.transcript === value)
    setSelectedExampleId(match ? match.id : null)
    setError('')
    setErrorDetail('')
    setPasteFailure(null)
  }

  function showHome() {
    setView('home')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function showPaste() {
    setView('paste')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startLiveProtection() {
    setLiveStartToken((token) => token + 1)
    setView('live')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleViewFullAnalysis(result) {
    if (!result) return
    setAnalysis(result)
    setView('results')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleAnalyze() {
    const transcript = conversation.trim()
    if (!transcript || loading) return

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setError('')
    setErrorDetail('')
    setPasteFailure(null)
    setLoading(true)

    try {
      const [riskResult, explanationResult] = await Promise.allSettled([
        getLiveRisk(transcript),
        analyzeConversation(transcript),
      ])
      if (requestId !== requestRef.current) return

      const outcome = buildPasteAnalysis({
        transcript,
        trained: riskResult.status === 'fulfilled' ? riskResult.value : null,
        explanation: explanationResult.status === 'fulfilled' ? explanationResult.value : null,
        explanationError: explanationResult.status === 'rejected' ? explanationResult.reason : null,
      })

      if (outcome.status === 'unavailable') {
        setAnalysis(null)
        setPasteFailure({
          quota: outcome.quota,
          fraudDetectionActive: false,
        })
        return
      }

      setAnalysis(outcome.analysis)
      setView('results')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }

  return (
    <div className="min-h-svh bg-[#f6f5f2] text-slate-950">
      <Header onHome={showHome} />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        {view === 'home' ? (
          <HomeHero
            onStartLive={startLiveProtection}
            onAnalyzeExisting={showPaste}
            onRunDemo={() => {
              setView('demo')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        ) : null}
        {view === 'paste' ? (
          <div>
            <div className="text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Analyze an existing conversation
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-600">
                Paste a conversation to map manipulation patterns. This does not use the microphone.
              </p>
            </div>
            <ConversationInput
              value={conversation}
              onChange={handleConversationChange}
              onAnalyze={handleAnalyze}
              loading={loading}
              error={error}
              errorDetail={errorDetail}
              notice={pasteFailure}
              riskNote={pasteFailure ? MODEL_UNAVAILABLE : ''}
            />
            <ExampleSelector
              examples={examples}
              selectedId={selectedExampleId}
              onSelect={handleExampleSelect}
              disabled={loading}
            />
          </div>
        ) : null}
        {view === 'live' ? <LiveMonitor autoStartToken={liveStartToken} /> : null}
        {view === 'demo' ? <LiveDemo onViewFullAnalysis={handleViewFullAnalysis} /> : null}
        {view === 'results' && analysis ? (
          <div className="rise space-y-8">
            {analysis.trainedModelUnavailable ? (
              <div>
                <p className="text-sm leading-relaxed text-slate-600">{MODEL_UNAVAILABLE}</p>
                {analysis.summary ? (
                  <p className="mt-3 text-sm leading-relaxed text-slate-700 sm:text-base">{analysis.summary}</p>
                ) : null}
              </div>
            ) : (
              <RiskScore
                score={analysis.score}
                level={analysis.level}
                summary={analysis.summary}
                eyebrow={analysis.scoreSource === 'scamtrail-trained-model' ? 'Fraud Risk' : undefined}
              />
            )}
            {analysis.explanationUnavailable ? (
              <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">Manipulation Pattern</h2>
                <div className="mt-3">
                  <ExplanationNotice
                    quota={analysis.explanationUnavailable.quota}
                    fraudDetectionActive
                  />
                </div>
              </section>
            ) : (
              <PatternTimeline stages={analysis.stages} />
            )}
            <AnalyzedConversation
              messages={analysis.messages}
              patterns={analysis.patterns}
              heading={analysis.explanationUnavailable ? 'Conversation' : undefined}
              description={
                analysis.explanationUnavailable
                  ? 'This is the text scored by the trained fraud detector.'
                  : undefined
              }
            />
            <ScoreBreakdown score={analysis.score} breakdown={analysis.scoringBreakdown} />
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
              One warning sign alone does not prove a scam. ScamTrail raises risk when multiple
              manipulation signals combine or escalate across a conversation.
            </p>
            {analysis.safety.length > 0 && <SafetyAdvice items={analysis.safety} />}
            <button
              type="button"
              onClick={showPaste}
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
