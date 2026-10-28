"""Сквозная проверка API на живом GraphHopper с синтетической сетью (CI, задание «Мото-модели»)."""
import json
import sys
import urllib.request

POINTS = [{"lat": 55.0, "lon": 37.0}, {"lat": 55.0, "lon": 38.7}]


def post(payload):
    body = json.dumps(payload).encode()
    request = urllib.request.Request("http://localhost:8080/api/route", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


route = post({"points": POINTS})
segments = route["legs"][0]["segments"]
free = post({"points": POINTS, "avoidToll": True, "avoidMotorways": True})
free_segments = free["legs"][0]["segments"]
checks = {
    "маршрут построен": route["distanceKm"] > 100,
    "платный участок": any(s.get("toll") for s in segments),
    "паром с временем": any(s.get("ferry") and s.get("fixedDurationH", 0) > 0.5 for s in segments),
    "часовой пояс Москвы": route["zones"][0]["timeZone"] == "Europe/Moscow",
    "без платных (M-02): нет платных участков": not any(s.get("toll") for s in free_segments),
    "без магистралей (M-02): нет класса motorway": all(s["roadClass"] != "motorway" for s in free_segments),
    "объезд длиннее": free["distanceKm"] > route["distanceKm"],
    "высоты (E-01): есть у каждой точки": all(len(l.get("elevation", [])) == len(l["geometry"]) for l in route["legs"]),
    "высоты (E-01): перевал из тестового SRTM": max(e for l in route["legs"] for e in l.get("elevation", [0])) > 300,
    "АЗС вдоль маршрута (P-07)": any(p["kind"] == "fuel" and p["name"] == "АЗС у Объезда" for p in route.get("pois", [])),
    "гостиница рядом с дорогой (P-07)": any(p["kind"] == "hotel" for p in route.get("pois", [])),
    "дальний кемпинг не попал": not any(p["kind"] == "camp_site" for p in route.get("pois", [])),
    "деревня для границ дня (C-10)": any(p["kind"] == "village" for p in route.get("pois", [])),
}
for name, ok in checks.items():
    print(("ок      " if ok else "ОШИБКА  ") + name)
if not all(checks.values()):
    sys.exit(1)
