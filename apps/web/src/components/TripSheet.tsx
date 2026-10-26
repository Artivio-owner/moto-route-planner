import { formatLocalTime, type Currency } from "@versta/calc";
import {
  formatDate,
  formatHours,
  formatKm,
  formatLiters,
  localTimeWithZone,
  money,
  pluralDays,
} from "../lib/format";
import type { PlanResult } from "../lib/plan";

export interface DayLabel {
  from: string;
  to: string;
}

interface Props {
  result: PlanResult | null;
  dayLabels: DayLabel[];
  currency: Currency;
  loading: boolean;
  error: string;
  longRoute: boolean;
  onShare(): void;
  onGpx(): void;
  onPdf(): void;
  pdfBusy: boolean;
}

/** Путевой лист в интерфейсе: сводка, дни, предупреждения, действия. */
export function TripSheet({
  result,
  dayLabels,
  currency,
  loading,
  error,
  longRoute,
  onShare,
  onGpx,
  onPdf,
  pdfBusy,
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
        Запас хода около {formatKm(plan.rangeKm)}. Ночей в пути: {plan.nights}.
      </p>
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
              {day.warnings.map((w) => (
                <p key={w.kind} className="warning">
                  {w.message}
                </p>
              ))}
            </li>
          );
        })}
      </ol>
      <p className="hint">
        Расчёты ориентировочные: цены, дороги и погода меняются. Проверяйте маршрут перед выездом.
      </p>
    </section>
  );
}
