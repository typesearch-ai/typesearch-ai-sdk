#!/usr/bin/env bash
# Instala las dependencias en el CI. Mientras package.json pide typesearch-js por ruta
# (file:../typesearch-js, como en el repo de trabajo, hasta que el SDK esté en npm):
#   - si typesearch-js ya está en npm (el nuestro), el job pasa a esa versión (^0.1.0, lo que pide el
#     paquete publicado) y hace `npm install`;
#   - si no, clona al lado el repo público hermano (typesearch-ai/typesearch-js), lo construye y `npm ci`.
# Con package.json pidiendo la versión de npm, o con la carpeta ya en su lugar (el repo de trabajo), es
# `npm ci` a secas. Con --sdk-only resuelve typesearch-js sin instalar lo demás (para el build de Docker).
# Este archivo es el mismo en cada repo que usa typesearch-js.
set -euo pipefail

sdk_range='^0.1.0'
sdk_repo='https://github.com/typesearch-ai/typesearch-js'
sdk_only=false
[ "${1:-}" = --sdk-only ] && sdk_only=true

spec=$(node -p "const p = require('./package.json'); ({ ...p.devDependencies, ...p.dependencies })['typesearch-js'] ?? ''")

if [[ "$spec" == file:* ]]; then
  dir=$(node -p 'require("node:path").resolve(process.argv[1])' "${spec#file:}")
  if [ -f "$dir/package.json" ]; then
    echo "typesearch-js: $dir"
  else
    published=$(npm view "typesearch-js@$sdk_range" repository.url 2>/dev/null || true)
    if [[ "$published" == *github.com/typesearch-ai/typesearch-js* ]]; then
      echo "typesearch-js: $sdk_range from npm"
      field=$(node -p "require('./package.json').dependencies?.['typesearch-js'] ? 'dependencies' : 'devDependencies'")
      npm pkg set "$field.typesearch-js=$sdk_range"
      if $sdk_only; then
        npm install --package-lock-only --ignore-scripts --no-audit --no-fund
      else
        npm install --no-audit --no-fund
      fi
      exit 0
    fi
    echo "typesearch-js: not on npm yet, building $sdk_repo in $dir"
    git clone --quiet --depth 1 "$sdk_repo.git" "$dir"
    (cd "$dir" && npm ci --no-audit --no-fund && npm run build)
  fi
fi

$sdk_only || npm ci --no-audit --no-fund
