'use strict';

const { Contract } = require('fabric-contract-api');

class PersonAccessControlContract extends Contract {
    // 初始化 world state
    async initLedger(ctx) {
        const userIndex = {};
        await ctx.stub.putState('USER_INDEX', Buffer.from(JSON.stringify(userIndex)));
        console.log('🔧 Ledger initialized with USER_INDEX');
    }

    // 註冊用戶：只儲存 id
    async registerUser(ctx, userId) {
        userId = userId.toLowerCase();

        const userIndexBytes = await ctx.stub.getState('USER_INDEX');
        const userIndex = JSON.parse(userIndexBytes.toString() || '{}');

        if (userIndex[userId]) {
            throw new Error(`❌ User ${userId} already exists`);
        }

        userIndex[userId] = {
            id: userId,
            registeredAt: Math.floor(Date.now() / 1000).toString()
        };

        await ctx.stub.putState('USER_INDEX', Buffer.from(JSON.stringify(userIndex)));

        // ACCESS_<userId>
        const defaultAccess = {
            visibleFields: { summary: true, skills: true, experience: true, education: true, project: true }
        };
        await ctx.stub.putState(`ACCESS_${userId}`, Buffer.from(JSON.stringify(defaultAccess)));
    
        // PROFILE_<userId>
        await ctx.stub.putState(`PROFILE_${userId}`, Buffer.from(JSON.stringify({ ciphertext: '' })));

        console.info(`✅ Registered user ${userId} with empty access and profile`);
        return { success: true, userId };
    }

    // 查詢用戶是否存在（可選功能）
    async checkUserExist(ctx, userId) {
        userId = userId.toLowerCase();

        const userIndexBytes = await ctx.stub.getState('USER_INDEX');
        const userIndex = JSON.parse(userIndexBytes.toString() || '{}');

        return userIndex[userId] ? true : false;
    }

    // 設定加密履歷
    async setEncryptedProfile(ctx, userId, ciphertext) {
        userId = userId.toLowerCase();

        const exists = await this.checkUserExist(ctx, userId);
        if (!exists) {
            throw new Error(`❌ User ${userId} not found`);
        }

        const profile = {
            ciphertext
        };

        await ctx.stub.putState(`PROFILE_${userId}`, Buffer.from(JSON.stringify(profile)));
        console.info(`🔐 Encrypted profile set for ${userId}`);
        return { success: true };
    }

    // 取得加密履歷
    async getEncryptedProfile(ctx, userId) {
        userId = userId.toLowerCase();
    
        const exists = await this.checkUserExist(ctx, userId);
        if (!exists) {
            throw new Error(`❌ User ${userId} not found`);
        }
    
        const buffer = await ctx.stub.getState(`PROFILE_${userId}`);
        if (!buffer || !buffer.length) {
            return { error: '🔍 No profile found' };
        }
    
        const encryptedProfile = JSON.parse(buffer.toString());
        return {
            success: true,
            data: encryptedProfile  // 包含 ciphertext 或後續擴充欄位
        };
    }

    async setAccessConfig(ctx, userId, newAccessJson) {
        userId = userId.toLowerCase();
      
        const exists = await this.checkUserExist(ctx, userId);
        if (!exists) {
            throw new Error(`❌ User ${userId} not found`);
        }
      
        let parsedAccess;
        try {
            parsedAccess = JSON.parse(newAccessJson);
        } catch (err) {
            throw new Error('❌ Invalid JSON for access config');
        }
      
        await ctx.stub.putState(`ACCESS_${userId}`, Buffer.from(JSON.stringify(parsedAccess)));
        return { success: true };
    }

    async getAccessConfig(ctx, userId) {
        userId = userId.toLowerCase();
      
        const exists = await this.checkUserExist(ctx, userId);
        if (!exists) {
            throw new Error(`❌ User ${userId} not found`);
        }
      
        const buffer = await ctx.stub.getState(`ACCESS_${userId}`);
        if (!buffer || !buffer.length) {
            return { error: '🔍 No access config found' };
        }
      
        const accessConfig = JSON.parse(buffer.toString());
        return {
            success: true,
            data: accessConfig
        };
    }

    /*****************************************************************
     * 1.  內部共用工具：取得 / 初始化面試結果清單
     *****************************************************************/
    async _getInterviewList(ctx, userId) {
        const buf = await ctx.stub.getState(`INTERVIEW_${userId}`);
        return buf && buf.length ? JSON.parse(buf.toString()) : [];
    }

    /*****************************************************************
     * 2.  新增面試結果
     *    @param  userId          求職者帳號
     *    @param  resultJson      JSON 字串，欄位：position, company,
     *                            department, companyAddress, result
     *****************************************************************/
    async addInterviewResult(ctx, userId, resultJson) {
        userId = userId.toLowerCase();

        // 先確認用戶存在
        /*if (!(await this.checkUserExist(ctx, userId))) {
            throw new Error(`❌ User ${userId} not found`);
        }*/

        // 解析並驗證輸入
        let data;
        try { data = JSON.parse(resultJson); } catch (e) {
            throw new Error('❌ Invalid JSON');
        }
        const required = ['position', 'company', 'department', 'companyAddress', 'result'];
        for (const f of required) {
            if (!data[f]) throw new Error(`❌ Missing field: ${f}`);
        }
        // 可選：限制 result 為 pass / fail / pending
        const validResults = ['pass', 'fail', 'pending'];
        if (!validResults.includes(data.result)) {
            throw new Error(`❌ result 應為 ${validResults.join(', ')}`);
        }

        // 取出清單、push 新紀錄、寫回
        const list = await this._getInterviewList(ctx, userId);
        list.push({
            ...data,
            recordedAt: Math.floor(Date.now() / 1000).toString()  // UNIX 秒
        });
        await ctx.stub.putState(`INTERVIEW_${userId}`, Buffer.from(JSON.stringify(list)));

        console.info(`📝 Added interview result for ${userId}`);
        return { success: true, total: list.length };
    }

    /*****************************************************************
     * 3.  取得該用戶所有面試結果
     *****************************************************************/
    async getInterviewResults(ctx, userId) {
        userId = userId.toLowerCase();

        if (!(await this.checkUserExist(ctx, userId))) {
            throw new Error(`❌ User ${userId} not found`);
        }

        const list = await this._getInterviewList(ctx, userId);
        return { success: true, data: list };  // 若尚無資料，data 為 []
    }
}

exports.contracts = [PersonAccessControlContract];
