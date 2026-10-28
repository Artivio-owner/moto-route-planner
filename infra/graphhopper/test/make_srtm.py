"""Тестовые файлы высот SRTM3 для синтетической сети (E-01): без сети и без чужих данных.

Плитки N54–N55, E037–E038 (серпантин заходит южнее 55°): высота 150 м, «холм» до 450 м в середине каждого градуса долготы.
Формат SRTM3: 1201 × 1201 знаковых 16-битных чисел big-endian, строки с севера на юг,
файл <плитка>.hgt в архиве <плитка>.hgt.zip (так его ищет GraphHopper в graph.elevation.cache_dir).
Запуск: python3 make_srtm.py <каталог>
"""
import math
import struct
import sys
import zipfile
from pathlib import Path

SIZE = 1201
out = Path(sys.argv[1] if len(sys.argv) > 1 else "srtm")
out.mkdir(parents=True, exist_ok=True)
for lat, lon in [(lat, lon) for lat in (54, 55) for lon in (37, 38)]:
    name = f"N{lat:02d}E{lon:03d}"
    rows = []
    for _row in range(SIZE):
        cells = [round(150 + 300 * math.sin(math.pi * col / (SIZE - 1))) for col in range(SIZE)]
        rows.append(struct.pack(f">{SIZE}h", *cells))
    with zipfile.ZipFile(out / f"{name}.hgt.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f"{name}.hgt", b"".join(rows))
    print(f"{name}.hgt.zip")
