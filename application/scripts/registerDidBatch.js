const ethService = require("../services/ethService");
const accounts = require("./testAccounts"); // 你給的那個檔案 :contentReference[oaicite:0]{index=0}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("🚀 Start batch DID registration...");

  const MAX = 100;
  const users = accounts.slice(0, MAX);

  for (let i = 0; i < users.length; i++) {
    const { address } = users[i];

    const id = `batch-user-${i}`;
    const type = 1; // 1 = seeker（依你的 contract）

    try {
      console.log(`\n[${i}] Registering ${address}`);

      const result = await ethService.createUser(id, address, type);

      console.log(`✅ Success ${address}`);
      console.log(result);

      // 🔥 很重要：避免 nonce / pending tx 爆掉
      await sleep(500); // 0.5 秒間隔（可調）
    } catch (err) {
      console.error(`❌ Failed ${address}`);
      console.error(err.message);
    }
  }

  console.log("\n🎉 Batch registration finished");
}

main().catch(console.error);