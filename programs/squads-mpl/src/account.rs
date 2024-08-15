/*
    Squads Multisig Program - Account contexts
    https://github.com/squads-protocol/squads-mpl
*/

use anchor_lang::prelude::*;
use anchor_spl::token::{ Mint, Token, TokenAccount};
use crate::state::*;
use crate::errors::*;

/// The create multisig account context
/// Expects the following accounts:
/// 1. multisig account
/// 2. creator account [signer]
/// 3. system program
/// 
/// Expects the following arguments:
/// 1. threshold: u16
/// 2. create_key: Pubkey
/// 3. members: Vec<Pubkey>
/// 4. meta: String (for optional on-chain memo)
#[derive(Accounts)]
#[instruction(threshold: u16, create_key: Pubkey, members: Vec<Pubkey>, meta: String, primary_member: Option<Pubkey>,  time_lock: u32, guardians: Vec<Pubkey>)]
pub struct Create<'info> {
    #[account(
        init,
        payer = creator,
        space = Ms::SIZE_WITHOUT_MEMBERS + (members.len() * 32),  // Preallocate space for the members
        seeds = [b"squad", create_key.as_ref(), b"multisig"], bump
    )]
    pub multisig: Account<'info, Ms>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// The account context for creating a new multisig transaction
/// Upon fresh creation the transaction will be in a Draft state
/// 
/// Expects the following accounts:
/// 1. multisig account
/// 2. transaction account
/// 3. creator account [signer]
/// 4. system program
#[derive(Accounts)]
#[instruction(authority_index: u32, mode: ApprovalMode)]
pub struct CreateTransaction<'info> {
    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.create_key.as_ref(),
            b"multisig"
        ],
        bump = multisig.bump,
    )]
    pub multisig: Account<'info, Ms>,

    #[account(
        init,
        payer = creator,
        space = 8 + MsTransaction::initial_size_with_members(multisig.keys.len()),
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            &multisig.transaction_index.checked_add(1).unwrap().to_le_bytes(),
            b"transaction"
        ], bump
    )]
    pub transaction: Account<'info, MsTransaction>,

    #[account(
        mut,
        constraint = multisig.is_member(creator.key()).is_some() @MsError::KeyNotInMultisig,
    )]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// The account context for adding an instruction to a transaction
/// The transaction must be in a Draft state, and the creator must be a member of the multisig
/// 
/// Expects the following accounts:
/// 1. multisig account
/// 2. transaction account
/// 3. instruction account
/// 4. creator account [signer]
/// 5. system program
/// 
/// Expects the following arguments:
/// 1. instruction_data: IncomingInstruction
#[derive(Accounts)]
#[instruction(instruction_data: IncomingInstruction)]
pub struct AddInstruction<'info> {
    #[account(
        seeds = [
            b"squad",
            multisig.create_key.as_ref(),
            b"multisig"
        ],
        bump = multisig.bump,
    )]
    pub multisig: Account<'info, Ms>,

    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            &transaction.transaction_index.to_le_bytes(),
            b"transaction"
        ], bump = transaction.bump,
        constraint = transaction.creator == creator.key(),
        constraint = matches!(transaction.status, MsTransactionStatus::Draft { .. }) @MsError::InvalidTransactionState,
        constraint = transaction.ms == multisig.key() @MsError::InvalidInstructionAccount,
    )]
    pub transaction: Account<'info, MsTransaction>,

    #[account(
        init,
        payer = creator,
        space = 8 + instruction_data.get_max_size(),
        seeds = [
            b"squad",
            transaction.key().as_ref(),
            &transaction.instruction_index.checked_add(1).unwrap().to_le_bytes(),
            b"instruction"
        ],
        bump
    )]
    pub instruction: Account<'info, MsInstruction>,

    #[account(
        mut,
        constraint = multisig.is_member(creator.key()).is_some() @MsError::KeyNotInMultisig,
    )]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// The account context for activating a transaction
/// The transaction must be in a Draft state, and the creator must be a member of the multisig
/// 
/// Expects the following accounts:
/// 1. multisig account
/// 2. transaction account
/// 3. creator account [signer]
/// 
#[derive(Accounts)]
pub struct ActivateTransaction<'info> {
    #[account(
        seeds = [
            b"squad",
            multisig.create_key.as_ref(),
            b"multisig"
        ],
        bump = multisig.bump,
    )]
    pub multisig: Account<'info, Ms>,

    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            &transaction.transaction_index.to_le_bytes(),
            b"transaction"
        ], bump = transaction.bump,
        constraint = transaction.creator == creator.key(),
        constraint = matches!(transaction.status, MsTransactionStatus::Draft { .. }) @MsError::InvalidTransactionState,
        constraint = transaction.transaction_index > multisig.ms_change_index @MsError::DeprecatedTransaction,
        constraint = transaction.ms == multisig.key() @MsError::InvalidInstructionAccount,
    )]
    pub transaction: Account<'info, MsTransaction>,

    #[account(
        mut,
        constraint = multisig.is_member(creator.key()).is_some() @MsError::KeyNotInMultisig,
    )]
    pub creator: Signer<'info>,
    // pub system_program: Program<'info, System>,
}

