import { format, isMatch, parse } from 'date-fns'

export function parseDate (s: string): Date {
  if (isMatch(s, 'yyyy-MM-dd')) {
    return parse(s, 'yyyy-MM-dd', 0)
  }
  throw new Error(`Failed to parse date: ${s}`)
}

export function formatDate (d: Date): string {
  return format(d, 'yyyy-MM-dd')
}
