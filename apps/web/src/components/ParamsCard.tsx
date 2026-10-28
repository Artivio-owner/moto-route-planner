import { ROAD_CLASS_LABELS, ROAD_CLASSES, rangeKm } from "@versta/calc";
import type { Dispatch } from "react";
import { defaultFuelPrice, exchangeRate, presets, type FuelType } from "../config";
import { formatKm } from "../lib/format";
import { CUSTOM_PRESET, defaultSplit, type Action, type PlannerState } from "../state/planner";
import { Chips } from "./Chips";
import { NumberField } from "./NumberField";
import { PriceMark } from "./PriceMark";

interface Props {
  state: PlannerState;
  dispatch: Dispatch<Action>;
}

/** Параметры поездки, мотоцикла, дней и цен (C-04, C-16, C-12, M-04). */
export function ParamsCard({ state, dispatch }: Props) {
  const { profile } = state;
  const set = (patch: Partial<PlannerState>) => dispatch({ type: "set", patch });
  const range = Math.round(rangeKm(profile.tankL, profile.consumptionLPer100Km));
  return (
    <section className="card" aria-labelledby="params-title">
      <h2 id="params-title">Параметры</h2>

      <label className="field">
        <span>Дата старта</span>
        <input
          className="input"
          type="date"
          value={state.startDate}
          onChange={(e) => e.target.value && set({ startDate: e.target.value })}
        />
      </label>
      <div className="grid2">
        <Chips
          label="Людей"
          value={state.people}
          options={[
            { value: 1, label: "1" },
            { value: 2, label: "2" },
          ]}
          onChange={(people) => set({ people })}
        />
        <Chips
          label="Мотоциклов"
          value={state.motorcycles}
          options={[
            { value: 1, label: "1" },
            { value: 2, label: "2" },
          ]}
          onChange={(motorcycles) => set({ motorcycles })}
        />
      </div>
      {state.people === 2 && state.motorcycles === 1 && (
        <p className="hint">
          С пассажиром расход обычно выше: при необходимости увеличьте его вручную.
        </p>
      )}

      <Chips
        label="Мотоцикл"
        value={profile.presetId}
        options={[
          ...presets.map((p) => ({ value: p.id, label: p.name })),
          { value: CUSTOM_PRESET, label: "Свой" },
        ]}
        onChange={(id) => dispatch({ type: "preset", id })}
      />
      <div className="grid2">
        <NumberField
          label="Бак"
          unit="л"
          min={3}
          max={60}
          value={profile.tankL}
          onChange={(value) => dispatch({ type: "profileField", field: "tankL", value })}
        />
        <NumberField
          label="Расход"
          unit="л/100 км"
          min={1}
          max={20}
          value={profile.consumptionLPer100Km}
          onChange={(value) =>
            dispatch({ type: "profileField", field: "consumptionLPer100Km", value })
          }
        />
      </div>
      <p className="hint">Запас хода с резервом 10%: около {formatKm(range)}.</p>
      <details>
        <summary>Скорости и дневные лимиты</summary>
        <div className="grid2">
          {ROAD_CLASSES.map((cls) => (
            <NumberField
              key={cls}
              label={ROAD_CLASS_LABELS[cls][0]?.toUpperCase() + ROAD_CLASS_LABELS[cls].slice(1)}
              unit="км/ч"
              min={10}
              max={150}
              value={profile.speeds[cls]}
              onChange={(value) => dispatch({ type: "speed", field: cls, value })}
            />
          ))}
          <NumberField
            label="Лимит в день"
            unit="км"
            min={50}
            max={2000}
            value={profile.dailyLimitKm}
            onChange={(value) => dispatch({ type: "profileField", field: "dailyLimitKm", value })}
          />
          <NumberField
            label="Лимит в день"
            unit="ч"
            min={1}
            max={20}
            value={profile.dailyLimitH}
            onChange={(value) => dispatch({ type: "profileField", field: "dailyLimitH", value })}
          />
          <NumberField
            label="Тяжёлый день от"
            unit="км"
            min={50}
            max={2000}
            value={profile.heavyDayKm}
            onChange={(value) => dispatch({ type: "profileField", field: "heavyDayKm", value })}
          />
        </div>
        <p className="hint">
          Это ориентиры для расчёта, а не рекомендации: соблюдайте ограничения скорости.
        </p>
      </details>

      <Chips
        label="Дни"
        value={state.split.mode}
        options={[
          { value: "km", label: "По километрам" },
          { value: "hours", label: "По времени" },
          { value: "days", label: "По числу дней" },
          { value: "manual", label: "От города до города" },
        ]}
        onChange={(mode) => set({ split: defaultSplit(mode, profile) })}
      />
      {state.split.mode === "km" && (
        <NumberField
          label="Не больше в день"
          unit="км"
          min={50}
          max={2000}
          value={state.split.maxKmPerDay}
          onChange={(maxKmPerDay) => set({ split: { mode: "km", maxKmPerDay } })}
        />
      )}
      {state.split.mode === "hours" && (
        <>
          <NumberField
            label="Не больше в пути за день"
            unit="ч"
            min={1}
            max={20}
            value={state.split.maxHoursPerDay}
            onChange={(maxHoursPerDay) => set({ split: { mode: "hours", maxHoursPerDay } })}
          />
          <p className="hint">Время включает остановки на заправку и обед.</p>
        </>
      )}
      {state.split.mode === "days" && (
        <NumberField
          label="Уложиться в"
          unit="дней"
          min={1}
          max={100}
          value={state.split.days}
          onChange={(days) => set({ split: { mode: "days", days: Math.round(days) } })}
        />
      )}
      {state.split.mode === "manual" && (
        <p className="hint">Отметьте «Ночёвка здесь» у промежуточных точек маршрута.</p>
      )}

      <label className="field row" style={{ flexDirection: "row" }}>
        <input
          type="checkbox"
          checked={state.avoidUnpaved}
          onChange={(e) => set({ avoidUnpaved: e.target.checked })}
        />
        Избегать грунтовых дорог
      </label>
      <label className="field row" style={{ flexDirection: "row" }}>
        <input
          type="checkbox"
          checked={state.avoidToll === true}
          onChange={(e) => set({ avoidToll: e.target.checked })}
        />
        Избегать платных дорог
      </label>
      <label className="field row" style={{ flexDirection: "row" }}>
        <input
          type="checkbox"
          checked={state.avoidMotorways === true}
          onChange={(e) => set({ avoidMotorways: e.target.checked })}
        />
        Избегать автомагистралей
      </label>
      <label className="field row" style={{ flexDirection: "row" }}>
        <input
          type="checkbox"
          checked={state.curvy === true}
          onChange={(e) => set({ curvy: e.target.checked })}
        />
        Извилистые дороги
      </label>
      {state.curvy && (
        <p className="hint">
          Маршрут выбирает дороги с поворотами и избегает магистралей: путь длиннее, но интереснее.
          Грунт в этом режиме избегается всегда. Расчёт идёт дольше.
        </p>
      )}
      {(state.avoidToll || state.avoidMotorways) && (
        <p className="hint">
          Если объезда нет, маршрут всё равно пройдёт по такой дороге: в путевом листе она будет
          отмечена.
        </p>
      )}

      <Chips
        label="Валюта"
        value={state.currency}
        options={[
          { value: "RUB", label: "₽ рубли" },
          { value: "USD", label: "$ доллары" },
        ]}
        onChange={(currency) => set({ currency })}
      />
      <Chips
        label="Топливо"
        value={state.fuelType}
        options={(["92", "95", "100"] as FuelType[]).map((f) => ({ value: f, label: `АИ-${f}` }))}
        onChange={(fuelType) => set({ fuelType })}
      />
      <div className="grid2">
        <div>
          <NumberField
            label="Цена топлива"
            unit="₽/л"
            min={1}
            max={1000}
            value={state.fuelPriceRub ?? defaultFuelPrice(state.fuelType)}
            onChange={(fuelPriceRub) => set({ fuelPriceRub })}
          />
          <PriceMark
            edited={state.fuelPriceRub !== undefined}
            onReset={() => dispatch({ type: "resetPrice", field: "fuelPriceRub" })}
          />
        </div>
        <div>
          <NumberField
            label="Курс"
            unit="₽ за $"
            min={10}
            max={1000}
            value={state.rubPerUsd ?? exchangeRate.rubPerUsd}
            onChange={(rubPerUsd) => set({ rubPerUsd })}
          />
          <PriceMark
            edited={state.rubPerUsd !== undefined}
            onReset={() => dispatch({ type: "resetPrice", field: "rubPerUsd" })}
          />
        </div>
      </div>
    </section>
  );
}
