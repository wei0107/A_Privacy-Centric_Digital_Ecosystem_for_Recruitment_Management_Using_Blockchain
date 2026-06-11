#!/bin/bash

RATES=(5 10 20 40 80 100)
MODES=("seeker" "job")

OUT_JSON="resultMatch.json"
OUT_CSV="resultMatch.csv"

RUN_JSON="resultMatch_run.json"
RUN_CSV="resultMatch_run.csv"

echo "[]" > "$OUT_JSON"
echo "mode,rate,duration,requests,iterations,throughput_rps,failed_rate_percent,avg_ms,med_ms,p90_ms,p95_ms,max_ms" > "$OUT_CSV"

for MODE in "${MODES[@]}"; do
  for RATE in "${RATES[@]}"; do
    echo "Running MODE=$MODE RATE=$RATE"

    rm -f "$RUN_JSON" "$RUN_CSV"

    k6 run \
      --env MODE="$MODE" \
      --env RATE="$RATE" \
      --env DURATION="20s" \
      --summary-export="$RUN_JSON" \
      testMatch.js > /dev/null

    if [ -f "$RUN_JSON" ]; then
      TMP_JSON=$(mktemp)
      jq --slurp '.[0] + [.[1]]' "$OUT_JSON" "$RUN_JSON" > "$TMP_JSON" && mv "$TMP_JSON" "$OUT_JSON"
    fi

    if [ -f "$RUN_CSV" ]; then
      tail -n +2 "$RUN_CSV" >> "$OUT_CSV"
    fi
  done
done

rm -f "$RUN_JSON" "$RUN_CSV"

echo "Done."
echo "JSON: $OUT_JSON"
echo "CSV : $OUT_CSV"