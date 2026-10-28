import {
  buildGpx,
  decodeState,
  encodeState,
  exportFileName,
  STATE_HASH_PREFIX,
  parseGpx,
} from "@versta/route-format";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { BudgetCard } from "../components/BudgetCard";
import { HistoryCard } from "../components/HistoryCard";
import { MapView, type MapPoint } from "../components/MapView";
import { ParamsCard } from "../components/ParamsCard";
import { PointsCard } from "../components/PointsCard";
import { TripSheet, type DayLabel } from "../components/TripSheet";
import { LONG_LINK_CHARS, tripDefaults } from "../config";

/** Предел размера GPX-файла: больше обычно бывают только многодневные треки с частой записью. */
const GPX_MAX_BYTES = 20 * 1024 * 1024;
import { coordsName, reversePlace, type LonLat } from "../lib/api";
import { downloadBlob } from "../lib/download";
import { computePlan, pointAtKm, routeLine, sliceLine } from "../lib/plan";
import { useRoute } from "../lib/useRoute";
import { useWeather } from "../lib/useWeather";
import { clearHistory, readHistory, saveToHistory, type HistoryEntry } from "../state/history";
import {
  completePoints,
  fromRouteState,
  initialState,
  isComplete,
  reducer,
  routeTitle,
  toRouteState,
} from "../state/planner";

function useToast(): [string, (text: string) => void] {
  const [text, setText] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((value: string) => {
    setText(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(""), 3500);
  }, []);
  return [text, show];
}