/// The account context for voting on a transaction
/// The transaction must be in an Active state, and the voter must be a member of the multisig
/// 
/// Expects the following accounts:
/// 1. multisig account
/// 2. transaction account
/// 3. voter account [signer]
/// 
#[derive(Accounts)]
pub struct VoteTransaction<'info> {
    #[account(
        seeds = [
            b"squad",
            multisig.create_key.as_ref(),
            b"multisig"
        ],
        bump = multisig.bump,
    )]
    pub multisig: Account<'info, Ms>,

    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            &transaction.transaction_index.to_le_bytes(),
            b"transaction"
        ], bump = transaction.bump,
        constraint = matches!(transaction.status, MsTransactionStatus::Active { .. }) @MsError::InvalidTransactionState ,
        constraint = transaction.transaction_index > multisig.ms_change_index @MsError::DeprecatedTransaction,
        constraint = transaction.ms == multisig.key() @MsError::InvalidInstructionAccount,
    )]
    pub transaction: Account<'info, MsTransaction>,

    #[account(
        mut,
        constraint = multisig.is_member(member.key()).is_some() @MsError::KeyNotInMultisig,
    )]
    pub member: Signer<'info>,
    // pub system_program: Program<'info, System>,
}

/// The account context for submitting a vote to cancel a transaction
/// The transaction must be in an ExecuteReady state, and the voter must be a member of the multisig
/// 
/// Expects the following accounts:
/// 1. multisig account
/// 2. transaction account
/// 3. member account [signer]
/// 
#[derive(Accounts)]
pub struct CancelTransaction<'info> {
    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.create_key.as_ref(),
            b"multisig"
        ],
        bump = multisig.bump,
    )]
    pub multisig: Account<'info, Ms>,

    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            &transaction.transaction_index.to_le_bytes(),
            b"transaction"
        ], bump = transaction.bump,
        constraint = matches!(transaction.status, MsTransactionStatus::ExecuteReady { .. }) @MsError::InvalidTransactionState,
        constraint = transaction.ms == multisig.key() @MsError::InvalidInstructionAccount,
    )]
    pub transaction: Account<'info, MsTransaction>,

    #[account(
        mut,
        constraint = multisig.is_member(member.key()).is_some() @MsError::KeyNotInMultisig,
    )]
    pub member: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// The account context for executing a transaction
/// The transaction must be in an ExecuteReady state, and the creator must be a member of the multisig
/// 
/// Expects the following accounts:
/// 1. multisig account
/// 2. transaction account
/// 3. member account [signer]
/// 
#[derive(Accounts)]
pub struct ExecuteTransaction<'info> {
    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.create_key.as_ref(),
            b"multisig"
        ],
        bump = multisig.bump,
    )]
    pub multisig: Box<Account<'info, Ms>>,

    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            &transaction.transaction_index.to_le_bytes(),
            b"transaction"
        ], bump = transaction.bump,
        constraint = matches!(transaction.status, MsTransactionStatus::ExecuteReady { .. }) @MsError::InvalidTransactionState,
        constraint = transaction.ms == multisig.key() @MsError::InvalidInstructionAccount,
        constraint = transaction.transaction_index > multisig.ms_change_index @MsError::DeprecatedTransaction,
        // if they've already started sequential execution, they must continue
        constraint = transaction.executed_index < 1 @MsError::PartialExecution,
    )]
    pub transaction: Account<'info, MsTransaction>,

    #[account(
        mut,
        constraint = multisig.is_member(member.key()).is_some() @MsError::KeyNotInMultisig,
    )]
    pub member: Signer<'info>,
}

/// The account context for executing a transaction instruction individually
/// The transaction must be in an ExecuteReady state, and the creator must be a member of the multisig, and the instruction must correlate to the next executed index
/// 
/// Expects the following accounts:
/// 1. multisig account
/// 2. transaction account
/// 3. member account [signer]
/// 
#[derive(Accounts)]
pub struct ExecuteInstruction<'info> {
    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.create_key.as_ref(),
            b"multisig"
        ],
        bump = multisig.bump,
    )]
    pub multisig: Box<Account<'info, Ms>>,

    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            &transaction.transaction_index.to_le_bytes(),
            b"transaction"
        ], bump = transaction.bump,
        constraint = matches!(transaction.status, MsTransactionStatus::ExecuteReady { .. }) @MsError::InvalidTransactionState,
        constraint = transaction.ms == multisig.key() @MsError::InvalidInstructionAccount,
        constraint = transaction.transaction_index > multisig.ms_change_index @MsError::DeprecatedTransaction,
        constraint = matches!(transaction.mode, ApprovalMode::ApprovalByMultisig) @MsError::InvalidApprovalModeForExecution,
    )]
    pub transaction: Account<'info, MsTransaction>,

    #[account(
        mut,
        seeds = [
            b"squad",
            transaction.key().as_ref(),
            &transaction.executed_index.checked_add(1).unwrap().to_le_bytes(),
            b"instruction"
        ], bump = instruction.bump,
        // it should be the next expected instruction account to be executed
        constraint = instruction.instruction_index == transaction.executed_index.checked_add(1).unwrap() @MsError::InvalidInstructionAccount,
    )]
    pub instruction: Account<'info, MsInstruction>,

    #[account(
        mut,
        constraint = multisig.is_member(member.key()).is_some() @MsError::KeyNotInMultisig,
    )]
    pub member: Signer<'info>,
}

