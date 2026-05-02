// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AgentEscrow} from "../src/AgentEscrow.sol";

/**
 * @notice AgentEscrow 部署脚本（XLayer）。
 *
 * 默认参数：
 *   - 初始白名单 Token：XLayer USDT (0x1e4a5963abfd975d8c9021ce480b42188849d41d)
 *   - 初始费率：0
 *   - 默认锁定区块：28800 (~24h @ 3s/block)
 *
 * 使用：
 *   forge script script/Deploy.s.sol:DeployAgentEscrow \
 *     --rpc-url $XLAYER_RPC --broadcast -vvvv
 *
 * 必需环境变量：
 *   PRIVATE_KEY      部署者私钥（同时是 Owner）
 *   FEE_RECIPIENT    手续费接收地址
 *   ARBITRATOR       仲裁者地址（单签）
 *
 * 可选环境变量：
 *   FEE_BPS          初始费率（默认 0）
 *   USDT_ADDRESS     初始白名单 Token（默认 XLayer USDT）
 */
contract DeployAgentEscrow is Script {
    address constant XLAYER_USDT = 0x1E4a5963aBFD975d8c9021ce480b42188849D41d;

    function run() external {
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address arbitrator = vm.envAddress("ARBITRATOR");
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(0));
        address usdt = vm.envOr("USDT_ADDRESS", XLAYER_USDT);

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        AgentEscrow escrow = new AgentEscrow(feeRecipient, arbitrator, feeBps, usdt);
        vm.stopBroadcast();

        console.log("AgentEscrow deployed at:", address(escrow));
        console.log("  feeRecipient:", feeRecipient);
        console.log("  arbitrator:  ", arbitrator);
        console.log("  feeBps:      ", feeBps);
        console.log("  USDT:        ", usdt);
        console.log("  defaultLockBlocks:", escrow.defaultLockBlocks());
    }
}
