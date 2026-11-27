#!/bin/sh
# Builds dist/ha-m3-cards.js: the weather bundle (ES module) followed by the
# energy card. The energy card is plain script with top-level consts, so it
# goes in a block to keep its names out of the bundle's module scope.
set -e
cd "$(dirname "$0")/.."
(cd ha-m3-slim-weekly-weather && npm ci --silent && npm run -s build)
mkdir -p dist
{
  grep -v '^//# sourceMappingURL=' ha-m3-slim-weekly-weather/dist/m3-cards.js
  printf '\n{\n'
  cat ha-m3-slim-energy-card/m3-slim-energy-card.js
  printf '\n}\n'
} > dist/ha-m3-cards.js
echo "dist/ha-m3-cards.js: $(wc -c < dist/ha-m3-cards.js) bytes"
