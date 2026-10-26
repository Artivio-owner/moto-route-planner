import { FOOD_LABELS, FOOD_LEVELS, LODGING_LABELS, LODGING_TYPES } from "@versta/calc";
import type { Dispatch } from "react";
import { budgetDefaults } from "../config";
import type { Action, PlannerState } from "../state/planner";
import { Chips } from "./Chips";
import { NumberField } from "./NumberField";
import { PriceMark } from "./PriceMark";

interface Props {
  state: PlannerState;
  dispatch: Dispatch<Action>;
}

/** Параметры бюджета (C-05): жильё за номер, еда, кофе, прочее, резерв. */
export function BudgetCard({ state, dispatch }: Props) {
  const b = state.budget;
  const set = (patch: Partial<PlannerState["budget"]>) => dispatch({ type: "budget", patch });
  return (
    <section className="card" aria-labelledby="budget-title">
      <h2 id="budget-title">Бюджет</h2>
      <Chips
        label="Жильё"
        value={b.lodging}
        options={LODGING_TYPES.map((t) => ({ value: t, label: LODGING_LABELS[t] }))}
        onChange={(lodging) => {
          // Своя цена относится к прежнему типу жилья: при смене типа сбрасываем её.
          dispatch({ type: "resetBudgetPrice", field: "roomPriceRub" });
          set({ lodging });
        }}
      />
      {state.people === 2 && (
        <Chips
          label="Номеров на ночь"
          value={b.rooms}
          options={[
            { value: 1, label: "1" },
            { value: 2, label: "2" },
          ]}
          onChange={(rooms) => set({ rooms })}
        />
      )}
      <NumberField
        label="Цена номера в ночь"
        unit="₽"
        min={0}
        max={1000000}
        value={b.roomPriceRub ?? budgetDefaults.lodging.pricePerRoomRub[b.lodging]}
        onChange={(roomPriceRub) => set({ roomPriceRub })}
      />
      <PriceMark
        edited={b.roomPriceRub !== undefined}
        onReset={() => dispatch({ type: "resetBudgetPrice", field: "roomPriceRub" })}
      />
      <label className="field row" style={{ flexDirection: "row" }}>
        <input
          type="checkbox"
          checked={b.finalNight}
          onChange={(e) => set({ finalNight: e.target.checked })}
        />
        Ночь в конечной точке
      </label>

      <Chips
        label="Еда"
        value={b.food}
        options={FOOD_LEVELS.map((f) => ({ value: f, label: FOOD_LABELS[f] }))}
        onChange={(food) => {
          dispatch({ type: "resetBudgetPrice", field: "foodPriceRub" });
          set({ food });
        }}
      />
      <NumberField
        label="На человека в день"
        unit="₽"
        min={0}
        max={100000}
        value={b.foodPriceRub ?? budgetDefaults.food.perPersonDayRub[b.food]}
        onChange={(foodPriceRub) => set({ foodPriceRub })}
      />
      <PriceMark
        edited={b.foodPriceRub !== undefined}
        onReset={() => dispatch({ type: "resetBudgetPrice", field: "foodPriceRub" })}
      />

      <label className="field row" style={{ flexDirection: "row" }}>
        <input
          type="checkbox"
          checked={b.coffee}
          onChange={(e) => set({ coffee: e.target.checked })}
        />
        Кофе на заправках
      </label>
      {b.coffee && (
        <>
          <NumberField
            label="Цена кофе"
            unit="₽"
            min={0}
            max={10000}
            value={b.coffeePriceRub ?? budgetDefaults.coffee.priceRub}
            onChange={(coffeePriceRub) => set({ coffeePriceRub })}
          />
          <PriceMark
            edited={b.coffeePriceRub !== undefined}
            onReset={() => dispatch({ type: "resetBudgetPrice", field: "coffeePriceRub" })}
          />
        </>
      )}

      <div className="grid2">
        <NumberField
          label="Прочее"
          unit="₽"
          min={0}
          max={10000000}
          value={b.otherRub}
          onChange={(otherRub) => set({ otherRub })}
        />
        <NumberField
          label="Резерв"
          unit="%"
          min={0}
          max={100}
          value={b.reservePct}
          onChange={(reservePct) => set({ reservePct })}
        />
      </div>
      <p className="hint">
        «Прочее»: платные дороги, паромы, сувениры. Резерв: на ремонт и непредвиденное.
      </p>
    </section>
  );
}
