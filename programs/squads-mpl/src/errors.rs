/*
    Squads Multisig Program - Program Errors
    https://github.com/squads-protocol/squads-mpl
*/

use anchor_lang::prelude::*;

#[error_code]
pub enum MsError {
    KeyNotInMultisig,
    InvalidTransactionState,
    InvalidNumberOfAccounts,
    InvalidInstructionAccount,
    InvalidAuthorityIndex,
    TransactionAlreadyExecuted,
    CannotRemoveSoloMember,
    InvalidThreshold,
    DeprecatedTransaction,
    InstructionFailed,
    MaxMembersReached,
    EmptyMembers,
    PartialExecution,
    NotEnoughLamports,
    TimeLockNotSatisfied, // Custom error for time lock condition
    NoPrimaryMemberSpecified, // Error for missing primary member in primary member approval mode
    PrimaryMemberNotInMultisig, // Error for primary member not being in the multisig
    UnauthorizedMember, // Error for member unauthorized to execute transaction
    TimeLockExceedsMaximum, // Error for time lock exceeding the maximum allowable duration
    GuardianAlreadyExists,
    GuardianNotFound,
    MaxGuardiansReached, // Error when the maximum number of guardians is reached
    InvalidApprovalModeForExecution, // Error for approval mode not matching the transaction mode
    TimeError, // Error for time related errors
    MissingAccount, // Error for missing account
    SpendingLimitNotFound, // Error for missing spending limit
    SpendingLimitExceeded, // Error for exceeding spending limit
    SpendingLimitMustBeForSol, // Error for spending limit not being for SOL
    InvalidMint, // Error for invalid mint
    InvalidAmount, // Error for invalid amount
    InvalidDecimals, // Error for incorrect decimals
    SpendingLimitDisabled, // Error for spending limit disabled
    DuplicateMembers, // Error for duplicate members
    ChangeIndexExceedsTransactionIndex, // Error for change index exceeding transaction index
}