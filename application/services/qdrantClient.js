// qdrantClient.js
const axios = require('axios');

const QDRANT_BASE = process.env.QDRANT_BASE || 'http://127.0.0.1:8081';

function normalizeSkills(skills) {
  if (!Array.isArray(skills)) return [];
  return [...new Set(
    skills.map(s => String(s).trim()).filter(Boolean)
  )];
}

function fireAndForget(promise, tag) {
  Promise.resolve(promise).catch((err) => {
    console.error(
      `[QDRANT ${tag} FAILED]`,
      err?.response?.data || err?.message || err
    );
  });
}

function upsertSeekerAsync(request) {
  if (!request?.address) return;

  const address = String(request.address).toLowerCase();

  const payload = {
    address,
    position: String(request.position || ''),
    skills: normalizeSkills(request.skills),
    location: String(request.location || ''),
    expectedSalary:
      request.expectedSalary === undefined || request.expectedSalary === null
        ? null
        : Number(request.expectedSalary),
    notes: request.notes ? String(request.notes) : null,
  };

  fireAndForget(
    axios.post(`${QDRANT_BASE}/seekers`, payload),
    `UPSERT ${address}`
  );
}

function deleteSeekerAsync(address) {
  if (!address) return;

  const addr = String(address).toLowerCase();

  fireAndForget(
    axios.delete(`${QDRANT_BASE}/seekers/${addr}`),
    `DELETE ${addr}`
  );
}

function normalizeRequirements(reqs) {
  if (!Array.isArray(reqs)) return [];
  return [...new Set(reqs.map(s => String(s).trim()).filter(Boolean))];
}

function upsertJobAsync(job) {
  if (!job?._id || !job?.address) return;

  const payload = {
    address: String(job.address).toLowerCase(),
    companyId: String(job.companyId || ''),
    jobId: String(job._id), // ⭐ 用 Mongo _id 當 jobId，對應 FastAPI 的 jobId hash
    position: String(job.position || ''),
    department: job.department ? String(job.department) : null,
    requirements: normalizeRequirements(job.requirements),
    location: String(job.location || ''),
    salaryMin:
      job.salaryRange?.min === undefined || job.salaryRange?.min === null
        ? null
        : Number(job.salaryRange.min),
    salaryMax:
      job.salaryRange?.max === undefined || job.salaryRange?.max === null
        ? null
        : Number(job.salaryRange.max),
    notes: job.notes ? String(job.notes) : null,
  };

  fireAndForget(
    axios.post(`${QDRANT_BASE}/jobs`, payload),
    `UPSERT JOB ${payload.jobId}`
  );
}

function deleteJobAsync(jobId) {
  if (!jobId) return;
  const id = String(jobId);
  fireAndForget(
    axios.delete(`${QDRANT_BASE}/jobs/${id}`),
    `DELETE JOB ${id}`
  );
}

// 記得 export
module.exports = {
  upsertSeekerAsync,
  deleteSeekerAsync,
  upsertJobAsync,
  deleteJobAsync,
};