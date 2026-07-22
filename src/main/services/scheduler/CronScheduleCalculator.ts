import { CronExpressionParser, type CronExpression } from 'cron-parser'

const UNSUPPORTED_TOKENS = /[A-Za-z#?]/

export class CronScheduleCalculator {
  validate(expression: string, timezone: string): void {
    this.parse(expression, timezone, Date.now())
  }

  next(expression: string, timezone: string, after: number): number {
    return this.parse(expression, timezone, after).next().getTime()
  }

  private parse(expression: string, timezone: string, currentDate: number): CronExpression {
    const normalized = expression.trim().replace(/\s+/g, ' ')
    const fields = normalized.split(' ')
    if (fields.length !== 5) {
      throw new Error('cron_expression must contain exactly 5 fields: minute hour day-of-month month day-of-week')
    }
    if (normalized.startsWith('@') || UNSUPPORTED_TOKENS.test(normalized)) {
      throw new Error('cron_expression supports standard numeric 5-field cron syntax')
    }
    if (fields[2] !== '*' && fields[4] !== '*') {
      throw new Error('cron_expression must leave either day-of-month or day-of-week as *')
    }
    if (!timezone.trim()) {
      throw new Error('timezone is required for cron schedules')
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    } catch {
      throw new Error(`Invalid IANA timezone: ${timezone}`)
    }

    return CronExpressionParser.parse(`0 ${normalized}`, {
      currentDate,
      tz: timezone,
      strict: true
    })
  }
}

export const cronScheduleCalculator = new CronScheduleCalculator()
