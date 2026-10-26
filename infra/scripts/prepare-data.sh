#!/usr/bin/env bash
# Готовит данные для сервера: выгрузка OSM, индекс Photon, тайлы PMTiles (v0.1: Россия).
# Запуск: infra/scripts/prepare-data.sh [каталог данных, по умолчанию infra/data]
# Не проверено в среде разработки: источники закрыты её политикой сети.
set -euo pipefail

DATA_DIR="${1:-$(dirname "$0")/../data}"
PMTILES_VERSION="1.28.0"
mkdir -p "$DATA_DIR/osm" "$DATA_DIR/photon" "$DATA_DIR/tiles"

echo "1/3. Выгрузка OSM для России (Geofabrik)"
curl -fL -o "$DATA_DIR/osm/region.osm.pbf" https://download.geofabrik.de/russia-latest.osm.pbf

echo "2/3. Индекс Photon для России (готовая выгрузка GraphHopper)"
curl -fL https://download1.graphhopper.com/public/extracts/by-country-code/ru/photon-db-ru-latest.tar.bz2 \
  | tar -xj -C "$DATA_DIR/photon"

echo "3/3. Тайлы: вырезаем Россию из ежедневной сборки Protomaps"
if ! command -v pmtiles >/dev/null; then
  curl -fL "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
    | tar -xz -C /tmp pmtiles
  PMTILES=/tmp/pmtiles
else
  PMTILES=pmtiles
fi
BUILD_DATE="$(date -u -d 'yesterday' +%Y%m%d)"
"$PMTILES" extract "https://build.protomaps.com/${BUILD_DATE}.pmtiles" "$DATA_DIR/tiles/region.pmtiles" \
  --bbox=19.6,41.1,180,82 --maxzoom=14

echo "Готово. Размеры:"
du -sh "$DATA_DIR"/*
