"""Проверка мото-моделей GraphHopper на синтетической сети (спайк S-01).

Ожидает GraphHopper на http://localhost:8989, запущенный на synthetic.osm.
Запуск: python3 check_profiles.py
"""
import json
import sys
import urllib.request

URL = "http://localhost:8989/route"


AVOID = {
    "priority": [
        {"if": "toll == ALL", "multiply_by": "0.1"},
        {"if": "road_class == MOTORWAY", "multiply_by": "0.1"},
    ]
}


def route(a, b, profile, custom_model=None):
    body = {
        "points": [[a[1], a[0]], [b[1], b[0]]],
        "profile": profile,
        "points_encoded": False,
        "details": ["road_class", "surface", "toll", "road_environment", "street_name"],
    }
    if profile == "moto_curvy" or custom_model:
        body["ch.disable"] = True
    if custom_model:
        body["custom_model"] = custom_model
    request = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)["paths"][0]


def values(path, detail):
    return {str(v) for _, _, v in path["details"][detail]}


failures = []


def check(name, condition):
    print(("ок      " if condition else "ОШИБКА  ") + name)
    if not condition:
        failures.append(name)


paved = route((55.0, 37.0), (55.0, 37.2), "moto")
unpaved = route((55.0, 37.0), (55.0, 37.2), "moto_unpaved")
check("moto объезжает гравийку по асфальту", values(paved, "street_name") == {"Объезд"})
check("moto_unpaved едет по гравийке", "Гравийка" in values(unpaved, "street_name"))

toll = route((55.0, 37.45), (55.0, 37.75), "moto")
check("платный участок помечен (toll = all)", "all" in values(toll, "toll"))
# Точки до и после платной магистрали: между ними есть бесплатный объезд.
via_toll = route((55.0, 37.3), (55.0, 37.9), "moto")
check("без избегания едет по платной магистрали", "Платная" in values(via_toll, "street_name"))
free = route((55.0, 37.3), (55.0, 37.9), "moto", AVOID)
check("с избеганием (M-02) объезжает платную магистраль", "Платная" not in values(free, "street_name"))
check("с избеганием нет платных участков", "all" not in values(free, "toll"))
check("объезд по бесплатной дороге", "Бесплатная" in values(free, "street_name"))
stuck = route((55.0, 37.45), (55.0, 37.75), "moto", AVOID)
check("если объезда нет, маршрут всё равно строится", stuck["distance"] > 0)

ferry = route((55.0, 37.95), (55.0, 38.25), "moto")
check("паром помечен (road_environment = ferry)", "ferry" in values(ferry, "road_environment"))
check("время парома из duration (40 мин) учтено", ferry["time"] >= 40 * 60 * 1000)

straight = route((55.0, 38.4), (55.0, 38.7), "moto")
curvy = route((55.0, 38.4), (55.0, 38.7), "moto_curvy")
check("moto выбирает прямую магистраль", values(straight, "street_name") == {"Прямая"})
check("moto_curvy выбирает серпантин", "Серпантин" in values(curvy, "street_name"))

if failures:
    sys.exit(f"Не прошло проверок: {len(failures)}")
print("Все проверки прошли")
