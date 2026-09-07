// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Demonstration currency; the unrestricted faucet has no economic value.
contract AllowanceTestToken is ERC20 {
    constructor() ERC20("Allowance Test Token", "ATT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        _mint(msg.sender, 100 * 10 ** 6);
    }
}
