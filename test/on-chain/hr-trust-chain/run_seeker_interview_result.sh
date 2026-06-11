#!/bin/bash

RATES=(5 10 20 35)

OUT_JSON="resultSeekerInterview.json"
OUT_CSV="resultSeekerInterview.csv"

RUN_JSON="resultSeekerInterview_run.json"
RUN_CSV="resultSeekerInterview_run.csv"

echo "[]" > "$OUT_JSON"
echo "mode,rate,duration,requests,iterations,throughput_rps,failed_rate_percent,checks_total,checks_failed,dropped_iterations,avg_ms,med_ms,p90_ms,p95_ms,max_ms,iteration_avg_ms,iteration_p95_ms" > "$OUT_CSV"

for RATE in "${RATES[@]}"; do
  echo "Running seeker_interview RATE=$RATE"

  rm -f "$RUN_JSON" "$RUN_CSV"

  k6 run \
    --env RATE="$RATE" \
    --env DURATION="20s" \
    --env PRE_VUS="100" \
    --env MAX_VUS="1000" \
    --summary-export="$RUN_JSON" \
    testSeekerInterviewResult.js > /dev/null

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