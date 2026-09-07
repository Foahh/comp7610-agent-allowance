// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test double used only to verify atomic transfer rollback.
contract FailingToken is ERC20 {
    bool public failTransfers;

    constructor() ERC20("Failure test", "FAIL") {
        _mint(msg.sender, 100000000);
    }

    function setFailTransfers(bool shouldFail) external {
        failTransfers = shouldFail;
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        require(!failTransfers || from == address(0), "Transfer failure");
        super._update(from, to, value);
    }
}
