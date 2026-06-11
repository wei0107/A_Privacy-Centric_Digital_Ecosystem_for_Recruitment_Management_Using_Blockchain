import http from 'k6/http';
import { sleep, check } from 'k6';
import exec from 'k6/execution';
import encoding from 'k6/encoding';
import { sha256 } from 'k6/crypto';
import { p256 } from 'https://esm.sh/@noble/curves@1.4.2/p256';

// =========================
// env
// =========================
const RATE = __ENV.RATE ? Number(__ENV.RATE) : 35;
const DURATION = __ENV.DURATION || '20s';
const PRE_VUS = __ENV.PRE_VUS ? Number(__ENV.PRE_VUS) : 100;
const MAX_VUS = __ENV.MAX_VUS ? Number(__ENV.MAX_VUS) : 1000;
const SLEEP_SECONDS = __ENV.SLEEP ? Number(__ENV.SLEEP) : 1;

const API_BASE = __ENV.API_BASE || 'http://localhost:3000';

// 建議用 env 帶：INTERVIEW_ID=xxxx ./run_company_interview_result.sh
const INTERVIEW_ID = __ENV.INTERVIEW_ID || '69eb9cf021d89deb69ce5f48';

// 這個 seekerAddress 要是你的 interview/invitation 中合理的 seeker address。
// 如果你後端測 on-chain 時已拿掉 DB/auth 驗證，這個 mock 也可用。
const SEEKER_ADDRESS = __ENV.SEEKER_ADDRESS || '0x1111111111111111111111111111111111111111';

// =========================
// init stage: load company users + pem
// =========================
const usersMeta = JSON.parse(open('../../../generated-appkeys/registered_users_type2_50_99.json'));

const users = usersMeta.map((u) => {
  const pemPath = u.appKeyPemPath.startsWith('/')
    ? u.appKeyPemPath
    : `../../../${u.appKeyPemPath}`;

  const pem = open(pemPath);

  return {
    address: u.address.toLowerCase(),
    appKeyPem: pem,
    appKeyDBytes: pkcs8PemToP256Scalar(pem),
  };
});

export const options = {
  scenarios: {
    multi_user: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_VUS,
      maxVUs: MAX_VUS,
      tags: {
        mode: 'company_interview_result',
        rate: String(RATE),
      },
    },
  },
};

// =========================
// helpers
// =========================
function getUser() {
  const vu = exec.vu.idInTest - 1;
  return users[vu % users.length];
}

function fakeStartSignature(message) {
  return {
    flat: '0x' + '11'.repeat(32) + '22'.repeat(32) + '1b',
    message,
  };
}

function b64ToU8(b64) {
  return new Uint8Array(encoding.b64decode(b64, 'std'));
}

function u8ToB64(u8) {
  return encoding.b64encode(u8, 'std');
}

function pemToDerBytes(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');

  return new Uint8Array(encoding.b64decode(b64, 'std'));
}

function readDerLength(bytes, offset) {
  const first = bytes[offset];

  if (first < 0x80) {
    return { length: first, bytesUsed: 1 };
  }

  const numBytes = first & 0x7f;
  let length = 0;

  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | bytes[offset + 1 + i];
  }

  return { length, bytesUsed: 1 + numBytes };
}

function readTlv(bytes, offset) {
  const tag = bytes[offset];
  const { length, bytesUsed } = readDerLength(bytes, offset + 1);
  const headerLen = 1 + bytesUsed;
  const valueStart = offset + headerLen;
  const valueEnd = valueStart + length;

  return {
    tag,
    length,
    headerLen,
    start: offset,
    valueStart,
    valueEnd,
    end: valueEnd,
    value: bytes.slice(valueStart, valueEnd),
  };
}

