// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AgentAllowanceVault is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Allowance {
        address owner;
        address agent;
        address provider;
        uint256 budget;
        uint256 perPurchase;
        uint256 spent;
        uint256 expiresAt;
        bool revoked;
        uint256 withdrawn;
    }

    struct Quote {
        uint256 allowanceId;
        bytes32 service;
        bytes32 requestHash;
        address recipient;
        uint256 amount;
        bytes32 nonce;
        uint256 expiresAt;
    }

    bytes32 private constant QUOTE_TYPEHASH =
        keccak256(
            "Quote(uint256 allowanceId,bytes32 service,bytes32 requestHash,address recipient,uint256 amount,bytes32 nonce,uint256 expiresAt)"
        );

    IERC20 public immutable token;
    uint256 public nextAllowanceId = 1;
    mapping(uint256 => Allowance) public allowances;
    mapping(bytes32 => bool) public purchases;

    error InvalidAllowance();
    error Unauthorized();
    error InactiveAllowance();
    error InvalidQuote();
    error LimitExceeded();
    error DuplicatePurchase();
    error NothingToWithdraw();

    event AllowanceCreated(
        uint256 indexed allowanceId,
        address indexed owner,
        address agent,
        address provider,
        uint256 budget,
        uint256 perPurchase,
        uint256 expiresAt
    );
    event Purchased(
        bytes32 indexed purchaseId,
        uint256 indexed allowanceId,
        address indexed recipient,
        uint256 amount,
        bytes32 service,
        bytes32 requestHash
    );
    event AllowanceRevoked(uint256 indexed allowanceId);
    event UnusedWithdrawn(uint256 indexed allowanceId, uint256 amount);

    constructor(address tokenAddress) EIP712("AgentAllowanceVault", "1") {
        if (tokenAddress == address(0)) revert InvalidAllowance();
        token = IERC20(tokenAddress);
    }

    function createAllowance(
        address agent,
        address provider,
        uint256 budget,
        uint256 perPurchase,
        uint256 expiresAt
    ) external nonReentrant returns (uint256 allowanceId) {
        if (
            agent == address(0) ||
            provider == address(0) ||
            budget == 0 ||
            perPurchase == 0 ||
            perPurchase > budget ||
            expiresAt <= block.timestamp
        ) revert InvalidAllowance();

        allowanceId = nextAllowanceId++;
        allowances[allowanceId] = Allowance(
            msg.sender,
            agent,
            provider,
            budget,
            perPurchase,
            0,
            expiresAt,
            false,
            0
        );
        token.safeTransferFrom(msg.sender, address(this), budget);
        emit AllowanceCreated(
            allowanceId,
            msg.sender,
            agent,
            provider,
            budget,
            perPurchase,
            expiresAt
        );
    }

    function quoteDigest(Quote calldata quote) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        QUOTE_TYPEHASH,
                        quote.allowanceId,
                        quote.service,
                        quote.requestHash,
                        quote.recipient,
                        quote.amount,
                        quote.nonce,
                        quote.expiresAt
                    )
                )
            );
    }

    function purchase(
        Quote calldata quote,
        bytes calldata signature
    ) external nonReentrant {
        Allowance storage allowance = allowances[quote.allowanceId];

        if (msg.sender != allowance.agent) revert Unauthorized();
        if (allowance.revoked || block.timestamp >= allowance.expiresAt) {
            revert InactiveAllowance();
        }
        if (
            quote.amount == 0 ||
            block.timestamp >= quote.expiresAt ||
            quote.recipient != allowance.provider
        ) revert InvalidQuote();

        bytes32 purchaseId = quoteDigest(quote);
        if (ECDSA.recover(purchaseId, signature) != allowance.provider)
            revert InvalidQuote();
        if (purchases[purchaseId]) revert DuplicatePurchase();
        if (
            quote.amount > allowance.perPurchase ||
            quote.amount >
            allowance.budget - allowance.spent - allowance.withdrawn
        ) revert LimitExceeded();

        // Accounting and replay protection share the transfer's atomic transaction.
        // Failed transfers roll back both; competing purchases cannot overspend.
        purchases[purchaseId] = true;
        allowance.spent += quote.amount;
        token.safeTransfer(quote.recipient, quote.amount);
        emit Purchased(
            purchaseId,
            quote.allowanceId,
            quote.recipient,
            quote.amount,
            quote.service,
            quote.requestHash
        );
    }

    function revokeAllowance(uint256 allowanceId) external {
        Allowance storage allowance = allowances[allowanceId];
        if (msg.sender != allowance.owner) revert Unauthorized();

        allowance.revoked = true;
        emit AllowanceRevoked(allowanceId);
    }

    function withdrawUnused(uint256 allowanceId) external nonReentrant {
        Allowance storage allowance = allowances[allowanceId];
        if (msg.sender != allowance.owner) revert Unauthorized();
        if (!allowance.revoked && block.timestamp < allowance.expiresAt) {
            revert InactiveAllowance();
        }

        uint256 remaining = allowance.budget -
            allowance.spent -
            allowance.withdrawn;
        if (remaining == 0) revert NothingToWithdraw();

        allowance.withdrawn += remaining;
        token.safeTransfer(allowance.owner, remaining);
        emit UnusedWithdrawn(allowanceId, remaining);
    }
}
