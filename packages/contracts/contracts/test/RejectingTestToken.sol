// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Contract-test asset only; never deployed by the application script.
contract RejectingTestToken is ERC20 {
    bool public rejectTransfers;

    constructor() ERC20("Test", "TEST") {
        _mint(msg.sender, 100_000_000);
    }

    function setRejectTransfers(bool reject) external {
        rejectTransfers = reject;
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        if (rejectTransfers) {
            return false;
        }
        return super.transfer(recipient, amount);
    }
}
