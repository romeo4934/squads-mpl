/*
    Squads Multisig Program - Program & Instructions
    https://github.com/squads-protocol/squads-mpl
*/

use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::Instruction,
        program::invoke_signed
    }
};

use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use hex::FromHex;

use state::*;
use errors::*;
use account::*;

pub mod state;
pub mod account;
pub mod errors;

#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Squads MPL",
    project_url: "https://squads.so",
    contacts: "email:security@sqds.io,email:contact@osec.io",
    policy: "https://github.com/Squads-Protocol/squads-mpl/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/squads-protocol/squads-mpl",
    source_revision: default_env!("GITHUB_SHA", "aa264525559014c58cacf8fe2cdf3fc594511c06"),
    auditors: "OtterSec, Neodyme"
}

declare_id!("BQzL8jzPdU5o89uSYAyiySK1dAfwdejCy1sChXF5JvtF");

#[program]
pub mod squads_mpl {

    use std::convert::TryInto;

    use super::*;

    pub const MAX_TIME_LOCK: u32 = 3 * 30 * 24 * 60 * 60; // 3 months
    pub const MAX_GUARDIANS: usize = 10; // Set maximum number of guardians to 10

    /// Creates a new multisig account
    // instruction to create a multisig
    pub fn create(
        ctx: Context<Create>,
        threshold: u16,       // threshold of members required to sign
        create_key: Pubkey,   // the public key used to seed the original multisig creation
        members: Vec<Pubkey>, // a list of members (Public Keys) to use for the multisig
        _meta: String,        // a string of metadata that can be used to describe the multisig on-chain as a memo ie. '{"name":"My Multisig","description":"This is a my multisig"}'
        primary_member: Option<Pubkey>, // Optional primary member
        time_lock: u32, // Add time_lock parameter
        guardians: Vec<Pubkey>  // Add guardians parameter
    ) -> Result<()> {
        // sort the members and remove duplicates
        let mut members = members;
        members.sort();
        members.dedup();

        // sort the guardians and remove duplicates
        let mut guardians = guardians;
        guardians.sort();
        guardians.dedup();

        // check we don't exceed u16
        let total_members = members.len();
        if total_members < 1 {
            return err!(MsError::EmptyMembers);
        }

        // make sure we don't exceed u16 on first call
        if total_members > usize::from(u16::MAX) {
            return err!(MsError::MaxMembersReached);
        }

        // make sure threshold is valid
        if usize::from(threshold) < 1 || usize::from(threshold) > total_members {
            return err!(MsError::InvalidThreshold);
        }

        // Ensure primary member is in member list
        if let Some(primary_member) = primary_member {
            if !members.contains(&primary_member) {
                return err!(MsError::PrimaryMemberNotInMultisig);
            }
        }

        // Ensure the time lock duration is within the maximum allowable duration
        if time_lock > MAX_TIME_LOCK {
            return err!(MsError::TimeLockExceedsMaximum);
        }

        ctx.accounts.multisig.init(
            threshold,
            create_key,
            members,
            primary_member,
            *ctx.bumps.get("multisig").unwrap(),
            time_lock,
            guardians, 
        )
    }

