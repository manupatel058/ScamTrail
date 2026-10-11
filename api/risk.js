function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  sendJson(res, 501, {
    error:
      'The trained ScamTrail model needs a Python runtime. This Node serverless function cannot load the scikit-learn pipeline.',
  })
}
