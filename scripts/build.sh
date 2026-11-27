#!/bin/sh
# Builds dist/ha-m3-cards.js: the weather bundle (ES module) followed by the
# energy, trash, battery, open-windows, temperature and lights cards. Those are plain scripts with top-level consts, so
# each goes in a block to keep its names out of the module scope.
set -e
cd "$(dirname "$0")/.."
(cd ha-m3-slim-weekly-weather && npm ci --silent && npm run -s build)
mkdir -p dist
{
  grep -v '^//# sourceMappingURL=' ha-m3-slim-weekly-weather/dist/m3-cards.js
  printf '\n{\n'
  cat ha-m3-slim-energy-card/m3-slim-energy-card.js
  printf '\n}\n{\n'
  cat ha-m3-slim-trash-card/m3-slim-trash-card.js
  printf '\n}\n{\n'
  cat ha-m3-slim-battery-card/m3-slim-battery-card.js
  printf '\n}\n{\n'
  cat ha-m3-slim-open-windows/m3-slim-open-windows-card.js
  printf '\n}\n{\n'
  cat ha-m3-slim-temperature-card/m3-slim-temperature-card.js
  printf '\n}\n{\n'
  cat ha-m3-slim-lights-card/m3-slim-lights-card.js
  printf '\n}\n'
} > dist/ha-m3-cards.js
echo "dist/ha-m3-cards.js: $(wc -c < dist/ha-m3-cards.js) bytes"
