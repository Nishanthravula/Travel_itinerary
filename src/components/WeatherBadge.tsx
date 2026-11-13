import type { DayWeather } from '../types'
import { weatherLabel } from '../api/weather'
import { CloudIcon, RainIcon, SnowIcon, SunIcon } from '../ui/icons'

function iconFor(code: number) {
  if (code <= 1) return SunIcon
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return SnowIcon
  if (code >= 51) return RainIcon
  return CloudIcon
}

export default function WeatherBadge({ weather }: { weather?: DayWeather }) {
  if (!weather) return <span className="weather weather-pending">Forecast not out yet</span>
  const Icon = iconFor(weather.code)
  return (
    <span
      className="weather"
      title={`Wind up to ${Math.round(weather.windMax)} km/h, sunset ${weather.sunset}`}
    >
      <Icon size={16} />
      {weatherLabel(weather.code)}, {Math.round(weather.tMax)}° / {Math.round(weather.tMin)}°
      {weather.precipProbability >= 30 && <>, {weather.precipProbability}% rain</>}
    </span>
  )
}