    /// The instruction to add a new member to the multisig.
    /// Adds member/key to the multisig and reallocates space if neccessary
    /// If the multisig needs to be reallocated, it must be prefunded with
    /// enough lamports to cover the new size.
    pub fn add_member(ctx: Context<MsAuthRealloc>, new_member: Pubkey) -> Result<()> {
        // if max is already reached, we can't have more members
        if ctx.accounts.multisig.keys.len() >= usize::from(u16::MAX) {
            return err!(MsError::MaxMembersReached);
        }

        // check if realloc is needed
        let multisig_account_info = ctx.accounts.multisig.to_account_info();
        if *multisig_account_info.owner != squads_mpl::ID {
            return err!(MsError::InvalidInstructionAccount);
        }
        let curr_data_size = multisig_account_info.data.borrow().len();
        let spots_left =
            ((curr_data_size - Ms::SIZE_WITHOUT_MEMBERS) / 32) - ctx.accounts.multisig.keys.len() ;

        // if not enough, add (10 * 32) to size - bump it up by 10 accounts
        if spots_left < 1 {
            // add space for 10 more keys
            let needed_len = curr_data_size + (10 * 32);
            // reallocate more space
            AccountInfo::realloc(&multisig_account_info, needed_len, false)?;
            // if more lamports are needed, transfer them to the account
            let rent_exempt_lamports = ctx.accounts.rent.minimum_balance(needed_len).max(1);
            let top_up_lamports = rent_exempt_lamports
                .saturating_sub(ctx.accounts.multisig.to_account_info().lamports());
            if top_up_lamports > 0 {
                return err!(MsError::NotEnoughLamports);
            }
        }
        ctx.accounts.multisig.reload()?;
        ctx.accounts.multisig.add_member(new_member)?;
        let new_index = ctx.accounts.multisig.transaction_index;
        // set the change index, which will deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)
    }

    /// The instruction to remove a member from the multisig
    pub fn remove_member(ctx: Context<MsAuth>, old_member: Pubkey) -> Result<()> {
        // if there is only one key in this multisig, reject the removal
        if ctx.accounts.multisig.keys.len() == 1 {
            return err!(MsError::CannotRemoveSoloMember);
        }
        ctx.accounts.multisig.remove_member(old_member)?;

        // if the number of keys is now less than the threshold, adjust it
        if ctx.accounts.multisig.keys.len() < usize::from(ctx.accounts.multisig.threshold) {
            let new_threshold: u16 = ctx.accounts.multisig.keys.len().try_into().unwrap();
            ctx.accounts.multisig.change_threshold(new_threshold)?;
        }
        let new_index = ctx.accounts.multisig.transaction_index;
        // update the change index to deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)
    }

