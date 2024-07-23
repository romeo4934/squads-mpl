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
}