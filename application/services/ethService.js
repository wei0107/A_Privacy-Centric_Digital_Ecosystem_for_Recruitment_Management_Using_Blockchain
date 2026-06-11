const { Web3 } = require('web3');
const crypto = require('crypto');
const didConfig = require('../public/javascripts/did_config');
const identityManagerAbi = require('../public/javascripts/IdentityManager.abi');
const identityAbi = require('../public/javascripts/Identity.abi');

const web3 = new Web3(didConfig.url);
const identityManagerContract = new web3.eth.Contract(identityManagerAbi, didConfig.contracts.identityManager.address);

let isCreatingUser = false;
const createUserQueue = [];

const createUser = async (id, address, type) => {
  return new Promise((resolve, reject) => {
      createUserQueue.push({ id, address, type, resolve, reject });
      processCreateUserQueue(); // 觸發排程器
  });
};

const processCreateUserQueue = async () => {
  if (isCreatingUser || createUserQueue.length === 0) return;

  isCreatingUser = true;
  const { id, address, type, resolve, reject } = createUserQueue.shift();

  try {
      const result = await createUserInternal(id, address, type);
      resolve(result);
  } catch (err) {
      reject(err);
  } finally {
      isCreatingUser = false;
      processCreateUserQueue(); // 處理下一筆
  }
};

const createUserInternal = async (id, address, type) => {
  const uniqueId = crypto.createHash('sha256')
      .update(id.toString())
      .digest('hex');

  await identityManagerContract.methods.createUser(uniqueId, address, type)
      .send({ from: didConfig.orgs.interior.address, gas: 2000000, gasPrice: 30000000000 });

  const returnValuesObject = await identityManagerContract.getPastEvents('IdentityManagerEvent');
  return returnValuesObject[0]?.returnValues || null;
};

// get the identity contract address by wallet address
const getUserIdentityContractAddress = async (address) => {
    return await identityManagerContract.methods.getUserIdentityContractAddress(address)
        .call({ from: address })
        .catch(console.log);
};

// add a {key, val} pair to user's contract
const addUserData = async (address, name, data, hashedMsg, v, r, s) => {
    const identityContractAddress = await getUserIdentityContractAddress(address);
    if (!identityContractAddress) throw new Error('Identity contract address not found');
    
    const identityContract = new web3.eth.Contract(identityAbi, identityContractAddress);
    return await identityContract.methods.addData(name, data, hashedMsg, v, r, s)
        .send({ from: address, gas: 2000000, gasPrice: 30000000000 })
        .catch(console.log);
};

// find the val by the key from user's contract
const getUserData = async (address, name, hashedMsg, v, r, s) => {
    const identityContractAddress = await getUserIdentityContractAddress(address);
    if (!identityContractAddress) throw new Error('Identity contract address not found');
    
    const identityContract = new web3.eth.Contract(identityAbi, identityContractAddress);
    return await identityContract.methods.getData(name, hashedMsg, v, r, s)
        .call({ from: address })
        .catch(console.log);
};

const verifySignature = async (address, hashedMsg, v, r, s) => {
    try {
        const identityContractAddress = await getUserIdentityContractAddress(address);
        if (!identityContractAddress) throw new Error('Identity contract address not found');
        
        const identityContract = new web3.eth.Contract(identityAbi, identityContractAddress);
        return await identityContract.methods.verifySignature(hashedMsg, v, r, s).call({ from: address });
    } catch (error) {
        console.error("Error verifying signature:", error);
        throw error;
    }
};

module.exports = {
    createUser,
    getUserIdentityContractAddress,
    addUserData,
    getUserData,
    verifySignature,
};