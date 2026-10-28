import { countryName, formatLocalTime, type Currency } from "@versta/calc";
import {
  formatDate,
  formatHours,
  formatKm,
  formatLiters,
  localTimeWithZone,
  money,
  pluralDays,
} from "../lib/format";
import type { DayWeather } from "../lib/api";
import { DonateBlock } from "./DonateBlock";
import type { ElevationStats, PlanResult } from "../lib/plan";
import { describeWeather, weatherSource, weatherWarnings } from "../lib/weather";

export interface DayLabel {
  from: string;
  to: string;
}

interface Props {
  result: PlanResult | null;
  dayLabels: DayLabel[];
  weather: (DayWeather | null)[];
  currency: Currency;
  loading: boolean;
  error: string;
  longRoute: boolean;
  onShare(): void;
  onGpx(): void;
  onPdf(): void;
  pdfBusy: boolean;
  /** Дневка после ходового дня (C-11). */
  onToggleRest(afterDay: number): void;
  /** Нет сети: расчёт из сохранённой копии (X-07). */
  offlineSavedAt?: number | undefined;
  /** Набор высоты по дням и за поездку (E-01); null без данных высот. */
  elevation?: { days: (ElevationStats | null)[]; total: ElevationStats | null };
}

/** Путевой лист в интерфейсе: сводка, дни, предупреждения, действия. */
export function TripSheet({
  result,
  dayLabels,
  weather,
  currency,
  loading,
  error,
  longRoute,
  onShare,
  onGpx,
  onPdf,
  pdfBusy,
  onToggleRest,
  offlineSavedAt,
  elevation,
}: Props) {
  if (error) {
    return (
      <section className="card" aria-labelledby="sheet-title">
        <h2 id="sheet-title">Путевой лист</h2>
        <p className="error" role="alert">
          {error}
        </p>
      </section>
    );
  }
  if (!result) {
    return (
      <section className="card" aria-labelledby="sheet-title">
        <h2 id="sheet-title">Путевой лист</h2>
        <p className="empty">
          {loading
            ? "Считаем маршрут…"
            : "Укажите, откуда и куда едете: введите адрес или кликните по карте."}
        </p>
      </section>
    );
  }
  const { plan, rubPerUsd, fuelPriceEdited } = result;
  const rate = rubPerUsd;
  return (
    <section className="card" aria-labelledby="sheet-title" aria-busy={loading}>
      <h2 id="sheet-title">Путевой лист</h2>
      {offlineSavedAt !== undefined && (
        <p className="warning" role="status">
          Нет сети: показан расчёт, сохранённый{" "}
          {new Date(offlineSavedAt).toLocaleString("ru-RU", {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
          . Карта и погода появятся, когда сеть вернётся.
        </p>
      )}
      <div className="summary">
        <div>
          <div className="figure">{formatKm(plan.distanceKm)}</div>
          <div className="figure-label">{pluralDays(plan.days.length)}</div>
        </div>
        <div>
          <div className="figure">{formatHours(plan.totalH)}</div>
          <div className="figure-label">в пути с остановками</div>
        </div>
        <div>
          <div className="figure">{formatLiters(plan.liters)}</div>
          <div className="figure-label">
            топлива, заправок: {plan.fuelStops}
            {plan.group.motorcycles === 2 ? " (на 2 мотоцикла)" : ""}
          </div>
        </div>
        <div>
          <div className="figure">{money(plan.fuelCostRub, currency, rate)}</div>
          <div className="figure-label">
            на топливо{" "}
            <span className={`mark${fuelPriceEdited ? " edited" : ""}`}>
              {fuelPriceEdited ? "ваша цена" : "ориентировочно"}
            </span>
          </div>
        </div>
      </div>
      <p className="hint">
        Запас хода около {formatKm(plan.rangeKm)}. Ночей в пути: {plan.nights}
        {plan.restDays > 0 ? `, из них дневок: ${plan.restDays}` : ""}.
        {elevation?.total &&
          ` Набор высоты ${Math.round(elevation.total.ascentM)} м, высоты от ${Math.round(elevation.total.minM)} до ${Math.round(elevation.total.maxM)} м.`}
      </p>
      {result.countryFuelPrices.length > 1 && (
        <p className="hint">
          Страны: {plan.countries.map(countryName).join(" → ")}. Топливо:{" "}
          {result.countryFuelPrices
            .map((c) => `${countryName(c.country)} ${money(c.priceRub, currency, rate)}/л`)
            .join(", ")}{" "}
          <span className="mark">ориентировочно</span>
        </p>
      )}
      <BudgetSummary result={result} currency={currency} />
      {longRoute && (
        <p className="warning">
          Длинный маршрут: пересчёт и PDF займут больше времени. Ограничений по длине нет.
        </p>
      )}
      {(plan.hasToll || plan.hasFerry) && (
        <p className="warning">
          На маршруте есть{" "}
          {[plan.hasToll && "платные участки", plan.hasFerry && "паромы"]
            .filter(Boolean)
            .join(" и ")}
          : их стоимость не входит в расчёт, учтите её отдельно.
        </p>
      )}
      <div className="actions" style={{ margin: "12px 0" }}>
        <button type="button" className="btn accent" onClick={onPdf} disabled={pdfBusy}>
          {pdfBusy ? "Готовим PDF…" : "Скачать PDF"}
        </button>
        <button type="button" className="btn ghost" onClick={onGpx}>
          GPX
        </button>
        <button type="button" className="btn ghost" onClick={onShare}>
          Поделиться
        </button>
      </div>
      <ol className="days" aria-label="Дни поездки">
        {plan.days.map((day, i) => {
          const label = dayLabels[i];
          const w = weather[i];
          const isLastRiding = !plan.days.slice(i + 1).some((d) => !d.rest);
          if (day.rest) {
            return (
              <li key={day.number} className="day rest">
                <div className="day-title">
                  День {day.number} · {formatDate(day.date)} · дневка
                </div>
                {label && <div className="day-route">Отдых: {label.to}</div>}
                <div className="day-meta">
                  <span>0 км</span>
                  {day.sunset && <span>закат {formatLocalTime(day.sunset, day.endTimeZone)}</span>}
                  {w && (
                    <span>
                      {describeWeather(w)} <span className="mark">{weatherSource(w)}</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => onToggleRest(day.ridingNumber)}
                >
                  Убрать дневку
                </button>
              </li>
            );
          }
          const restNext = plan.days[i + 1]?.rest === true;
          return (
            <li key={day.number} className="day">
              <div className="day-title">
                День {day.number} · {formatDate(day.date)}
              </div>
              {label && (
                <div className="day-route">
                  {label.from} — {label.to}
                </div>
              )}
              <div className="day-meta">
                <span>{formatKm(day.distanceKm)}</span>
                <span>в пути {formatHours(day.totalH)}</span>
                <span>заправок {day.fuelStopsKm.length}</span>
                {elevation?.days[i] && (
                  <span>набор {Math.round(elevation.days[i]?.ascentM ?? 0)} м</span>
                )}
                <span>{money(day.fuelCostRub, currency, rate)}</span>
              </div>
              <div className="day-meta">
                <span>старт {localTimeWithZone(day.departure, day.startTimeZone)}</span>
                <span>финиш {localTimeWithZone(day.arrival, day.endTimeZone)}</span>
                {day.sunset && <span>закат {formatLocalTime(day.sunset, day.endTimeZone)}</span>}
                {day.polar === "day" && <span>полярный день</span>}
                {day.zoneShiftH !== 0 && (
                  <span>
                    пояс {day.zoneShiftH > 0 ? "+" : ""}
                    {day.zoneShiftH} ч
                  </span>
                )}
              </div>
              {(day.hasToll || day.hasFerry) && (
                <div className="day-meta">
                  {day.hasToll && <span className="mark">платный участок</span>}
                  {day.hasFerry && <span className="mark">паром</span>}
                </div>
              )}
              {w && (
                <div className="day-meta">
                  <span>
                    {describeWeather(w)} <span className="mark">{weatherSource(w)}</span>
                  </span>
                </div>
              )}
              {w &&
                weatherWarnings(w).map((text) => (
                  <p key={text} className="warning">
                    {text}
                  </p>
                ))}
              {day.warnings.map((w) => (
                <p key={w.kind} className="warning">
                  {w.message}
                </p>
              ))}
              {!isLastRiding && !restNext && (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => onToggleRest(day.ridingNumber)}
                >
                  Дневка после этого дня
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="hint">
        Расчёты ориентировочные: цены, дороги и погода меняются. Проверяйте маршрут перед выездом.
      </p>
      {weather.some(Boolean) && (
        <p className="hint">
          Погода:{" "}
          <a href="https://open-meteo.com/" rel="noopener">
            Open-Meteo.com
          </a>{" "}
          (CC BY 4.0). Дальше 16 дней показываем климатическую норму за прошлые годы.
        </p>
      )}
      <DonateBlock compact />
    </section>
  );
}

function BudgetSummary({ result, currency }: { result: PlanResult; currency: Currency }) {
  const { budget, rubPerUsd } = result;
  const m = (rub: number) => money(rub, currency, rubPerUsd);
  const rows: [string, number][] = [
    ["Топливо", budget.fuel],
    [`Жильё, ночей: ${budget.nightsPaid}`, budget.lodging],
    ["Еда", budget.food],
    ["Кофе на заправках", budget.coffee],
    ["Прочее", budget.other],
    ["Резерв", budget.reserve],
  ];
  return (
    <details className="budget" open>
      <summary>
        <span className="figure">{m(budget.total)}</span>{" "}
        <span className="figure-label">бюджет поездки</span>{" "}
        <span className="mark">ориентировочно</span>
      </summary>
      <table className="budget-table">
        <tbody>
          {rows
            .filter(([, value]) => value > 0)
            .map(([label, value]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{m(value)}</td>
              </tr>
            ))}
          <tr>
            <td>На человека</td>
            <td>{m(budget.perPerson)}</td>
          </tr>
        </tbody>
      </table>
    </details>
  );
}
