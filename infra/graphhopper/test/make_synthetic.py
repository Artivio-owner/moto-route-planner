"""Синтетическая сеть OSM для проверки мото-моделей GraphHopper (спайк S-01).

Сценарии:
1. A → B: прямо по гравийке или объездом по асфальту (избегание грунта).
2. D → E: платная автомагистраль (пометка toll).
3. F → G: паром (road_environment = ferry).
4. H → K: прямая магистраль или извилистая региональная дорога (режим «извилистые»).
5. D → E: бесплатный объезд платной магистрали по региональной дороге (M-02).
6. АЗС и гостиница у дороги B → D (слой POI, P-07), отдельные точки вне дорог.
Запуск: python3 make_synthetic.py > synthetic.osm
"""
import math

nodes, ways = [], []


def node(lat, lon):
    nodes.append((len(nodes) + 1, lat, lon))
    return len(nodes)


def way(node_ids, **tags):
    ways.append((len(ways) + 1, node_ids, tags))


def line(a, b, steps=10):
    (la, lo), (lb, lob) = a, b
    return [node(la + (lb - la) * i / steps, lo + (lob - lo) * i / steps) for i in range(steps + 1)]


def join(*parts):
    out = []
    for part in parts:
        out.extend(part if not out else part[1:])
    return out


# 1. Грунт против асфальта.
A, B, C = (55.0, 37.0), (55.0, 37.2), (55.15, 37.1)
direct = line(A, B)
detour1 = line(A, C)
detour2 = line(C, B)
detour1[0] = direct[0]
detour2[-1] = direct[-1]
detour2[0] = detour1[-1]
way(direct, highway="unclassified", surface="gravel", name="Гравийка")
way(join(detour1, detour2), highway="secondary", surface="asphalt", name="Объезд")

# Связка между сценариями, чтобы сеть была одной компонентой.
D, E = (55.0, 37.4), (55.0, 37.8)
link1 = line(B, D)
link1[0] = direct[-1]
way(link1, highway="secondary", surface="asphalt")

# 2. Платная автомагистраль.
toll = line(D, E)
toll[0] = link1[-1]
way(toll, highway="motorway", toll="yes", surface="asphalt", oneway="no", name="Платная")
# 5. Бесплатный объезд платной магистрали: длиннее и медленнее.
free1 = line(D, (55.08, 37.6))
free2 = line((55.08, 37.6), E)
free1[0] = toll[0]
free2[0] = free1[-1]
free2[-1] = toll[-1]
way(join(free1, free2), highway="secondary", surface="asphalt", name="Бесплатная")

# 3. Паром через залив.
F, G = (55.0, 38.0), (55.0, 38.2)
link2 = line(E, F)
link2[0] = toll[-1]
way(link2, highway="secondary", surface="asphalt")
ferry = line(F, G, steps=2)
ferry[0] = link2[-1]
way(ferry, route="ferry", motor_vehicle="yes", duration="00:40", name="Паром")

# 4. Прямая магистраль против извилистой дороги той же длины по прямой.
H, K = (55.0, 38.4), (55.0, 38.7)
link3 = line(G, H)
link3[0] = ferry[-1]
way(link3, highway="secondary", surface="asphalt")
straight = line(H, K)
straight[0] = link3[-1]
way(straight, highway="trunk", surface="asphalt", name="Прямая")
curvy = [straight[0]]
for i in range(1, 60):
    t = i / 60
    curvy.append(node(55.0 + 0.012 * math.sin(t * math.pi * 12), 38.4 + 0.3 * t))
curvy.append(straight[-1])
way(curvy, highway="primary", surface="asphalt", name="Серпантин")
end = line(K, (55.0, 38.8))
end[0] = straight[-1]
way(end, highway="secondary", surface="asphalt")

# 6. Точки POI: не часть дорог, выводятся отдельно с тегами.
pois = [
    ((55.001, 37.3), {"amenity": "fuel", "name": "АЗС у Объезда", "brand": "Тест"}),
    ((55.012, 37.35), {"tourism": "hotel", "name": "Гостиница «Синтетика»"}),
    ((55.2, 37.35), {"tourism": "camp_site", "name": "Далёкий кемпинг"}),
]

used = {n for _, ids, _ in ways for n in ids}
print('<?xml version="1.0" encoding="UTF-8"?>')
print('<osm version="0.6" generator="versta-synthetic">')
for nid, lat, lon in nodes:
    if nid in used:
        print(f'  <node id="{nid}" lat="{lat:.7f}" lon="{lon:.7f}" version="1"/>')
for i, ((lat, lon), tags) in enumerate(pois):
    print(f'  <node id="{900000 + i}" lat="{lat:.7f}" lon="{lon:.7f}" version="1">')
    for k, v in tags.items():
        print(f'    <tag k="{k}" v="{v}"/>')
    print("  </node>")
for wid, ids, tags in ways:
    print(f'  <way id="{wid}" version="1">')
    for n in ids:
        print(f'    <nd ref="{n}"/>')
    for k, v in tags.items():
        print(f'    <tag k="{k}" v="{v}"/>')
    print("  </way>")
print("</osm>")
