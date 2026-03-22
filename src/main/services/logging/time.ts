function pad(value: number, size = 2): string {
  return `${value}`.padStart(size, '0')
}

export function formatLocalIsoTimestamp(input = new Date()): string {
  const year = input.getFullYear()
  const month = pad(input.getMonth() + 1)
  const day = pad(input.getDate())
  const hours = pad(input.getHours())
  const minutes = pad(input.getMinutes())
  const seconds = pad(input.getSeconds())
  const milliseconds = pad(input.getMilliseconds(), 3)

  const offsetMinutes = -input.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffsetMinutes = Math.abs(offsetMinutes)
  const offsetHours = pad(Math.floor(absoluteOffsetMinutes / 60))
  const offsetRemainderMinutes = pad(absoluteOffsetMinutes % 60)

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${sign}${offsetHours}:${offsetRemainderMinutes}`
}

export function localIsoPinoTimestamp(): string {
  return `,"time":"${formatLocalIsoTimestamp()}"`
}
