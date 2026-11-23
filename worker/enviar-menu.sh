#!/bin/bash
# Manda el menú de la semana a tu nube. Uso: worker/enviar-menu.sh menu.json
# La contraseña se lee de ~/.config/mi-entrenador/menu-token (nunca se sube a GitHub).
set -e
W="https://mi-entrenador.santinochicuate.workers.dev"
T=$(cat ~/.config/mi-entrenador/menu-token)
curl -sS -X POST "$W/menu" -H "Authorization: Bearer $T" -H "Content-Type: application/json" --data-binary @"${1:?Falta el archivo del menú}"
echo
