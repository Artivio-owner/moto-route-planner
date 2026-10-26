import { useEffect, useMemo, useState } from "react";
import { completePoints, type PlannerState } from "../state/planner";
import { ApiError, fetchRoute, type RouteResponse } from "./api";

export interface RouteStatus {
  route: RouteResponse | null;
  loading: boolean;
  error: string;
}

/** Маршрут пересчитывается только при смене точек, возврата или грунта (R-09). */
export function useRoute(state: PlannerState): RouteStatus {
  const points = completePoints(state);
  const key = JSON.stringify([
    points.map((p) => [p.lat, p.lon]),
    state.roundTrip,
    state.avoidUnpaved,
  ]);
  const request = useMemo(
    () => ({
      points: completePoints(state),
      roundTrip: state.roundTrip,
      avoidUnpaved: state.avoidUnpaved,
    }),
    [key],
  );
  const [status, setStatus] = useState<RouteStatus>({ route: null, loading: false, error: "" });

  useEffect(() => {
    if (request.points.length < 2) {
      setStatus({ route: null, loading: false, error: "" });
      return;
    }
    const controller = new AbortController();
    setStatus((s) => ({ ...s, loading: true, error: "" }));
    const timer = window.setTimeout(async () => {
      try {
        const route = await fetchRoute(request.points, request, controller.signal);
        setStatus({ route, loading: false, error: "" });
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus({
          route: null,
          loading: false,
          error: error instanceof ApiError ? error.message : "Не удалось построить маршрут",
        });
      }
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [request]);

  return status;
}
