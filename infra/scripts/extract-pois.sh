#!/usr/bin/env bash
# АЗС и жильё из выгрузки OSM для слоя POI (v0.3, P-01, P-02, ADR-0017).
# Запуск: infra/scripts/extract-pois.sh <выгрузка .osm.pbf или .osm> <файл .geojsonseq>
# Нужен osmium-tool (GPL-3.0, внешняя утилита, в код сервиса не входит): apt install osmium-tool
set -euo pipefail

INPUT="$1"
OUTPUT="$2"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

osmium tags-filter "$INPUT" \
  nwr/amenity=fuel \
  nwr/tourism=hotel,motel,guest_house,hostel,camp_site,chalet \
  -o "$TMP/pois.osm.pbf" --overwrite
# Здания и территории экспортируются полигонами: API берёт их центр.
osmium export "$TMP/pois.osm.pbf" -f geojsonseq -o "$OUTPUT" --overwrite \
  --geometry-types=point,polygon
echo "Точек: $(wc -l < "$OUTPUT")"
