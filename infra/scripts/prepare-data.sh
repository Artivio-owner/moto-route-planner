#!/usr/bin/env bash
# Готовит данные для сервера: выгрузка OSM, индекс Photon, тайлы PMTiles.
# Запуск: [REGIONS="ru kz ge tr"] infra/scripts/prepare-data.sh [каталог данных, по умолчанию infra/data]
# REGIONS: v0.1 — только ru (по умолчанию); v0.2 — ru kz ge tr (ADR-0006, ADR-0012).
# Для небольшой проверки на своём компьютере можно взять одну область, например
# REGIONS="ru/central-fed-district" (любой путь Geofabrik без суффикса -latest.osm.pbf)
# и BBOX="30,50,45,60" (рамка тайлов: запад,юг,восток,север), иначе тайлы режутся по всей России.
# Не проверено в среде разработки: источники закрыты её политикой сети.
set -euo pipefail

DATA_DIR="${1:-$(dirname "$0")/../data}"
REGIONS="${REGIONS:-ru}"
PMTILES_VERSION="1.28.0"
mkdir -p "$DATA_DIR/osm" "$DATA_DIR/photon" "$DATA_DIR/tiles"

# Код страны → путь Geofabrik и рамка для тайлов (запад, юг, восток, север).
geofabrik_path() {
  case "$1" in
    ru) echo "russia" ;;
    kz) echo "asia/kazakhstan" ;;
    ge) echo "europe/georgia" ;;
    tr) echo "europe/turkey" ;;
    ru/*) echo "russia/${1#ru/}" ;;
    *) echo "$1" ;;
  esac
}
bbox() {
  case "$1" in
    ru) echo "19.6 41.1 180 82" ;;
    kz) echo "46.4 40.5 87.4 55.5" ;;
    ge) echo "40 41 46.8 43.6" ;;
    tr) echo "25.6 35.8 44.9 42.2" ;;
    *) echo "" ;;
  esac
}

echo "1/3. Выгрузки OSM (Geofabrik): $REGIONS"
files=()
for region in $REGIONS; do
  path="$(geofabrik_path "$region")"
  file="$DATA_DIR/osm/$(echo "$region" | tr '/' '_').osm.pbf"
  curl -fL -o "$file" "https://download.geofabrik.de/${path}-latest.osm.pbf"
  files+=("$file")
done
if [ "${#files[@]}" -eq 1 ]; then
  mv "${files[0]}" "$DATA_DIR/osm/region.osm.pbf"
else
  # Склейка выгрузок для GraphHopper: osmium-tool (GPL-3.0, используется как утилита, в код не входит).
  command -v osmium >/dev/null || { echo "Нужен osmium-tool: apt install osmium-tool"; exit 1; }
  osmium merge "${files[@]}" -o "$DATA_DIR/osm/region.osm.pbf" --overwrite
  rm -f "${files[@]}"
fi

echo "2/3. Индекс Photon (готовые выгрузки GraphHopper по странам)"
first_region="${REGIONS%% *}"
country="${first_region%%/*}"
curl -fL "https://download1.graphhopper.com/public/extracts/by-country-code/${country}/photon-db-${country}-latest.tar.bz2" \
  | tar -xj -C "$DATA_DIR/photon"
if [ "$(echo "$REGIONS" | wc -w)" -gt 1 ]; then
  # Индекс Photon одной страны нельзя дополнить другой: для нескольких стран нужен общий индекс
  # (своя сборка из склеенной выгрузки или выгрузка всей планеты). Открытый вопрос G-02.
  echo "Внимание: поиск адресов пока только для «${country}». Остальные страны: см. docs/deploy.md, раздел «Страны v0.2»."
fi

echo "3/3. Тайлы: вырезаем регионы из ежедневной сборки Protomaps"
if ! command -v pmtiles >/dev/null; then
  curl -fL "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
    | tar -xz -C /tmp pmtiles
  PMTILES=/tmp/pmtiles
else
  PMTILES=pmtiles
fi
# Общая рамка всех регионов; для области без известной рамки берётся рамка России.
read -r W S E N <<<"180 90 -180 -90"
for region in $REGIONS; do
  b="$(bbox "$region")"
  [ -n "$b" ] || b="$(bbox ru)"
  read -r w s e n <<<"$b"
  W=$(awk -v a="$W" -v b="$w" 'BEGIN{print (b<a)?b:a}')
  S=$(awk -v a="$S" -v b="$s" 'BEGIN{print (b<a)?b:a}')
  E=$(awk -v a="$E" -v b="$e" 'BEGIN{print (b>a)?b:a}')
  N=$(awk -v a="$N" -v b="$n" 'BEGIN{print (b>a)?b:a}')
done
if [ -n "${BBOX:-}" ]; then IFS=, read -r W S E N <<<"$BBOX"; fi
BUILD_DATE="$(date -u -d 'yesterday' +%Y%m%d)"
"$PMTILES" extract "https://build.protomaps.com/${BUILD_DATE}.pmtiles" "$DATA_DIR/tiles/region.pmtiles" \
  --bbox="$W,$S,$E,$N" --maxzoom=14

echo "Готово. Размеры:"
du -sh "$DATA_DIR"/*
