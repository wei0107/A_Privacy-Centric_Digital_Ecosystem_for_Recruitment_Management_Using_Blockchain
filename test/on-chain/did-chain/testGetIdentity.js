import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const RATE = __ENV.RATE ? Number(__ENV.RATE) : 5;
const DURATION = __ENV.DURATION || '20s';

const payloads = JSON.parse(open('./getIdentityPayloads.json'));

export const options = {
  scenarios: {
    get_identity_test: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 100,
      maxVUs: 1000,
      exec: 'getIdentity',
      tags: {
        mode: 'get_identity_contract',
        rate: String(RATE),
      },
    },
  },
};

export function getIdentity() {
  const payload = payloads[__ITER % payloads.length];

  const res = http.get(
    `${BASE_URL}/test/did/identity/${payload.address}`,
    {
      tags: {
        endpoint: 'get-identity-contract-address',
      },
    }
  );

  check(res, {
    'status 200': (r) => r.status === 200,
    'success true': (r) => {
      try {
        return r.json('success') === true;
      } catch (_) {
        return false;
      }
    },
    'has identityContractAddress': (r) => {
      try {
        return Boolean(r.json('identityContractAddress'));
      } catch (_) {
        return false;
      }
    },
  });
}

function getMetricValue(metric, stat) {
  if (!metric || !metric.values || metric.values[stat] === undefined) {
    return 0;
  }
  return metric.values[stat];
}

export function handleSummary(data) {
  const durationMetric = data.metrics.http_req_duration;
  const failedMetric = data.metrics.http_req_failed;
  const reqsMetric = data.metrics.http_reqs;
  const iterationsMetric = data.metrics.iterations;
  const checksMetric = data.metrics.checks;
  const droppedMetric = data.metrics.dropped_iterations;

  const count = getMetricValue(reqsMetric, 'count');
  const failedRate = getMetricValue(failedMetric, 'rate');
  const avg = getMetricValue(durationMetric, 'avg');
  const med = getMetricValue(durationMetric, 'med');
  const p90 = getMetricValue(durationMetric, 'p(90)');
  const p95 = getMetricValue(durationMetric, 'p(95)');
  const max = getMetricValue(durationMetric, 'max');
  const iterCount = getMetricValue(iterationsMetric, 'count');
  const checksTotal = getMetricValue(checksMetric, 'count');
  const checksFailed = getMetricValue(checksMetric, 'fails');
  const dropped = getMetricValue(droppedMetric, 'count');

  const durationSeconds = parseFloat(String(DURATION).replace('s', '')) || 0;
  const throughput = durationSeconds > 0 ? Number(count) / durationSeconds : 0;

  const row = {
    mode: 'get_identity_contract',
    rate: RATE,
    duration: DURATION,
    requests: Number(count),
    iterations: Number(iterCount),
    throughput_rps: Number(throughput.toFixed(2)),
    failed_rate_percent: Number((Number(failedRate) * 100).toFixed(4)),
    checks_total: Number(checksTotal),
    checks_failed: Number(checksFailed),
    dropped_iterations: Number(dropped),
    avg_ms: Number(Number(avg).toFixed(2)),
    med_ms: Number(Number(med).toFixed(2)),
    p90_ms: Number(Number(p90).toFixed(2)),
    p95_ms: Number(Number(p95).toFixed(2)),
    max_ms: Number(Number(max).toFixed(2)),
  };

  const csvHeader =
    'mode,rate,duration,requests,iterations,throughput_rps,failed_rate_percent,checks_total,checks_failed,dropped_iterations,avg_ms,med_ms,p90_ms,p95_ms,max_ms';

  const csvRow = [
    row.mode,
    row.rate,
    row.duration,
    row.requests,
    row.iterations,
    row.throughput_rps,
    row.failed_rate_percent,
    row.checks_total,
    row.checks_failed,
    row.dropped_iterations,
    row.avg_ms,
    row.med_ms,
    row.p90_ms,
    row.p95_ms,
    row.max_ms,
  ].join(',');

  return {
    stdout: `get_identity_contract | rate=${row.rate} | throughput=${row.throughput_rps} rps | avg=${row.avg_ms} ms | p95=${row.p95_ms} ms | fail=${row.failed_rate_percent}%\n`,
    'resultGetIdentity_run.json': JSON.stringify(row, null, 2),
    'resultGetIdentity_run.csv': `${csvHeader}\n${csvRow}\n`,
  };
}