import { useRef, type Dispatch } from "react";
import { isComplete, type Action, type PlannerState } from "../state/planner";
import { PlaceInput } from "./PlaceInput";

interface Props {
  state: PlannerState;
  dispatch: Dispatch<Action>;
  /** Загрузка GPX-файла (X-05). */
  onGpxFile(file: File): void;
}

/** Точки маршрута: откуда, через, куда (R-03, R-05, R-06). */
export function PointsCard({ state, dispatch, onGpxFile }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const last = state.points.length - 1;
  const manual = state.split.mode === "manual";
  return (
    <section className="card" aria-labelledby="points-title">
      <h2 id="points-title">Маршрут</h2>
      <ol className="points">
        {state.points.map((point, i) => {
          const role = i === 0 ? "Откуда" : i === last ? "Куда" : "Через";
          const intermediate = i > 0 && i < last;
          return (
            <li key={point.id} className="point">
              <span className={`point-dot${i === last ? " end" : ""}`} aria-hidden="true" />
              <div>
                <PlaceInput
                  label={`${role}, точка ${i + 1}`}
                  value={point.name}
                  placeholder={role}
                  confirmed={isComplete(point)}
                  onType={(name) => dispatch({ type: "typeName", id: point.id, name })}
                  onPick={(place) =>
                    dispatch({
                      type: "placePoint",
                      id: point.id,
                      name: place.name,
                      lat: place.lat,
                      lon: place.lon,
                    })
                  }
                />
                {(intermediate || (state.roundTrip && i === last)) && manual && (
                  <label className="point-extra">
                    <input
                      type="checkbox"
                      checked={point.overnight ?? false}
                      onChange={() => dispatch({ type: "toggleOvernight", id: point.id })}
                    />
                    Ночёвка здесь
                  </label>
                )}
                <div className="point-tools">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Поднять точку ${i + 1}`}
                    disabled={i === 0}
                    onClick={() => dispatch({ type: "movePoint", id: point.id, delta: -1 })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Опустить точку ${i + 1}`}
                    disabled={i === last}
                    onClick={() => dispatch({ type: "movePoint", id: point.id, delta: 1 })}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Убрать точку ${i + 1}`}
                    onClick={() => dispatch({ type: "removePoint", id: point.id })}
                  >
                    ×
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div
        className="row"
        style={{ marginTop: 10, justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <button
          type="button"
          className="btn ghost small"
          onClick={() => dispatch({ type: "addPoint" })}
        >
          + Промежуточная точка
        </button>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => fileInput.current?.click()}
        >
          Загрузить GPX
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".gpx,application/gpx+xml"
          aria-label="GPX-файл"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onGpxFile(file);
            e.target.value = "";
          }}
        />
        <label className="row">
          <input
            type="checkbox"
            checked={state.roundTrip}
            onChange={(e) => dispatch({ type: "set", patch: { roundTrip: e.target.checked } })}
          />
          С возвратом
        </label>
      </div>
      <p className="hint">Точку можно поставить кликом по карте и передвинуть мышью.</p>
    </section>
  );
}
