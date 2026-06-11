'use strict';

const { Contract } = require('fabric-contract-api');

// ---------- Key Prefix -------------------------------------------------
const PREFIX = {
  ARBITRATION: 'ARBITRATION_'   // ARBITRATION_<id>
};

class GovernmentManagementContract extends Contract {

  // ============================================================
  // Internal: get arbitration list
  // ============================================================
  async _getList(ctx) {
    const buf = await ctx.stub.getState(PREFIX.ARBITRATION + 'LIST');
    return buf && buf.length ? JSON.parse(buf.toString()) : [];
  }

  async _putList(ctx, list) {
    await ctx.stub.putState(
      PREFIX.ARBITRATION + 'LIST',
      Buffer.from(JSON.stringify(list))
    );
  }

  // ============================================================
  // 政府最終裁決上鏈
  // ============================================================
  /**
   * recordArbitrationResult
   *
   * @param arbitrationJson
   *
   * {
   *   arbitrationId,
   *   interviewId,
   *   companyAddress,
   *   seekerAddress,
   *   result,
   *   reason
   * }
   */
  async recordArbitrationResult(ctx, arbitrationJson) {

    let data;
    try {
      data = JSON.parse(arbitrationJson);
    } catch (e) {
      throw new Error('❌ Invalid JSON');
    }

    const required = [
      'arbitrationId',
      'interviewId',
      'companyAddress',
      'seekerAddress',
      'result'
    ];

    for (const f of required) {
      if (!data[f]) {
        throw new Error(`❌ Missing field: ${f}`);
      }
    }

    const arbitration = {
      arbitrationId: data.arbitrationId,
      interviewId: data.interviewId,
      companyAddress: data.companyAddress.toLowerCase(),
      seekerAddress: data.seekerAddress.toLowerCase(),
      result: data.result,
      reason: data.reason || '',
      resolvedAt: Date.now()
    };

    const list = await this._getList(ctx);
    list.push(arbitration);

    await this._putList(ctx, list);

    console.info(`✅ Arbitration recorded: ${data.arbitrationId}`);

    return {
      success: true,
      total: list.length
    };
  }

  // ============================================================
  // 查詢全部仲裁結果
  // ============================================================
  async getAllArbitrations(ctx) {
    const list = await this._getList(ctx);

    return {
      success: true,
      data: list
    };
  }
}

exports.contracts = [GovernmentManagementContract];