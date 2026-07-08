import type { DayWeather } from '../types'
import { weatherEmoji, weatherLabel } from '../api/weather'

export default function WeatherBadge({ weather }: { weather?: DayWeather }) {
  if (!weather) {
    return <span className="weather-badge muted">Forecast pending</span>
  }
  return (
    <span
      className="weather-badge"
      title={`${weatherLabel(weather.code)} · precipitation ${weather.precipProbability}% · wind up to ${Math.round(weather.windMax)} km/h`}
    >
      <span aria-hidden>{weatherEmoji(weather.code)}</span> {weatherLabel(weather.code)} ·{' '}
      {Math.round(weather.tMax)}° / {Math.round(weather.tMin)}°
      {weather.precipProbability >= 30 && <> · ☔ {weather.precipProbability}%</>}
    </span>
  )
}
