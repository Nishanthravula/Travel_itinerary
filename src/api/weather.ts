import type { DayWeather, Destination } from '../types'
import { addDaysISO } from '../types'

/** Open-Meteo serves reliable daily forecasts up to 16 days ahead. */
export const FORECAST_HORIZON_DAYS = 16

interface DailyResponse {
  daily?: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: (number | null)[]
    wind_speed_10m_max: number[]
    sunrise: string[]
    sunset: string[]
  }
}

/**
 * Fetch the daily forecast for the trip window. Days beyond the 16-day
 * horizon come back absent — the planner and UI handle that gracefully.
 */
export async function fetchTripWeather(
  dest: Destination,
  startDate: string,
  days: number,
): Promise<Map<string, DayWeather>> {
  const todayLocal = new Date().toISOString().slice(0, 10)
  const horizonEnd = addDaysISO(todayLocal, FORECAST_HORIZON_DAYS - 1)
  const endDate = addDaysISO(startDate, days - 1)

  const byDate = new Map<string, DayWeather>()
  if (startDate > horizonEnd) return byDate // entirely out of range

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(dest.lat))
  url.searchParams.set('longitude', String(dest.lon))
  url.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'sunrise',
      'sunset',
    ].join(','),
  )
  url.searchParams.set('timezone', dest.timezone)
  url.searchParams.set('start_date', startDate < todayLocal ? todayLocal : startDate)
  url.searchParams.set('end_date', endDate > horizonEnd ? horizonEnd : endDate)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Weather fetch failed (HTTP ${res.status})`)
  const data = (await res.json()) as DailyResponse
  const d = data.daily
  if (!d) return byDate

  d.time.forEach((date, i) => {
    byDate.set(date, {
      date,
      code: d.weather_code[i],
      tMax: d.temperature_2m_max[i],
      tMin: d.temperature_2m_min[i],
      precipProbability: d.precipitation_probability_max[i] ?? 0,
      windMax: d.wind_speed_10m_max[i],
      sunrise: d.sunrise[i]?.slice(11, 16) ?? '06:30',
      sunset: d.sunset[i]?.slice(11, 16) ?? '19:00',
    })
  })
  return byDate
}

/** Human-readable label for a WMO weather code. */
export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Rain showers'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code >= 95) return 'Thunderstorm'
  return 'Mixed conditions'
}

export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 51 && code <= 67) return '🌧️'
  if (code >= 71 && code <= 77) return '❄️'
  if (code >= 80 && code <= 82) return '🌦️'
  if (code === 85 || code === 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '🌥️'
}

/** True when the day is a poor pick for outdoor sightseeing. */
export function isBadWeather(w: DayWeather): boolean {
  return w.precipProbability >= 55 || (w.code >= 61 && w.code !== 71) || w.code >= 95
}
