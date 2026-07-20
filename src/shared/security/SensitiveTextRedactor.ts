const REDACTED = '[REDACTED]'
const SENSITIVE_KEY =
  '(?:api[_-]?key|api[_-]?token|access[_-]?token|cookie|password|passwd|private[_-]?key|secret|session[_-]?(?:id|token)|token)'

interface RedactionRule {
  pattern: RegExp
  replace: (...groups: string[]) => string
}

const RULES: RedactionRule[] = [
  {
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
    replace: () => REDACTED
  },
  {
    pattern: /(\bauthorization\s*[:=]\s*)(?:Bearer\s+)?[A-Za-z0-9._~+/=-]+/gi,
    replace: prefix => `${prefix}${REDACTED}`
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
    replace: () => `Bearer ${REDACTED}`
  },
  {
    pattern: /\b(?:sk|sk-proj|ghp|github_pat|glpat)-[A-Za-z0-9_-]{12,}\b/gi,
    replace: () => REDACTED
  },
  {
    pattern: new RegExp(
      `((?:["']?)${SENSITIVE_KEY}(?:["']?)\\s*[:=]\\s*)(["'])([\\s\\S]*?)\\2`,
      'gi'
    ),
    replace: prefix => `${prefix}"${REDACTED}"`
  },
  {
    pattern: new RegExp(`(\\b${SENSITIVE_KEY}\\s*[:=]\\s*)([^\\s,;]+)`, 'gi'),
    replace: prefix => `${prefix}${REDACTED}`
  },
  {
    pattern: /([?&](?:X-Amz-(?:Credential|Signature|Security-Token)|access_token|api_key|key|signature|token)=)[^&#\s]+/gi,
    replace: prefix => `${prefix}${REDACTED}`
  }
]

export interface SensitiveTextRedaction {
  content: string
  redactionCount: number
}

export function redactSensitiveText(content: string): SensitiveTextRedaction {
  let redactionCount = 0
  let redacted = content

  for (const rule of RULES) {
    redacted = redacted.replace(rule.pattern, (match, ...args: unknown[]) => {
      if (match.includes(REDACTED)) {
        return match
      }
      redactionCount += 1
      const groups = args.slice(0, -2).map(value => String(value))
      return rule.replace(...groups)
    })
  }

  return {
    content: redacted,
    redactionCount
  }
}
