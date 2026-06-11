const fs = require("fs");
const path = require("path");

const IdentityManager = artifacts.require("IdentityManager");
const Identity = artifacts.require("Identity");

contract("DID Gas Analysis", (accounts) => {
  const org = accounts[0];
  const user = accounts[1];

  const encryptedCSR = JSON.stringify({
    version: "x25519-xsalsa20-poly1305",
    ephemPublicKey: "LbYYLoQtcJeqKv8DCnlFzzVTgGwfqxarx6ZxxVOvw2w=",
    nonce: "N+B8Xky/pSd7APHQz4aBTnVzsqwMg0O3",
    ciphertext:
      "CeRR5M0ZDG8hP3Lp7D4MF9j616O2AhAIc0WMmIRcshLpFJxxwzNqbWpxomtv79gbZ8yBUFRZMLO42g2lPBYnUZawdNGWtPnQIiQwl7LR859mS4qwl/EVs2VbouW0F9/QwgGlbi0Gap1Z7MlH0btpdyPE2Y+ji4R/NCMvfnxf0ZPODEf1I1oFST67rvLXiV0T7k3prfter+4vIPDNTgwACmL4iTi6hlDxXNk6Xy0g2ljTpKDJyfnMxWWc4hl/4tT5IfX4sSHDbJYFi2mjtNCQiKZHAFs+g9ItGPH3IzMgSXkblpyfv63qOZTUMfh8cwLviKEU6JjDbPNLwo6vU4JJo5KzMcmXBKlGBxUysCU1Bsrc6XKHlOk4oTHAQkUOnisBa3wyOJqvDRDcGj1J0jtd9greKYtY2djB7wXPOngM9SoV2B4UhDCrdGmcZRPq7JAY/P7zI4gFDWXMO/n9L005K9UCfWPxD3xIHjCAiKEP3V6RqP+40xmSMFno91m41bBGoLDuV5/JTt/7D+hesyqzaBAi/w==",
  });

  const encryptedAppKey = JSON.stringify({
    version: "x25519-xsalsa20-poly1305",
    ephemPublicKey: "XlKp9ypR9keMbDFjlPP4Iq7jtAp2Y0TdznX9nlfphRI=",
    nonce: "2R+1UJCd5WRK/lWev88PBY/5EKhZ2eZf",
    ciphertext:
      "TkXcPpNaj4o1WB57NkDaUU2HoD7YAsoCXAnk4a8xVr9tZyXTrhlDVRTjubTLKneHFN4TRrNipd/FV8UCHsxwBVdaJSQKdsXr0m99jtL7Dpk5IGUX34OC/EDsMWC0aTriepodc1rXlnTzjAXdvstbfmFp/B18OjIZhwklRY3IavgR7Q1iUd2NKlcVeml15XlUF9ZK1qpKgW1Vyp4/z0+xQkJZxqOcMbQTyF65TlE/VjHRWmyosRs8liv0+QFvG9/S7oEge8/UDp+5Sf9wz2C8UFBcjtJakDSbd+U4USDpJqUZlb7LXWOi4Y1l099twaWy1aGsFwz8eBi4hgCEZTmEI5U=",
  });

  function decodeSignature(sig) {
    const r = "0x" + sig.slice(2, 66);
    const s = "0x" + sig.slice(66, 130);
    let v = parseInt(sig.slice(130, 132), 16);

    if (v < 27) {
      v += 27;
    }

    return { v, r, s };
  }

  async function signRawHash(hash, signer) {
    const sig = await web3.eth.sign(hash, signer);
    return decodeSignature(sig);
  }

  async function getDeploymentGas(instance) {
    const receipt = await web3.eth.getTransactionReceipt(instance.transactionHash);
    return receipt.gasUsed;
  }

  function printRow(row) {
    console.log(
      `${row.operation.padEnd(28)} gas=${String(row.gasUsed).padStart(10)} payloadBytes=${row.payloadBytes}`
    );
  }

  function writeResults(rows) {
    const outDir = path.join(__dirname, "gas-results");
    fs.mkdirSync(outDir, { recursive: true });

    const jsonPath = path.join(outDir, "didGasAnalysis.json");
    const csvPath = path.join(outDir, "didGasAnalysis.csv");

    fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2));

    const header = "operation,gasUsed,payloadBytes\n";
    const body = rows
      .map((r) => `${r.operation},${r.gasUsed},${r.payloadBytes ?? ""}`)
      .join("\n");

    fs.writeFileSync(csvPath, header + body + "\n");

    console.log(`\nJSON: ${jsonPath}`);
    console.log(`CSV : ${csvPath}`);
  }

  it("measures deployment, createUser, CSR, and AppKey gas", async () => {
    const rows = [];

    console.log("\n========== DID Gas Analysis ==========\n");

    const manager = await IdentityManager.new({ from: org });

    rows.push({
      operation: "deploy_IdentityManager",
      gasUsed: await getDeploymentGas(manager),
      payloadBytes: 0,
    });

    const standaloneIdentity = await Identity.new(user, { from: org });

    rows.push({
      operation: "deploy_Identity",
      gasUsed: await getDeploymentGas(standaloneIdentity),
      payloadBytes: 0,
    });

    const createTx = await manager.createUser("user-001", user, 1, {
      from: org,
    });

    rows.push({
      operation: "createUser",
      gasUsed: createTx.receipt.gasUsed,
      payloadBytes: Buffer.byteLength("user-001", "utf8"),
    });

    const identityAddress = await manager.getUserIdentityContractAddress(user);
    const identity = await Identity.at(identityAddress);

    const csrHash = web3.utils.soliditySha3("AddEncryptedCSR:", user);
    const csrSig = await signRawHash(csrHash, user);

    const csrTx = await identity.addData(
      "CSR",
      encryptedCSR,
      csrHash,
      csrSig.v,
      csrSig.r,
      csrSig.s,
      { from: org }
    );

    rows.push({
      operation: "addData_CSR",
      gasUsed: csrTx.receipt.gasUsed,
      payloadBytes: Buffer.byteLength(encryptedCSR, "utf8"),
    });

    const appKeyHash = web3.utils.soliditySha3("AddEncryptedAppKey:", user);
    const appKeySig = await signRawHash(appKeyHash, user);

    const appKeyTx = await identity.addData(
      "APP_KEY",
      encryptedAppKey,
      appKeyHash,
      appKeySig.v,
      appKeySig.r,
      appKeySig.s,
      { from: org }
    );

    rows.push({
      operation: "addData_APP_KEY",
      gasUsed: appKeyTx.receipt.gasUsed,
      payloadBytes: Buffer.byteLength(encryptedAppKey, "utf8"),
    });

    rows.forEach(printRow);
    writeResults(rows);
  });
});