import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'http://127.0.0.1:8082';
const TOP_K = 30;

const TEST_SEEKER = '0xFAKEADDR_SEEKER_0894778';
const TEST_JOB = '00000000000000000035e6f0';

const RATE = __ENV.RATE ? Number(__ENV.RATE) : 5;
const MODE = __ENV.MODE || 'seeker'; // seeker | job
const DURATION = __ENV.DURATION || '20s';

export const options = {
  scenarios: {
    match_test: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 100,
      maxVUs: 1000,
      exec: MODE,
      tags: {
        mode: MODE,
        rate: String(RATE),
      },
    },
  },
};

export function seeker() {
  const url = `${BASE_URL}/match/jobs-for-seeker/${TEST_SEEKER}?top_k=${TOP_K}`;
  const res = http.get(url, {
    tags: {
      endpoint: 'jobs-for-seeker',
    },
  });

  check(res, {
    'status 200': (r) => r.status === 200,
  });
}

export function job() {
  const url = `${BASE_URL}/match/seekers-for-job/${TEST_JOB}?top_k=${TOP_K}`;
  const res = http.get(url, {
    tags: {
      endpoint: 'seekers-for-job',
    },
  });

  check(res, {
    'status 200': (r) => r.status === 200,
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

  const count = getMetricValue(reqsMetric, 'count');
  const failedRate = getMetricValue(failedMetric, 'rate');
  const avg = getMetricValue(durationMetric, 'avg');
  const med = getMetricValue(durationMetric, 'med');
  const p90 = getMetricValue(durationMetric, 'p(90)');
  const p95 = getMetricValue(durationMetric, 'p(95)');
  const max = getMetricValue(durationMetric, 'max');
  const iterCount = getMetricValue(iterationsMetric, 'count');

  const durationSeconds = parseFloat(String(DURATION).replace('s', '')) || 0;
  const throughput = durationSeconds > 0 ? Number(count) / durationSeconds : 0;

  const row = {
    mode: MODE,
    rate: RATE,
    duration: DURATION,
    requests: Number(count),
    iterations: Number(iterCount),
    throughput_rps: Number(throughput.toFixed(2)),
    failed_rate_percent: Number((Number(failedRate) * 100).toFixed(4)),
    avg_ms: Number(Number(avg).toFixed(2)),
    med_ms: Number(Number(med).toFixed(2)),
    p90_ms: Number(Number(p90).toFixed(2)),
    p95_ms: Number(Number(p95).toFixed(2)),
    max_ms: Number(Number(max).toFixed(2)),
  };

  const textLines = [
    'Match summary',
    '=============',
    `mode=${row.mode} | rate=${row.rate} | throughput=${row.throughput_rps} rps | avg=${row.avg_ms} ms | p95=${row.p95_ms} ms | fail=${row.failed_rate_percent}%`,
  ];

  const csvHeader = 'mode,rate,duration,requests,iterations,throughput_rps,failed_rate_percent,avg_ms,med_ms,p90_ms,p95_ms,max_ms';
  const csvRow = [
    row.mode,
    row.rate,
    row.duration,
    row.requests,
    row.iterations,
    row.throughput_rps,
    row.failed_rate_percent,
    row.avg_ms,
    row.med_ms,
    row.p90_ms,
    row.p95_ms,
    row.max_ms,
  ].join(',');

  return {
    stdout: `${textLines.join('\n')}\n`,
    'resultMatch_run.json': JSON.stringify(row, null, 2),
    'resultMatch_run.csv': `${csvHeader}\n${csvRow}\n`,
  };
}