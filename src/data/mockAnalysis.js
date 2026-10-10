export const mockAnalysis = {
  score: 87,
  level: 'Very High Risk',
  stages: [
    { id: 'authority', label: 'Authority', detected: true },
    { id: 'fear', label: 'Fear', detected: true },
    { id: 'urgency', label: 'Urgency', detected: true },
    { id: 'isolation', label: 'Isolation', detected: true },
    { id: 'sensitive', label: 'Sensitive Request', detected: true },
  ],
  summary:
    'This conversation contains warning signs of a high-risk manipulation pattern. The sensitive ask does not come first. It shows up only after the other person claims a role at a known organization, raises the cost of waiting, compresses the time you have to think, and steers you away from checking anywhere else. A single polite message can look ordinary. Read in order, this progression is a reason to pause.',
  patterns: [
    {
      label: 'Authority',
      detail:
        'They open by presenting themselves as staff or a reviewer at an organization you already recognize.',
    },
    {
      label: 'Fear',
      detail:
        'They describe a loss, lockout, or penalty that gets worse if you do not go along.',
    },
    {
      label: 'Urgency',
      detail: 'A short deadline pushes a decision before there is time to check.',
    },
    {
      label: 'Isolation',
      detail:
        'They discourage the official app, a published phone number, or another person.',
    },
    {
      label: 'Sensitive Request',
      detail:
        'Only after that sequence do they ask for a code, password, or account detail.',
    },
  ],
  safety: [
    'Stop communicating',
    'Do not share passwords or verification codes',
    'Verify the organization independently',
    "Use the organization's official website or app",
    'If credentials were already shared, change them through the official service',
  ],
}

export function parseConversation(text) {
  const messages = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const match = line.match(/^([^:]{1,48}):\s*(.+)$/)
    if (match) {
      const sender = match[1].trim()
      messages.push({
        id: `msg-${messages.length}`,
        sender,
        text: match[2].trim(),
        role: /^(you|me)$/i.test(sender) ? 'user' : 'other',
        pattern: null,
      })
    } else if (messages.length > 0) {
      messages[messages.length - 1].text += `\n${line}`
    } else {
      messages.push({
        id: 'msg-0',
        sender: 'Participant',
        text: line,
        role: 'other',
        pattern: null,
      })
    }
  }

  return messages
}

export function analysisFor(transcript) {
  return {
    ...mockAnalysis,
    messages: parseConversation(transcript),
  }
}