export function PlannerPage() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState());
  const [loadError, setLoadError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>(() => readHistory());
  const [encoded, setEncoded] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [toast, showToast] = useToast();
  const loaded = useRef(false);
  const { route, loading, error, offlineSavedAt } = useRoute(state);

  // Маршрут из ссылки (#r=...).
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith(STATE_HASH_PREFIX)) {
      loaded.current = true;
      return;
    }
    decodeState(hash.slice(STATE_HASH_PREFIX.length))
      .then((routeState) => dispatch({ type: "load", state: fromRouteState(routeState) }))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Ссылка повреждена"))
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  // Состояние в адресе: ссылкой можно поделиться (ADR-0005).
  useEffect(() => {
    if (!loaded.current) return;
    const routeState = toRouteState(state);
    if (routeState.points.length < 2) return;
    let cancelled = false;
    void encodeState(routeState).then((value) => {
      if (cancelled) return;
      setEncoded(value);
      window.history.replaceState(null, "", `/plan${STATE_HASH_PREFIX}${value}`);
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  const result = useMemo(() => {
    if (!route) return null;
    try {
      return computePlan(state, route);
    } catch {
      return null;
    }
  }, [state, route]);

  // История: сохраняем удачно посчитанный маршрут.
  useEffect(() => {
    if (!result || !encoded) return;
    setHistory(
      saveToHistory({
        encoded,
        title: routeTitle(completePoints(state)),
        startDate: state.startDate,
      }),
    );
    // Только при новом маршруте или ссылке.
  }, [encoded, result === null]);

  const line = useMemo(
    () => (route ? routeLine(route) : { points: [] as LonLat[], km: [] as number[] }),
    [route],
  );

  const mapPoints = useMemo<MapPoint[]>(() => {
    const complete = state.points.filter(isComplete);
    return complete.map((p, i) => ({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      label: i === 0 ? "А" : i === complete.length - 1 ? "Б" : String(i),
      end: i === complete.length - 1,
    }));
  }, [state.points]);

  // Подписи дней: в ручном режиме точки ночёвки, иначе ближайший населённый пункт.
  const [placeNames, setPlaceNames] = useState<Record<string, string>>({});
  const dayLabels = useMemo<DayLabel[]>(() => {
    if (!result || !route) return [];
    const points = completePoints(state);
    const legEnds: { km: number; name: string }[] = [];
    let km = 0;
    route.legs.forEach((leg, i) => {
      km += leg.distanceKm;
      legEnds.push({ km, name: points[i + 1]?.name ?? points[0]?.name ?? "" });
    });
    const nameAt = (atKm: number): string => {
      const exact = legEnds.find((e) => Math.abs(e.km - atKm) < 0.05);
      if (exact) return exact.name;
      const key = Math.round(atKm).toString();
      return placeNames[key] ? `≈ ${placeNames[key]}` : `${Math.round(atKm)}-й км`;
    };
    return result.plan.days.map((day) => ({
      from: day.startKm === 0 && !day.rest ? (points[0]?.name ?? "Старт") : nameAt(day.startKm),
      to: nameAt(day.endKm),
    }));
  }, [result, route, state, placeNames]);

  useEffect(() => {
    if (!result || state.split.mode !== "km") return;
    const missing = result.plan.days
      .slice(0, -1)
      .map((d) => Math.round(d.endKm))
      .filter((k) => placeNames[String(k)] === undefined);
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      const found: Record<string, string> = {};
      for (const k of missing.slice(0, 30)) {
        const [lon, lat] = pointAtKm(line, k);
        const place = await reversePlace(lat, lon);
        found[String(k)] = place?.name ?? "";
      }
      if (!cancelled) setPlaceNames((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
  }, [result, line, state.split.mode, placeNames]);

  const weatherRequests = useMemo(
    () =>
      result
        ? result.plan.days.map((d) => {
            const [lon, lat] = pointAtKm(line, d.endKm);
            return { lat, lon, date: d.date };
          })
        : [],
    [result, line],
  );
  const weather = useWeather(weatherRequests);

  const nights = useMemo(
    () =>
      result
        ? result.plan.days
            .slice(0, -1)
            .filter((d, i) => !result.plan.days[i + 1]?.rest)
            .map((d) => ({
              position: pointAtKm(line, d.endKm),
              label: d.rest ? `Дневка, ночь ${d.number}` : `Ночь ${d.number}`,
            }))
        : [],
    [result, line],
  );

  async function addFromMap(lat: number, lon: number) {
    const place = await reversePlace(lat, lon);
    dispatch({ type: "addFromMap", name: place?.name ?? coordsName(lat, lon), lat, lon });
  }

  async function dragPoint(id: string, lat: number, lon: number) {
    const place = await reversePlace(lat, lon);
    dispatch({ type: "placePoint", id, name: place?.name ?? coordsName(lat, lon), lat, lon });
  }

  async function importGpx(file: File) {
    if (file.size > GPX_MAX_BYTES) {
      showToast("Файл больше 20 МБ: выберите файл поменьше");
      return;
    }
    try {
      const parsed = parseGpx(await file.text());
      const points = parsed.points.map((p, i) => ({
        name: p.name ?? coordsName(p.lat, p.lon),
        lat: p.lat,
        lon: p.lon,
        index: i,
      }));
      dispatch({ type: "importPoints", points });
      const what =
        parsed.source === "track"
          ? `трек прорежен до ${points.length} точек, маршрут построен заново по нашим дорогам`
          : `точек: ${points.length}`;
      showToast(`GPX загружен: ${what}${parsed.truncated ? " (часть точек пропущена)" : ""}`);
      // Точкам без названия подбираем ближайший населённый пункт.
      for (const p of points) {
        if (parsed.points[p.index]?.name) continue;
        const place = await reversePlace(p.lat, p.lon);
        if (place) dispatch({ type: "renameAt", lat: p.lat, lon: p.lon, name: place.name });
      }
    } catch (e) {
      showToast(
        e instanceof Error ? `Не удалось открыть GPX: ${e.message}` : "Не удалось открыть GPX",
      );
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast(
        url.length > LONG_LINK_CHARS
          ? "Ссылка скопирована, но она очень длинная: сохраните ещё и GPX"
          : "Ссылка скопирована",
      );
    } catch {
      window.prompt("Скопируйте ссылку", url);
    }
  }

  function gpx() {
    if (!result) return;
    const points = completePoints(state);
    const days = result.plan.days.flatMap((d, i) =>
      d.rest
        ? []
        : [
            {
              name: `День ${d.number}: ${dayLabels[i]?.from ?? ""} — ${dayLabels[i]?.to ?? ""}`,
              points: sliceLine(line, d.startKm, d.endKm).map(([lon, lat]) => ({ lat, lon })),
            },
          ],
    );
    const file = buildGpx({
      name: routeTitle(points),
      createdAt: new Date().toISOString(),
      waypoints: points.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon })),
      days,
    });
    const first = points[0]?.name ?? "старт";
    const last = points[points.length - 1]?.name ?? "финиш";
    downloadBlob(
      new Blob([file], { type: "application/gpx+xml" }),
      exportFileName(first, last, state.startDate, "gpx"),
    );
  }

  async function pdf() {
    if (!result || !route) return;
    setPdfBusy(true);
    try {
      const { buildReport } = await import("../pdf/report");
      const points = completePoints(state);
      const bytes = await buildReport({
        state,
        result,
        line,
        dayLabels,
        url: window.location.href,
      });
      const first = points[0]?.name ?? "старт";
      const last = points[points.length - 1]?.name ?? "финиш";
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        exportFileName(first, last, state.startDate, "pdf"),
      );
    } catch (e) {
      showToast(
        e instanceof Error ? `Не удалось собрать PDF: ${e.message}` : "Не удалось собрать PDF",
      );
    } finally {
      setPdfBusy(false);
    }
  }

  const status = loading
    ? "Считаем маршрут…"
    : mapPoints.length < 2
      ? "Кликните по карте, чтобы поставить точку"
      : "";

  return (
    <main className="planner">
      <div className="column">
        {loadError && (
          <p className="error" role="alert">
            {loadError}
          </p>
        )}
        <PointsCard state={state} dispatch={dispatch} onGpxFile={(f) => void importGpx(f)} />
        <ParamsCard state={state} dispatch={dispatch} />
        <BudgetCard state={state} dispatch={dispatch} />
        <HistoryCard
          entries={history}
          onOpen={(entry) => {
            window.location.hash = `${STATE_HASH_PREFIX.slice(1)}${entry.encoded}`;
            void decodeState(entry.encoded).then((s) =>
              dispatch({ type: "load", state: fromRouteState(s) }),
            );
          }}
          onClear={() => {
            clearHistory();
            setHistory([]);
          }}
        />
      </div>
      <div className="column map-column">
        <MapView
          points={mapPoints}
          line={line.points}
          nights={nights}
          status={status}
          onMapClick={(lat, lon) => void addFromMap(lat, lon)}
          onMarkerDrag={(id, lat, lon) => void dragPoint(id, lat, lon)}
        />
      </div>
      <div className="column sheet-column">
        <TripSheet
          result={result}
          dayLabels={dayLabels}
          weather={weather}
          currency={state.currency}
          loading={loading}
          error={error}
          longRoute={(route?.distanceKm ?? 0) > tripDefaults.longRouteWarningKm}
          onShare={() => void share()}
          onGpx={gpx}
          onPdf={() => void pdf()}
          pdfBusy={pdfBusy}
          onToggleRest={(afterDay) => dispatch({ type: "toggleRest", afterDay })}
          offlineSavedAt={offlineSavedAt}
        />
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
