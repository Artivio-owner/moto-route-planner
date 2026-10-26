"""Сквозная проверка API на живом GraphHopper с синтетической сетью (CI, задание «Мото-модели»)."""
import json
import sys
import urllib.request

body = json.dumps({"points": [{"lat": 55.0, "lon": 37.0}, {"lat": 55.0, "lon": 38.7}]}).encode()
request = urllib.request.Request("http://localhost:8080/api/route", data=body, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(request, timeout=30) as response:
    route = json.load(response)
segments = route["legs"][0]["segments"]
checks = {
    "маршрут построен": route["distanceKm"] > 100,
    "платный участок": any(s.get("toll") for s in segments),
    "паром с временем": any(s.get("ferry") and s.get("fixedDurationH", 0) > 0.5 for s in segments),
    "часовой пояс Москвы": route["zones"][0]["timeZone"] == "Europe/Moscow",
}
for name, ok in checks.items():
    print(("ок      " if ok else "ОШИБКА  ") + name)
if not all(checks.values()):
    sys.exit(1)
