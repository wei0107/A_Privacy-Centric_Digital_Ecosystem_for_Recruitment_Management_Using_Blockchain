'use strict';

const { Contract } = require('fabric-contract-api');

// ---------- 共用字串常數 ----------------------------------------------------
const PREFIX = {
  ENTERPRISE_IDX : 'ENTERPRISE_INDEX',
  INTERVIEW      : 'INTERVIEW_'          // INTERVIEW_<enterpriseId>
};
const RESULT_ENUM = ['pass', 'fail', 'pending'];

class EnterpriseAccessControlContract extends Contract {

  // -------------------- 初始化 ------------------------------------------------
  async initLedger(ctx) {
    const enterpriseIndex = {};
    await ctx.stub.putState(PREFIX.ENTERPRISE_IDX,
      Buffer.from(JSON.stringify(enterpriseIndex)));
    console.log('🔧 Ledger initialized with ENTERPRISE_INDEX');
  }

  // -------------------- 企業註冊／查詢 ----------------------------------------
  async registerEnterprise(ctx, enterpriseId) {
    enterpriseId = enterpriseId.toLowerCase();

    const idxBytes = await ctx.stub.getState(PREFIX.ENTERPRISE_IDX);
    const idx      = JSON.parse(idxBytes.toString() || '{}');

    if (idx[enterpriseId]) {
      throw new Error(`❌ Enterprise ${enterpriseId} already exists`);
    }

    idx[enterpriseId] = {
      id           : enterpriseId,
      registeredAt : Math.floor(Date.now() / 1000).toString()
    };
    await ctx.stub.putState(PREFIX.ENTERPRISE_IDX,
      Buffer.from(JSON.stringify(idx)));
    console.log(`✅ Registered enterprise ${enterpriseId}`);
  }

  async checkEnterpriseExist(ctx, enterpriseId) {
    enterpriseId = enterpriseId.toLowerCase();

    const idxBytes = await ctx.stub.getState(PREFIX.ENTERPRISE_IDX);
    const idx      = JSON.parse(idxBytes.toString() || '{}');

    return !!idx[enterpriseId];
  }

  // ========================================================================
  // 面試結果區  (ENTERPRISE 端) – 與 Person 端相同邏輯，但欄位換成 seekerAddress
  // ========================================================================

  // 取清單（若無則回傳 []）
  async _getInterviewList(ctx, enterpriseId) {
    enterpriseId = enterpriseId.toLowerCase();
    const buf = await ctx.stub.getState(PREFIX.INTERVIEW + enterpriseId);
    return buf && buf.length ? JSON.parse(buf.toString()) : [];
  }

  /**
   * 新增面試結果
   * @param enterpriseId   企業帳號
   * @param resultJson     JSON 字串：
   *   {
   *     position:        "Backend Engineer",
   *     company:         "ACME Corp",          // 保留，可放企業正式名稱
   *     department:      "R&D",
   *     seekerAddress:   "0x1234...abcd",      // 求職者位址
   *     result:          "pass" | "fail" | "pending"
   *   }
   */
  async addInterviewResult(ctx, enterpriseId, resultJson) {
    enterpriseId = enterpriseId.toLowerCase();

    if (!(await this.checkEnterpriseExist(ctx, enterpriseId)))
      throw new Error(`❌ Enterprise ${enterpriseId} not found`);

    let data;
    try { data = JSON.parse(resultJson); } catch { throw new Error('❌ Invalid JSON'); }

    const required = ['position','company','department','seekerAddress','result'];
    for (const f of required)
      if (!data[f]) throw new Error(`❌ Missing field: ${f}`);

    if (!RESULT_ENUM.includes(data.result))
      throw new Error(`❌ result 必須為 ${RESULT_ENUM.join(', ')}`);

    const list = await this._getInterviewList(ctx, enterpriseId);
    list.push({ ...data, recordedAt: Date.now() });

    await ctx.stub.putState(PREFIX.INTERVIEW + enterpriseId,
      Buffer.from(JSON.stringify(list)));

    console.info(`📝 Added interview result for ${enterpriseId}`);
    return { success: true, total: list.length };
  }

  /**
   * 取得該企業所有面試結果
   */
  async getInterviewResults(ctx, enterpriseId) {
    enterpriseId = enterpriseId.toLowerCase();

    if (!(await this.checkEnterpriseExist(ctx, enterpriseId)))
      throw new Error(`❌ Enterprise ${enterpriseId} not found`);

    const list = await this._getInterviewList(ctx, enterpriseId);
    return { success: true, data: list };
  }
}

exports.contracts = [EnterpriseAccessControlContract];