    /// The instruction to change the threshold of the multisig and simultaneously remove a member
    pub fn remove_member_and_change_threshold<'info>(
        ctx: Context<'_, '_, '_, 'info, MsAuth<'info>>,
        old_member: Pubkey,
        new_threshold: u16,
    ) -> Result<()> {
        remove_member(
            Context::new(
                ctx.program_id,
                ctx.accounts,
                ctx.remaining_accounts,
                ctx.bumps.clone(),
            ),
            old_member,
        )?;
        change_threshold(ctx, new_threshold)
    }

    /// The instruction to change the threshold of the multisig and simultaneously add a member
    pub fn add_member_and_change_threshold<'info>(
        ctx: Context<'_, '_, '_, 'info, MsAuthRealloc<'info>>,
        new_member: Pubkey,
        new_threshold: u16,
    ) -> Result<()> {
        // add the member
        add_member(
            Context::new(
                ctx.program_id,
                ctx.accounts,
                ctx.remaining_accounts,
                ctx.bumps.clone(),
            ),
            new_member,
        )?;

        // check that the threshold value is valid
        if ctx.accounts.multisig.keys.len() < usize::from(new_threshold) {
            let new_threshold: u16 = ctx.accounts.multisig.keys.len().try_into().unwrap();
            ctx.accounts.multisig.change_threshold(new_threshold)?;
        } else if new_threshold < 1 {
            return err!(MsError::InvalidThreshold);
        } else {
            ctx.accounts.multisig.change_threshold(new_threshold)?;
        }
        let new_index = ctx.accounts.multisig.transaction_index;
        // update the change index to deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)
    }

    /// The instruction to change the threshold of the multisig
    pub fn change_threshold(ctx: Context<MsAuth>, new_threshold: u16) -> Result<()> {
        // if the new threshold value is valid
        if ctx.accounts.multisig.keys.len() < usize::from(new_threshold) {
            let new_threshold: u16 = ctx.accounts.multisig.keys.len().try_into().unwrap();
            ctx.accounts.multisig.change_threshold(new_threshold)?;
        } else if new_threshold < 1 {
            return err!(MsError::InvalidThreshold);
        } else {
            ctx.accounts.multisig.change_threshold(new_threshold)?;
        }
        let new_index = ctx.accounts.multisig.transaction_index;
        // update the change index to deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)
    }

    /// instruction to increase the authority value tracked in the multisig
    /// This is optional, as authorities are simply PDAs, however it may be helpful
    /// to keep track of commonly used authorities in a UI.
    /// This has no functional impact on the multisig or its functionality, but
    /// can be used to track commonly used authorities (ie, vault 1, vault 2, etc.)
    pub fn add_authority(ctx: Context<MsAuth>) -> Result<()> {
        ctx.accounts.multisig.add_authority()
    }

    /// Instruction to create a multisig transaction.
    /// Each transaction is tied to a single authority, and must be specified when
    /// creating the instruction below. authority 0 is reserved for internal
    /// instructions, whereas authorities 1 or greater refer to a vault,
    /// upgrade authority, or other.
    pub fn create_transaction(ctx: Context<CreateTransaction>, authority_index: u32, mode: ApprovalMode,) -> Result<()> {
        match mode {
            ApprovalMode::ApprovalByPrimaryMember => {
                if ctx.accounts.multisig.primary_member.is_none() {
                    return err!(MsError::NoPrimaryMemberSpecified);
                }
            }
            ApprovalMode::ApprovalByMultisig => {}
        }
        
        let ms = &mut ctx.accounts.multisig;
        let authority_bump = match authority_index {
            1.. => {
                let (_, auth_bump) = Pubkey::find_program_address(
                    &[
                        b"squad",
                        ms.key().as_ref(),
                        &authority_index.to_le_bytes(),
                        b"authority",
                    ],
                    ctx.program_id,
                );
                auth_bump
            }
            0 => ms.bump,
        };

        ms.transaction_index = ms.transaction_index.checked_add(1).unwrap();
        ctx.accounts.transaction.init(
            ctx.accounts.creator.key(),
            ms.key(),
            ms.transaction_index,
            *ctx.bumps.get("transaction").unwrap(),
            authority_index,
            authority_bump,
            mode, // Initialize with mode
        )
    }

    /// Instruction to set the state of a transaction "active".
    /// "active" transactions can then be signed off by multisig members
    pub fn activate_transaction(ctx: Context<ActivateTransaction>) -> Result<()> {
        ctx.accounts.transaction.activate()
    }

    /// Instruction to attach an instruction to a transaction.
    /// Transactions must be in the "draft" status, and any
    /// signer (aside from execution payer) specified in an instruction 
    /// must match the authority PDA specified during the transaction creation.
    pub fn add_instruction(
        ctx: Context<AddInstruction>,
        incoming_instruction: IncomingInstruction,
    ) -> Result<()> {
        let tx = &mut ctx.accounts.transaction;
        // make sure internal transactions have a matching program id for attached instructions
        if tx.authority_index == 0 && &incoming_instruction.program_id != ctx.program_id {
            return err!(MsError::InvalidAuthorityIndex);
        }
        tx.instruction_index = tx.instruction_index.checked_add(1).unwrap();
        ctx.accounts.instruction.init(
            tx.instruction_index,
            incoming_instruction,
            *ctx.bumps.get("instruction").unwrap(),
        )
    }

    /// Instruction to approve a transaction on behalf of a member.
    /// The transaction must have an "active" status
    pub fn approve_transaction(ctx: Context<VoteTransaction>) -> Result<()> {
        // if they have previously voted to reject, remove that item (change vote check)
        if let Some(ind) = ctx
            .accounts
            .transaction
            .has_voted_reject(ctx.accounts.member.key())
        {
            ctx.accounts.transaction.remove_reject(ind)?;
        }

        // if they haven't already approved
        if ctx
            .accounts
            .transaction
            .has_voted_approve(ctx.accounts.member.key())
            .is_none()
        {
            ctx.accounts.transaction.sign(ctx.accounts.member.key())?;
        }

        // if current number of signers reaches threshold, mark the transaction as execute ready
        if ctx.accounts.transaction.approved.len() >= usize::from(ctx.accounts.multisig.threshold) {
            ctx.accounts.transaction.ready_to_execute()?;
        }
        Ok(())
    }

    /// Instruction to reject a transaction.
    /// The transaction must have an "active" status.
    pub fn reject_transaction(ctx: Context<VoteTransaction>) -> Result<()> {
        // if they have previously voted to approve, remove that item (change vote check)
        if let Some(ind) = ctx
            .accounts
            .transaction
            .has_voted_approve(ctx.accounts.member.key())
        {
            ctx.accounts.transaction.remove_approve(ind)?;
        }

        // check if they haven't already voted reject
        if ctx
            .accounts
            .transaction
            .has_voted_reject(ctx.accounts.member.key())
            .is_none()
        {
            ctx.accounts.transaction.reject(ctx.accounts.member.key())?;
        }

        // ie total members 7, threshold 3, cutoff = 4
        // ie total member 8, threshold 6, cutoff = 2
        let cutoff = ctx
            .accounts
            .multisig
            .keys
            .len()
            .checked_sub(usize::from(ctx.accounts.multisig.threshold))
            .unwrap();
        if ctx.accounts.transaction.rejected.len() > cutoff {
            ctx.accounts.transaction.set_rejected()?;
        }
        Ok(())
    }

    /// Instruction to cancel a transaction.
    /// Transactions must be in the "executeReady" status.
    /// Transaction will only be cancelled if the number of
    /// cancellations reaches the threshold. A cancelled
    /// transaction will no longer be able to be executed.
    pub fn cancel_transaction(ctx: Context<CancelTransaction>) -> Result<()> {
        // check if they haven't cancelled yet
        if ctx
            .accounts
            .transaction
            .has_cancelled(ctx.accounts.member.key())
            .is_none()
        {
            ctx.accounts.transaction.cancel(ctx.accounts.member.key())?
        }

        // if the current number of signers reaches threshold, mark the transaction as "cancelled"
        if ctx.accounts.transaction.cancelled.len() >= usize::from(ctx.accounts.multisig.threshold)
        {
            ctx.accounts.transaction.set_cancelled()?;
        }
        Ok(())
    }

    /// Instruction to execute a transaction.
    /// Transaction status must be "executeReady", and the account list must match
    /// the unique indexed accounts in the following manner: 
    /// [ix_1_account, ix_1_program_account, ix_1_remaining_account_1, ix_1_remaining_account_2, ...]
    /// 
    /// Refer to the README for more information on how to construct the account list.
    pub fn execute_transaction<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteTransaction<'info>>,
        account_list: Vec<u8>,
    ) -> Result<()> {
        // check that we are provided at least one instruction
        if ctx.accounts.transaction.instruction_index < 1 {
            // if no instructions were found, mark it as executed and move on
            ctx.accounts.transaction.set_executed()?;
            return Ok(());
        }

        match ctx.accounts.transaction.mode {
            ApprovalMode::ApprovalByPrimaryMember => {
                let primary_member = ctx.accounts.multisig.primary_member.ok_or(MsError::NoPrimaryMemberSpecified)?;
                if ctx.accounts.member.key() != primary_member {
                    return err!(MsError::UnauthorizedMember);
                }

                let time_lock = ctx.accounts.multisig.time_lock;
                let current_time = Clock::get()?.unix_timestamp;

                // Extract the approval time from the ExecuteReady status
                let approval_time = match ctx.accounts.transaction.status {
                    MsTransactionStatus::ExecuteReady { timestamp } => timestamp,
                    _ => return err!(MsError::InvalidTransactionState),
                };

                let elapsed_time = current_time.checked_sub(approval_time).ok_or(MsError::TimeError)?;

                // Check if the time lock condition is satisfied
                if elapsed_time < i64::from(time_lock) {
                    return err!(MsError::TimeLockNotSatisfied);
                }
            }
            ApprovalMode::ApprovalByMultisig => {
                // No additional checks needed here as they are already performed during transaction approval
            }
        }

        // use for derivation for the authority
        let ms_key = ctx.accounts.multisig.key();

        // default authority seeds to auth index > 0
        let authority_seeds = [
            b"squad",
            ms_key.as_ref(),
            &ctx.accounts.transaction.authority_index.to_le_bytes(),
            b"authority",
            &[ctx.accounts.transaction.authority_bump],
        ];
        // if auth index < 1
        let ms_authority_seeds = [
            b"squad",
            ctx.accounts.multisig.create_key.as_ref(),
            b"multisig",
            &[ctx.accounts.multisig.bump],
        ];

        // unroll account infos from account_list
        let mapped_remaining_accounts: Vec<AccountInfo> = account_list
            .iter()
            .map(|&i| {
                let index = usize::from(i);
                ctx.remaining_accounts[index].clone()
            })
            .collect();

        // iterator for remaining accounts
        let ix_iter = &mut mapped_remaining_accounts.iter();

        (1..=ctx.accounts.transaction.instruction_index).try_for_each(|i: u8| {
            // each ix block starts with the ms_ix account
            let ms_ix_account: &AccountInfo = next_account_info(ix_iter)?;

            // if the attached instruction doesn't belong to this program, throw error
            if ms_ix_account.owner != ctx.program_id {
                return err!(MsError::InvalidInstructionAccount);
            }

            // deserialize the msIx
            let mut ix_account_data: &[u8] = &ms_ix_account.try_borrow_mut_data()?;
            let ms_ix: MsInstruction = MsInstruction::try_deserialize(&mut ix_account_data)?;

            // get the instruction account pda - seeded from transaction account + the transaction accounts instruction index
            let (ix_pda, _) = Pubkey::find_program_address(
                &[
                    b"squad",
                    ctx.accounts.transaction.key().as_ref(),
                    &i.to_le_bytes(),
                    b"instruction",
                ],
                ctx.program_id,
            );
            // check the instruction account key maches the derived pda
            if &ix_pda != ms_ix_account.key {
                return err!(MsError::InvalidInstructionAccount);
            }
            // get the instructions program account
            let ix_program_info: &AccountInfo = next_account_info(ix_iter)?;
            // check that it matches the submitted account
            if &ms_ix.program_id != ix_program_info.key {
                return err!(MsError::InvalidInstructionAccount);
            }

            let ix_keys = ms_ix.keys.clone();
            // create the instruction to invoke from the saved ms ix account
            let ix: Instruction = Instruction::from(ms_ix);
            // the instruction account vec, with the program account first
            let mut ix_account_infos: Vec<AccountInfo> = vec![ix_program_info.clone()];

            // loop through the provided remaining accounts
            for account_index in 0..ix_keys.len() {
                let ix_account_info = next_account_info(ix_iter)?.clone();

                // check that the ix account keys match the submitted account keys
                if *ix_account_info.key != ix_keys[account_index].pubkey {
                    return err!(MsError::InvalidInstructionAccount);
                }

                ix_account_infos.push(ix_account_info.clone());
            }

            // execute the ix
            match ctx.accounts.transaction.authority_index {
                // if its a 0 authority, use the MS pda seeds
                0 => {
                    if &ix.program_id != ctx.program_id {
                        return err!(MsError::InvalidAuthorityIndex);
                    }
                    // Prevent recursive call on execute_transaction/instruction that could create issues
                    let execute_transaction = Vec::from_hex("e7ad315beb184413").unwrap();
                    let execute_instruction = Vec::from_hex("301228284b4a936e").unwrap();
                    if Some(execute_transaction.as_slice()) == ix.data.get(0..8) ||
                        Some(execute_instruction.as_slice()) == ix.data.get(0..8) {
                        return err!(MsError::InvalidAuthorityIndex);
                    }

                    invoke_signed(&ix, &ix_account_infos, &[&ms_authority_seeds])?;
                }
                // if its > 1 authority, use the derived authority seeds
                1.. => {
                    invoke_signed(&ix, &ix_account_infos, &[&authority_seeds])?;
                }
            };
            Ok(())
        })?;
        // set the executed index
        ctx.accounts.transaction.executed_index = ctx.accounts.transaction.instruction_index;
        // mark it as executed
        ctx.accounts.transaction.set_executed()?;
        // reload any multisig changes
        ctx.accounts.multisig.reload()?;
        Ok(())
    }

    /// Instruction to sequentially execute attached instructions.
    /// Instructions executed in this matter must be executed in order,
    /// this may be helpful for processing large batch transfers.
    /// This instruction can only be used for transactions with an authority
    /// index of 1 or greater.
    /// 
    /// NOTE - do not use this instruction if there is not total clarity around
    /// potential side effects, as this instruction implies that the approved
    /// transaction will be executed partially, and potentially spread out over
    /// a period of time. This could introduce problems with state and failed
    /// transactions. For example: a program invoked in one of these instructions
    /// may be upgraded between executions and potentially leave one of the 
    /// necessary accounts in an invalid state.
    pub fn execute_instruction<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteInstruction<'info>>,
    ) -> Result<()> {
        let ms_key = &ctx.accounts.multisig.key();
        let ms_ix = &mut ctx.accounts.instruction;
        let tx = &mut ctx.accounts.transaction;

        // To prevent potential failure with the Squad account auth 0 can't be executed in a specific instruction
        if tx.authority_index == 0 {
            return err!(MsError::InvalidAuthorityIndex);
        }

        // setup the authority seeds
        let authority_seeds = [
            b"squad",
            ms_key.as_ref(),
            &tx.authority_index.to_le_bytes(),
            b"authority",
            &[tx.authority_bump],
        ];

        // map the saved instruction account data to the instruction to be invoked
        let ix: Instruction = Instruction {
            accounts: ms_ix
                .keys
                .iter()
                .map(|k| AccountMeta {
                    pubkey: k.pubkey,
                    is_signer: k.is_signer,
                    is_writable: k.is_writable,
                })
                .collect(),
            data: ms_ix.data.clone(),
            program_id: ms_ix.program_id,
        };

        // collect the accounts needed from remaining accounts (order matters)
        let mut ix_account_infos: Vec<AccountInfo> = Vec::<AccountInfo>::new();
        let ix_account_iter = &mut ctx.remaining_accounts.iter();
        // the first account in the submitted list should be the program
        let ix_program_account = next_account_info(ix_account_iter)?;
        // check that the programs match
        if ix_program_account.key != &ix.program_id {
            return err!(MsError::InvalidInstructionAccount);
        }

        // loop through the provided remaining accounts - check they match the saved instruction accounts
        for account_index in 0..ms_ix.keys.len() {
            let ix_account_info = next_account_info(ix_account_iter)?;
            // check that the ix account keys match the submitted account keys
            if ix_account_info.key != &ms_ix.keys[account_index].pubkey {
                return err!(MsError::InvalidInstructionAccount);
            }
            ix_account_infos.push(ix_account_info.clone());
        }

        if tx.authority_index < 1 && &ix.program_id != ctx.program_id {
            return err!(MsError::InvalidAuthorityIndex);
        }

        invoke_signed(&ix, &ix_account_infos, &[&authority_seeds])?;

        // set the executed index to match
        tx.executed_index = ms_ix.instruction_index;
        // this is the last instruction - set the transaction as executed
        if ctx.accounts.instruction.instruction_index == ctx.accounts.transaction.instruction_index
        {
            ctx.accounts.transaction.set_executed()?;
        }
        Ok(())
    }

       /// The instruction to update the primary member of the multisig.
    pub fn update_primary_member(ctx: Context<MsAuth>, new_primary_member: Option<Pubkey>) -> Result<()> {
        // If a new primary member is provided, ensure it is in the member list
        if let Some(ref primary_member) = new_primary_member {
            if !ctx.accounts.multisig.keys.contains(primary_member) {
                return err!(MsError::PrimaryMemberNotInMultisig);
            }
        }
        
        // Update the primary member
        ctx.accounts.multisig.primary_member = new_primary_member;

        // Mark the change by updating the change index to deprecate any active transactions
        let new_index = ctx.accounts.multisig.transaction_index;
        // set the change index, which will deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)
    }

    pub fn remove_primary_member(ctx: Context<RemovePrimaryMember>) -> Result<()> {
        // Remove the primary member
        ctx.accounts.multisig.primary_member = None;

        // Mark the change by updating the change index to deprecate any active transactions
        let new_index = ctx.accounts.multisig.transaction_index;
        // set the change index, which will deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)
    }

    /// The instruction to update the time lock duration of the multisig.
    pub fn update_time_lock(ctx: Context<MsAuth>, new_time_lock: u32) -> Result<()> {
        // Ensure the new time lock is within the maximum allowable duration
        if new_time_lock > MAX_TIME_LOCK {
            return err!(MsError::TimeLockExceedsMaximum);
        }

        // Update the time lock duration
        ctx.accounts.multisig.time_lock = new_time_lock;

        // Mark the change by updating the change index to deprecate any active transactions
        let new_index = ctx.accounts.multisig.transaction_index;
        // set the change index, which will deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)
    }

    /// The instruction to add a new guardian to the multisig.
    pub fn add_guardian(ctx: Context<MsAuth>, new_guardian: Pubkey) -> Result<()> {
        // Check if the guardian already exists
        if ctx.accounts.multisig.is_guardian(new_guardian).is_some() {
            return err!(MsError::GuardianAlreadyExists);
        }

        // Check if the maximum number of guardians is reached
        if ctx.accounts.multisig.guardians.len() >= MAX_GUARDIANS {
            return err!(MsError::MaxGuardiansReached);
        }

        // Add the guardian
        ctx.accounts.multisig.add_guardian(new_guardian)?;
        // Mark the change by updating the change index to deprecate any active transactions
        let new_index = ctx.accounts.multisig.transaction_index;
        // set the change index, which will deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)
    }

    /// The instruction to remove a guardian from the multisig.
    pub fn remove_guardian(ctx: Context<MsAuth>, old_guardian: Pubkey) -> Result<()> {
        // Check if the guardian exists
        if ctx.accounts.multisig.is_guardian(old_guardian).is_none() {
            return err!(MsError::GuardianNotFound);
        }

        ctx.accounts.multisig.remove_guardian(old_guardian)?;
        // Mark the change by updating the change index to deprecate any active transactions
        let new_index = ctx.accounts.multisig.transaction_index;
        // set the change index, which will deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)
    }

    pub fn add_spending_limit(ctx: Context<CreateSpendingLimit>, mint: Pubkey, vault_index: u8, amount: u64, period: Period) -> Result<()> {
        msg!("add_spending_limit instruction called");
        msg!("Mint: {}", mint);
        msg!("Vault index: {}", vault_index);
        msg!("Amount: {}", amount);

        let spending_limit_key = ctx.accounts.spending_limit.key();
         msg!("Spending Limit Key: {}", spending_limit_key);

        let spending_limit = &mut ctx.accounts.spending_limit;
        

       

        // Initialize the spending limit account
        spending_limit.init(
            ctx.accounts.multisig.key(),
            vault_index,
            mint,
            amount,
            period,
        )?;

        let new_index = ctx.accounts.multisig.transaction_index;
        ctx.accounts.multisig.set_change_index(new_index)
    }

    /// Method to remove a spending limit
    pub fn remove_spending_limit(ctx: Context<RemoveSpendingLimit>, _mint: Pubkey, _vault_index: u8,) -> Result<()> {
        let new_index = ctx.accounts.multisig.transaction_index;
        ctx.accounts.multisig.set_change_index(new_index)
    }
     /*
   THIS METHOD IS NOT WORKING AND NEEDS TO BE REVISED
pub fn spending_limit_use(
    ctx: Context<SpendingLimitUse>,
    amount: u64,
    mint: Pubkey,
    decimals: u8,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        // Get a mutable reference to `ms` and extract spending limit
        let ms = &mut ctx.accounts.multisig;
        
        // Find and modify the spending limit
        let spending_limit = {
            let spending_limit = ms.spendings.iter_mut().find(|spending| spending.mint == mint)
                .ok_or(MsError::SpendingLimitNotFound)?;

            // Reset `spending_limit.remaining_amount` if the period has passed
            if let Some(reset_period) = spending_limit.period.to_seconds() {
                let passed_since_last_reset = now.checked_sub(spending_limit.last_reset).unwrap();
                if passed_since_last_reset > reset_period {
                    spending_limit.remaining_amount = spending_limit.amount;
                    let periods_passed = passed_since_last_reset.checked_div(reset_period).unwrap();
                    spending_limit.last_reset = spending_limit.last_reset.checked_add(periods_passed.checked_mul(reset_period).unwrap()).unwrap();
                }
            }

            // Update `spending_limit.remaining_amount`
            spending_limit.remaining_amount = spending_limit.remaining_amount.checked_sub(amount)
                .ok_or(MsError::SpendingLimitExceeded)?;

            // Return a copy of `spending_limit` to use after immutable borrow
            spending_limit.clone()
        }; // Drop mutable borrow here

        // Derive the PDA and bump for the vault
        let (vault_address, vault_bump) = Pubkey::find_program_address(
            &[
                b"squad",
                ms.key().as_ref(),
                &0_u8.to_le_bytes(), // Fixed index 0
                b"authority",
            ],
            ctx.program_id,
        );

        // Ensure the derived PDA matches the expected one
        require_keys_eq!(vault_address, *ctx.accounts.vault.key, MsError::InvalidInstructionAccount);

        // Transfer tokens
        if spending_limit.mint == Pubkey::default() {
            // Transfer SOL
            let system_program = ctx.accounts.system_program.as_ref().ok_or(MsError::MissingAccount)?;
            anchor_lang::system_program::transfer(CpiContext::new_with_signer(
                system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(), // PDA representing the vault
                    to: ctx.accounts.destination.to_account_info(),
                },
                &[&[
                    b"squad",
                    ms.key().as_ref(),
                    &0_u8.to_le_bytes(),
                    b"authority",
                    &[vault_bump],
                ]],
            ), amount)?;
        } else {
            // Transfer SPL token
            let token_program = ctx.accounts.token_program.as_ref().ok_or(MsError::MissingAccount)?;
            let vault_token_account = ctx.accounts.vault_token_account.as_ref().ok_or(MsError::MissingAccount)?;
            let destination_token_account = ctx.accounts.destination_token_account.as_ref().ok_or(MsError::MissingAccount)?;
            let mint = ctx.accounts.mint.as_ref().ok_or(MsError::MissingAccount)?;

            let cpi_accounts = Transfer {
                from: vault_token_account.to_account_info(), // PDA representing the SPL token vault
                to: destination_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, &[&[
                    b"squad",
                    ms.key().as_ref(),
                    &0_u8.to_le_bytes(),
                    b"authority",
                    &[vault_bump],
                ]]),
                amount,
            )?;
        }

        Ok(())
    }
    */

}