function pkcs8PemToP256Scalar(pkcs8Pem) {
  const der = pemToDerBytes(pkcs8Pem);

  const outer = readTlv(der, 0);
  if (outer.tag !== 0x30) {
    throw new Error('Invalid PKCS8: expected outer SEQUENCE');
  }

  let off = outer.valueStart;

  const version = readTlv(der, off);
  if (version.tag !== 0x02) {
    throw new Error('Invalid PKCS8: expected version INTEGER');
  }
  off = version.end;

  const algorithm = readTlv(der, off);
  if (algorithm.tag !== 0x30) {
    throw new Error('Invalid PKCS8: expected algorithm SEQUENCE');
  }
  off = algorithm.end;

  const privateKeyOctet = readTlv(der, off);
  if (privateKeyOctet.tag !== 0x04) {
    throw new Error('Invalid PKCS8: expected privateKey OCTET STRING');
  }

  const inner = privateKeyOctet.value;

  const ecSeq = readTlv(inner, 0);
  if (ecSeq.tag !== 0x30) {
    throw new Error('Invalid ECPrivateKey: expected SEQUENCE');
  }

  let innerOff = ecSeq.valueStart;

  const ecVersion = readTlv(inner, innerOff);
  if (ecVersion.tag !== 0x02) {
    throw new Error('Invalid ECPrivateKey: expected version INTEGER');
  }
  innerOff = ecVersion.end;

  const ecPrivateKeyOctet = readTlv(inner, innerOff);
  if (ecPrivateKeyOctet.tag !== 0x04) {
    throw new Error('Invalid ECPrivateKey: expected privateKey OCTET STRING');
  }

  let dBytes = ecPrivateKeyOctet.value;

  if (dBytes.length === 32) return dBytes;
  if (dBytes.length > 32) return dBytes.slice(dBytes.length - 32);

  const out = new Uint8Array(32);
  out.set(dBytes, 32 - dBytes.length);
  return out;
}

