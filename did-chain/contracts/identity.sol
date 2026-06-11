// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

contract Identity {
	event IdentityEvent(bool res, string msg);
	event CredentialCreated(string id, string issuedAt);

	address owner;
	mapping(string => string) data;

	struct Credential {
		string id;
		string name;
		string issuedAt;
	}

	//mapping(string => Credential) public credentials;
	Credential public credential;

	constructor(address _owner) {
		owner = _owner;
	}

	function verifySignature(bytes32 _hashedMsg, uint8 _v, bytes32 _r, bytes32 _s) public view returns(bool) {
		return ecrecover(_hashedMsg, _v, _r, _s) == owner;
	}

	function addData(string memory _name, string memory _data, bytes32 _hashedMsg, uint8 _v, bytes32 _r, bytes32 _s) public {
		if (!verifySignature(_hashedMsg, _v, _r, _s)) {
			emit IdentityEvent(false, "only owner can add data");
			return;
		}
		data[_name] = _data;
		emit IdentityEvent(true, "ok");
	}

	function getData(string memory _name, bytes32 _hashedMsg, uint8 _v, bytes32 _r, bytes32 _s) public view returns(string memory) {
		if (!verifySignature(_hashedMsg, _v, _r, _s)) {
			return "only owner can get data";
		}
		return data[_name];
	}

	function addressToString(address _addr) internal pure returns (string memory) {
		bytes32 value = bytes32(uint256(uint160(_addr)));
		bytes memory alphabet = "0123456789abcdef";

		bytes memory str = new bytes(42);
		str[0] = '0';
		str[1] = 'x';
		for (uint i = 0; i < 20; i++) {
			str[2+i*2] = alphabet[uint(uint8(value[i + 12] >> 4))];
			str[3+i*2] = alphabet[uint(uint8(value[i + 12] & 0x0f))];
		}
		return string(str);
	}
}