/// The account context for executing an internal multisig transaction (which changes the multisig account)
/// 
/// Expects the following accounts:
/// 1. multisig account [signer]
#[derive(Accounts)]
pub struct MsAuth<'info> {
    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.create_key.as_ref(),
            b"multisig"
        ], bump = multisig.bump,
        signer
    )]
    pub multisig: Box<Account<'info, Ms>>,
}

#[derive(Accounts)]
pub struct RemovePrimaryMember<'info> {
    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.create_key.as_ref(),
            b"multisig"
        ],
        bump = multisig.bump,
    )]
    pub multisig: Account<'info, Ms>,

    #[account(
        mut,
        constraint = multisig.is_guardian(remover.key()).is_some() @MsError::UnauthorizedMember,
    )]
    pub remover: Signer<'info>,
}

/// The account context for reallocating the multisig account (for add member, where the size may need to be adjusted)
/// 
/// Expects the following accounts:
/// 1. multisig account [signer]
/// 2. rent sysvar
/// 3. system program
/// 
/// 
#[derive(Accounts)]
pub struct MsAuthRealloc<'info> {
    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.create_key.as_ref(),
            b"multisig"
        ], bump = multisig.bump,
        signer
    )]
    pub multisig: Box<Account<'info, Ms>>,

    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(mint: Pubkey, authority_index: u32 )]
pub struct CreateSpendingLimit<'info> {
    #[account(
        init,
        payer = rent_payer,
        space = SpendingLimit::LEN,
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            mint.as_ref(),
            &authority_index.to_le_bytes(),
            b"spending_limit",
        ],
        bump,
    )]
    pub spending_limit: Account<'info, SpendingLimit>,
    #[account(
        mut,
        seeds = [b"squad", multisig.create_key.as_ref(), b"multisig"],
        bump = multisig.bump,
        signer
    )]
    pub multisig: Account<'info, Ms>,
    /// This is usually the same as `config_authority`, but can be a different account if needed.
    #[account(mut)]
    pub rent_payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveSpendingLimit<'info> {
    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            &spending_limit.mint.as_ref(),
            &spending_limit.authority_index.to_le_bytes(),
            b"spending_limit",
        ],
        bump,
        constraint = spending_limit.multisig == multisig.key() @MsError::InvalidInstructionAccount,
        close = multisig
    )]
    pub spending_limit: Account<'info, SpendingLimit>,
    #[account(
        mut,
        seeds = [b"squad", multisig.create_key.as_ref(), b"multisig"],
        bump = multisig.bump,
        signer
    )]
    pub multisig: Account<'info, Ms>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct SpendingLimitUse<'info> {
    #[account(
        mut,
        seeds = [b"squad", multisig.create_key.as_ref(), b"multisig"],
        bump = multisig.bump,
    )]
    pub multisig: Account<'info, Ms>,

    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            &spending_limit.mint.as_ref(),
            &spending_limit.authority_index.to_le_bytes(),
            b"spending_limit",
        ],
        bump = spending_limit.bump,
        constraint = spending_limit.multisig == multisig.key() @MsError::InvalidInstructionAccount,
        has_one = multisig @ MsError::InvalidInstructionAccount,
    )]
    pub spending_limit: Account<'info, SpendingLimit>,

    #[account(
        mut,
        constraint = multisig.primary_member.is_some() @ MsError::PrimaryMemberNotInMultisig,
        constraint = multisig.primary_member.unwrap() == primary_member.key() @ MsError::UnauthorizedMember
    )]
    pub primary_member: Signer<'info>, // Primary member as signer

    #[account(mut)]
    pub destination_token_account: Option<Account<'info, TokenAccount>>, // SPL token destination account
    
    /// CHECK: Could be any account
    #[account(mut)]
    pub destination: Option<AccountInfo<'info>>, // SOL destination account

    /// CHECK: All the required checks are done by checking the seeds and bump.
    #[account(
        mut,
        seeds = [
            b"squad",
            multisig.key().as_ref(),
            &spending_limit.authority_index.to_le_bytes(),
            b"authority"
        ],
        bump = spending_limit.authority_bump,
    )]
    pub vault: AccountInfo<'info>, // Vault from which the asset is transferred

    pub token_program: Option<Program<'info, Token>>, // SPL token program
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

