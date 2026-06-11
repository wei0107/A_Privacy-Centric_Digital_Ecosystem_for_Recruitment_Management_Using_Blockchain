#!/bin/bash

RATES=(5 10 20 40 80 100)

OUT_JSON="resultAddEncryptedCSR.json"
OUT_CSV="resultAddEncryptedCSR.csv"

RUN_JSON="resultAddEncryptedCSR_run.json"
RUN_CSV="resultAddEncryptedCSR_run.csv"

echo "[]" > "$OUT_JSON"
echo "mode,rate,duration,requests,iterations,throughput_rps,failed_rate_percent,checks_total,checks_failed,dropped_iterations,avg_ms,med_ms,p90_ms,p95_ms,max_ms" > "$OUT_CSV"

for RATE in "${RATES[@]}"; do
  echo "Running add_encrypted_csr RATE=$RATE"

  rm -f "$RUN_JSON" "$RUN_CSV"

  k6 run \
    --env RATE="$RATE" \
    --env DURATION="20s" \
    --summary-export="$RUN_JSON" \
    testAddEncryptedCsr.js > /dev/null

  if [ -f "$RUN_JSON" ]; then
    TMP_JSON=$(mktemp)
    jq --slurp '.[0] + [.[1]]' "$OUT_JSON" "$RUN_JSON" > "$TMP_JSON" && mv "$TMP_JSON" "$OUT_JSON"
  fi

  if [ -f "$RUN_CSV" ]; then
    tail -n +2 "$RUN_CSV" >> "$OUT_CSV"
  fi
done

rm -f "$RUN_JSON" "$RUN_CSV"

echo "Done."
echo "JSON: $OUT_JSON"
echo "CSV : $OUT_CSV"