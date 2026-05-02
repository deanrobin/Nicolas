// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AgentEscrow} from "../src/AgentEscrow.sol";

/**
 * @notice Deployment script for AgentEscrow.
 *
 * Usage (Base Sepolia testnet):
 *   forge script script/Deploy.s.sol \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify \
 *     -vvvv
 *
 * Required env vars:
 *   PRIVATE_KEY        — deployer private key
 *   FEE_RECIPIENT      — address that collects platform fees
 *   ARBITRATOR         — multi-sig address for dispute resolution
 *   FEE_BPS            — platform fee in basis points (e.g. 250 = 2.5%)
 */
contract DeployAgentEscrow is Script {
    function run() external {
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address arbitrator = vm.envAddress("ARBITRATOR");
        uint256 feeBps = vm.envUint("FEE_BPS");

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        AgentEscrow escrow = new AgentEscrow(feeRecipient, arbitrator, feeBps);

        console.log("AgentEscrow deployed at:", address(escrow));
        console.log("  feeRecipient:", feeRecipient);
        console.log("  arbitrator:  ", arbitrator);
        console.log("  feeBps:      ", feeBps);

        vm.stopBroadcast();
    }
}
