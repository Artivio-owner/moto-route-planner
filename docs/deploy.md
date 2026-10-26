# Развёртывание «Версты» на своём сервере

Для владельца (O-01: хостинг и домен выбирает владелец). Задача F-04. Всё запускается одним `docker compose` на одном сервере.

## Что внутри
| Сервис | Что делает | Порт внутри |
|---|---|---|
| `caddy` | HTTPS с автоматическим сертификатом, единственный открытый наружу (80, 443) | 80, 443 |
| `app` | Сайт, админка `/admin/`, API, раздача тайлов `/tiles/` | 8080 |
| `graphhopper` | Маршруты по мото-профилям (S-01) | 8989 |
| `photon` | Поиск адресов (профиль `full`) | 2322 |

Маршруты пользователей нигде не хранятся (ADR-0005), базы данных нет.

## Сервер
- Linux с Docker и Docker Compose.
- Память и диск для России **не измерены** (S-03, G-01): политика сети среды разработки закрывает выгрузки OSM. Ориентир для первого запуска: 16 ГБ памяти и 100 ГБ диска; после первой сборки графа посмотрите реальное потребление (`docker stats`) и уменьшите `GRAPHHOPPER_MEMORY`, если запас большой. Запишите результат в `docs/spikes/s01-graphhopper.md`.
- Домен с A-записью на IP сервера (для HTTPS).

## Первый запуск
```bash
git clone https://github.com/Artivio-owner/moto-route-planner.git
cd moto-route-planner/infra
cp .env.example .env          # впишите DOMAIN и память
./scripts/prepare-data.sh     # выгрузка OSM, индекс Photon, тайлы PMTiles (долго, гигабайты)
docker compose --profile full up -d --build
docker compose logs -f graphhopper   # первая сборка графа: до готовности «Started Server»
```
Откройте `https://ваш-домен/` и проверьте маршрут. Админка: `https://ваш-домен/admin/` (инструкция: `docs/admin.md`).

## Обновление сайта после правок
```bash
cd moto-route-planner && git pull
cd infra && docker compose --profile full up -d --build app
```
Правки из админки попадают в репозиторий; сайт меняется после этой команды. Её можно поставить в cron (например, раз в час) или в GitHub Actions с доступом к серверу: решение владельца.

## Обновление карт и дорог
Данные OSM меняются каждый день. Раз в месяц (предложение):
```bash
./scripts/prepare-data.sh
docker compose stop graphhopper && docker volume rm infra_graph-cache && docker compose --profile full up -d
```

## Что проверено, а что нет
- Проверено в среде разработки: сборка образов `app` и `graphhopper`, запуск `caddy`, `app` и `graphhopper` через `docker compose` на синтетической сети OSM. Сайт, админка и маршрут доступны по HTTPS.
- Не проверено: загрузка данных (`prepare-data.sh`), Photon с индексом России, тайлы Protomaps со стилем `style.json`, потребление памяти. Политика сети среды разработки закрывает download.geofabrik.de, download1.graphhopper.com и build.protomaps.com.

## Сборка за прокси с подменой TLS
Если сервер выходит в интернет через корпоративный прокси, передайте его корневой сертификат при сборке: `docker build --secret id=extra_ca,src=/путь/ca.crt -f infra/app.Dockerfile .`
