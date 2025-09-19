import csv
import json


csv_path = "./mcp-remote/src/ts_discography_released.csv"
js_path = "./mcp-remote/src/taylor_songs_data.js"

songs = []
with open(csv_path, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        title = row["song_title"].strip()
        lyrics = row["song_lyrics"].strip()
        if title and lyrics:
            songs.append({"title": title, "lyrics": lyrics})

with open(js_path, "w", encoding="utf-8") as f:
    f.write("// Archivo generado automáticamente. No editar a mano.\n")
    f.write("export const taylorSongs = ")
    json.dump(songs, f, ensure_ascii=False, indent=2)
    f.write(";\n")

print(f"Archivo JS generado con {len(songs)} canciones: {js_path}")