function signBytesWithScalarToDerB64(bytesU8, dBytes) {
  const digest = new Uint8Array(sha256(bytesU8, 'binary'));
  const sig = p256.sign(digest, dBytes, { prehash: false });

  if (typeof sig.toDERRawBytes === 'function') {
    return u8ToB64(sig.toDERRawBytes());
  }

  if (typeof sig.toDERHex === 'function') {
    const hex = sig.toDERHex().replace(/^0x/, '');
    const out = new Uint8Array(hex.length / 2);

    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }

    return u8ToB64(out);
  }

  if (typeof sig.toDER === 'function') {
    return u8ToB64(sig.toDER());
  }

  throw new Error('No DER encoder found on noble signature object');
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(',')}]`;
  }

  const keys = Object.keys(obj).sort();

  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

function buildResult(iter) {
  return iter % 2 === 0 ? 'pass' : 'fail';
}

function buildChainPayload(result) {
  return {
    position: 'SWE',
    company: 'TestCo',
    department: 'R&D',
    seekerAddress: SEEKER_ADDRESS.toLowerCase(),
    result,
  };
}

function getMetricValue(metric, stat) {
  if (!metric || !metric.values || metric.values[stat] === undefined) {
    return 0;
  }
  return metric.values[stat];
}

// =========================
// test body
// =========================
export default function () {
  const user = getUser();
  const address = user.address;

  const interviewId = INTERVIEW_ID;
  const result = buildResult(__ITER);
  const comment = `load-test-comment-${__VU}-${__ITER}`;
  const ts = Date.now();
  const chainPayload = buildChainPayload(result);

  const authPayload = {
    address,
    interviewId: String(interviewId),
    result: String(result),
    comment: String(comment),
    ts: Number(ts),
  };

  const message = `UpdateInterviewResult(start) ${stableStringify(authPayload)}`;
  const signature = fakeStartSignature(message);

  // ---------- start ----------
  const startRes = http.patch(
    `${API_BASE}/interview/${interviewId}/start`,
    JSON.stringify({
      address,
      result,
      comment,
      ts,
      signature,
      chainPayload,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { phase: 'start' },
    }
  );

  const startOk = check(startRes, {
    'start status 200': (r) => r.status === 200,
    'start has success': (r) => r.json('success') === true,
    'start has onchain true': (r) => r.json('onchain') === true,
    'start has token': (r) => !!r.json('token'),
    'start has proposalBytesB64': (r) => !!r.json('proposalBytesB64'),
  });

  if (!startOk) {
    console.error(`start failed: address=${address}, status=${startRes.status}, body=${startRes.body}`);
    return;
  }

  const token = startRes.json('token');
  const proposalBytesB64 = startRes.json('proposalBytesB64');

  // ---------- sign proposal ----------
  const proposalBytes = b64ToU8(proposalBytesB64);
  const endorsementSignatureDerB64 = signBytesWithScalarToDerB64(
    proposalBytes,
    user.appKeyDBytes
  );

  // ---------- finish 1 ----------
  const finish1Res = http.patch(
    `${API_BASE}/interview/${interviewId}/finish`,
    JSON.stringify({
      token,
      address,
      endorsementSignatureDerB64,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { phase: 'finish1' },
    }
  );

  const finish1Ok = check(finish1Res, {
    'finish1 status 200': (r) => r.status === 200,
    'finish1 has success': (r) => r.json('success') === true,
    'finish1 has commitBytesB64': (r) => !!r.json('commitBytesB64'),
  });

  if (!finish1Ok) {
    console.error(`finish1 failed: address=${address}, status=${finish1Res.status}, body=${finish1Res.body}`);
    return;
  }

  const commitBytesB64 = finish1Res.json('commitBytesB64');

  // ---------- sign commit ----------
  const commitBytes = b64ToU8(commitBytesB64);
  const commitSignatureDerB64 = signBytesWithScalarToDerB64(
    commitBytes,
    user.appKeyDBytes
  );

  // ---------- finish 2 ----------
  // 前端企業這裡只送 commitSignatureDerB64，沒有再送 endorsementSignatureDerB64
  const finish2Res = http.patch(
    `${API_BASE}/interview/${interviewId}/finish`,
    JSON.stringify({
      token,
      address,
      commitSignatureDerB64,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { phase: 'finish2' },
    }
  );

  const finish2Ok = check(finish2Res, {
    'finish2 status 200': (r) => r.status === 200,
    'finish2 success true': (r) => r.json('success') === true,
  });

  if (!finish2Ok) {
    console.error(`finish2 failed: address=${address}, status=${finish2Res.status}, body=${finish2Res.body}`);
    return;
  }

  sleep(SLEEP_SECONDS);
}

// =========================
// summary
// =========================
export function handleSummary(data) {
  const durationMetric = data.metrics.http_req_duration;
  const failedMetric = data.metrics.http_req_failed;
  const reqsMetric = data.metrics.http_reqs;
  const iterationsMetric = data.metrics.iterations;
  const droppedMetric = data.metrics.dropped_iterations;
  const iterationDurationMetric = data.metrics.iteration_duration;
  const checksMetric = data.metrics.checks;

  const count = getMetricValue(reqsMetric, 'count');
  const failedRate = getMetricValue(failedMetric, 'rate');
  const avg = getMetricValue(durationMetric, 'avg');
  const med = getMetricValue(durationMetric, 'med');
  const p90 = getMetricValue(durationMetric, 'p(90)');
  const p95 = getMetricValue(durationMetric, 'p(95)');
  const max = getMetricValue(durationMetric, 'max');
  const iterCount = getMetricValue(iterationsMetric, 'count');
  const dropped = getMetricValue(droppedMetric, 'count');
  const iterAvg = getMetricValue(iterationDurationMetric, 'avg');
  const iterP95 = getMetricValue(iterationDurationMetric, 'p(95)');
  const checks = getMetricValue(checksMetric, 'passes') + getMetricValue(checksMetric, 'fails');
  const checkFails = getMetricValue(checksMetric, 'fails');

  const durationSeconds = parseFloat(String(DURATION).replace('s', '')) || 0;
  const throughput = durationSeconds > 0 ? Number(count) / durationSeconds : 0;

  const row = {
    mode: 'company_interview_result',
    rate: RATE,
    duration: DURATION,
    requests: Number(count),
    iterations: Number(iterCount),
    throughput_rps: Number(throughput.toFixed(2)),
    failed_rate_percent: Number((Number(failedRate) * 100).toFixed(4)),
    checks_total: Number(checks),
    checks_failed: Number(checkFails),
    dropped_iterations: Number(dropped),
    avg_ms: Number(Number(avg).toFixed(2)),
    med_ms: Number(Number(med).toFixed(2)),
    p90_ms: Number(Number(p90).toFixed(2)),
    p95_ms: Number(Number(p95).toFixed(2)),
    max_ms: Number(Number(max).toFixed(2)),
    iteration_avg_ms: Number(Number(iterAvg).toFixed(2)),
    iteration_p95_ms: Number(Number(iterP95).toFixed(2)),
  };

  const textLines = [
    'Company interview result summary',
    '================================',
    `rate=${row.rate} | throughput=${row.throughput_rps} rps | avg=${row.avg_ms} ms | p95=${row.p95_ms} ms | fail=${row.failed_rate_percent}% | dropped=${row.dropped_iterations}`,
  ];

  const csvHeader = [
    'mode',
    'rate',
    'duration',
    'requests',
    'iterations',
    'throughput_rps',
    'failed_rate_percent',
    'checks_total',
    'checks_failed',
    'dropped_iterations',
    'avg_ms',
    'med_ms',
    'p90_ms',
    'p95_ms',
    'max_ms',
    'iteration_avg_ms',
    'iteration_p95_ms',
  ].join(',');

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
    row.iteration_avg_ms,
    row.iteration_p95_ms,
  ].join(',');

  return {
    stdout: `${textLines.join('\n')}\n`,
    'resultCompanyInterview_run.json': JSON.stringify(row, null, 2),
    'resultCompanyInterview_run.csv': `${csvHeader}\n${csvRow}\n`,
  };
}