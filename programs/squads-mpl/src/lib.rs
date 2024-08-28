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

    /// Creates a new multisig account
    // instruction to create a multisig
    pub fn create(
        ctx: Context<Create>,
        threshold: u16,       // threshold of members required to sign
        create_key: Pubkey,   // the public key used to seed the original multisig creation
        members: Vec<Member>, // a list of members (Public Keys) to use for the multisig
        _meta: String,        // a string of metadata that can be used to describe the multisig on-chain as a memo ie. '{"name":"My Multisig","description":"This is a my multisig"}'
        time_lock: u32,       // time lock duration before a transaction can be approved
    ) -> Result<()> {
        // sort the members and remove duplicates
        let mut members = members;
        members.sort_by_key(|m| m.key);

        // Mutable reference to the multisig account
        let multisig = &mut ctx.accounts.multisig;

        // Initialize the multisig account
        multisig.init(
            threshold,
            create_key,
            members,
            ctx.bumps.multisig,
            time_lock,
        )?;

        // Check the invariants after initialization
        multisig.check_invariants()?;

        Ok(())
    }

    /// The instruction to add a new member to the multisig.
    /// Adds member/key to the multisig and reallocates space if neccessary
    /// If the multisig needs to be reallocated, it must be prefunded with
    /// enough lamports to cover the new size.
    pub fn add_member(ctx: Context<MsAuthRealloc>, new_member: Member) -> Result<()> {

        // check if realloc is needed
        let multisig_account_info = ctx.accounts.multisig.to_account_info();
        if *multisig_account_info.owner != squads_mpl::ID {
            return err!(MsError::InvalidInstructionAccount);
        }
        let curr_data_size = multisig_account_info.data.borrow().len();
        let spots_left =
            ((curr_data_size - Ms::SIZE_WITHOUT_MEMBERS) /  Member::INIT_SPACE) - ctx.accounts.multisig.keys.len();

        // if not enough, add (10 * Member::INIT_SPACE) to size - bump it up by 10 accounts
        if spots_left < 1 {
            // add space for 10 more keys
            let needed_len = curr_data_size + (10 * Member::INIT_SPACE);
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
        ctx.accounts.multisig.set_change_index(new_index)?;

        // Check the invariants after adding a member
        ctx.accounts.multisig.check_invariants()?;

        Ok(())
    }

    /// The instruction to remove a member from the multisig
    pub fn remove_member(ctx: Context<MsAuth>, old_member: Pubkey) -> Result<()> {
        // if there is only one key in this multisig, reject the removal
        if ctx.accounts.multisig.keys.len() <= 1 {
            return err!(MsError::CannotRemoveSoloMember);
        }
        ctx.accounts.multisig.remove_member(old_member)?;
        
        let new_index = ctx.accounts.multisig.transaction_index;
        // update the change index to deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)?;

        // Check the invariants after removing a member
        ctx.accounts.multisig.check_invariants()?;

        Ok(())
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
        ctx.accounts.multisig.set_change_index(new_index)?;

        // Check the invariants after changing the threshold
        ctx.accounts.multisig.check_invariants()?;

        Ok(())
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
    pub fn create_transaction(ctx: Context<CreateTransaction>, authority_index: u32) -> Result<()> {
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
            ctx.bumps.transaction,
            authority_index,
            authority_bump,
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
            ctx.bumps.instruction,
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

        // verifying if the time lock duration has been satisfied
        match ctx.accounts.transaction.status {
            MsTransactionStatus::Active { timestamp } => {
                require!(Clock::get()?.unix_timestamp - timestamp >= i64::from(ctx.accounts.multisig.time_lock), MsError::TimeLockNotSatisfied);
            }
            _ => return err!(MsError::InvalidTransactionState),
        };

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

    /// The instruction to update the multisig settings.
    pub fn update_multisig_settings(
        ctx: Context<MsAuth>,
        new_time_lock: u32,
        spending_limit_enabled: bool,
        guardian: Option<Pubkey>,
    ) -> Result<()> {
        let multisig = &mut ctx.accounts.multisig;
        
        // Update the time lock duration
        multisig.time_lock = new_time_lock;

        // Update the spending limit enabled flag
        multisig.spending_limit_enabled = spending_limit_enabled;

        // Update the guardian if provided
        if let Some(new_guardian) = guardian {
            multisig.guardian = Some(new_guardian);
        } else {
            multisig.guardian = None;
        }

        // Mark the change by updating the change index to deprecate any active transactions
        let new_index = multisig.transaction_index;
        multisig.set_change_index(new_index)?;

        // Check the invariants after updating multisig settings
        multisig.check_invariants()?;

        Ok(())
    }

    pub fn remove_primary_member(ctx: Context<RemovePrimaryMember>, old_member: Pubkey) -> Result<()> {
        let old_member_index = ctx.accounts.multisig.is_member(old_member)
            .ok_or(MsError::MemberNotFound)?;

        // Ensure the guardian has permission to remove this member
        if !ctx.accounts.multisig.keys[old_member_index].guardian_can_remove {
            return err!(MsError::UnauthorizedMember);
        }

        // if there is only one key in this multisig, reject the removal
        if ctx.accounts.multisig.keys.len() <= 1 {
            return err!(MsError::CannotRemoveSoloMember);
        }
        ctx.accounts.multisig.remove_member(old_member)?;
        
        let new_index = ctx.accounts.multisig.transaction_index;
        // update the change index to deprecate any active transactions
        ctx.accounts.multisig.set_change_index(new_index)?;

        // Check the invariants after removing a member
        ctx.accounts.multisig.check_invariants()?;

        Ok(())
    }

    pub fn add_spending_limit(ctx: Context<CreateSpendingLimit>, create_key: Pubkey, mint: Pubkey, authority_index: u32, amount: u64, member: Pubkey, period: Period) -> Result<()> {
        // Ensure amount is strictly positive
        if amount == 0 {
            return err!(MsError::InvalidAmount);
        }
        
        let spending_limit = &mut ctx.accounts.spending_limit;        
        
        // Initialize the spending limit account
        spending_limit.init(
            ctx.accounts.multisig.key(),
            create_key,
            mint,
            authority_index,
            amount,
            member,
            period,
            ctx.bumps.spending_limit,
        )?;

        let new_index = ctx.accounts.multisig.transaction_index;
        ctx.accounts.multisig.set_change_index(new_index)
    }

    /// Method to remove a spending limit
    pub fn remove_spending_limit(ctx: Context<RemoveSpendingLimit>, ) -> Result<()> {
        let new_index = ctx.accounts.multisig.transaction_index;
        ctx.accounts.multisig.set_change_index(new_index)
    }

    pub fn pause_spending_limit(ctx: Context<PauseSpendingLimit>) -> Result<()> {
        // Disable spending limit
        ctx.accounts.multisig.spending_limit_enabled = false;

        // Mark the change by updating the change index to deprecate any active transactions
        let new_index = ctx.accounts.multisig.transaction_index;
        ctx.accounts.multisig.set_change_index(new_index)
    }
    
    
    pub fn spending_limit_use(ctx: Context<SpendingLimitUse>, amount: u64, decimals: u8,) -> Result<()> {
        // Ensure spending limit is enabled
        if !ctx.accounts.multisig.spending_limit_enabled {
            return err!(MsError::SpendingLimitDisabled);
        }

        let now = Clock::get()?.unix_timestamp;

        // Get a mutable reference to `spending_limit` account.
        let spending_limit = &mut ctx.accounts.spending_limit;

        // Calculate the reset period in seconds.
        let reset_period = spending_limit.period.to_seconds().unwrap();

        // Calculate the timestamp difference between now and last reset.
        let time_since_last_reset = now.checked_sub(spending_limit.last_reset).unwrap();


        let multisig_key = ctx.accounts.multisig.key();
        let destination = ctx.accounts.destination.as_ref();
        let vault_bump = ctx.bumps.vault;

        // Check if the reset period has passed.
        if time_since_last_reset > reset_period {
            // Reset remaining amount and update the last reset timestamp.
            spending_limit.remaining_amount = spending_limit.amount;
            let periods_passed = time_since_last_reset.checked_div(reset_period).unwrap();
            spending_limit.last_reset = spending_limit
                .last_reset
                .checked_add(periods_passed.checked_mul(reset_period).unwrap())
                .unwrap();
        }

        // Subtract the amount from the remaining limit, ensuring it does not exceed.
        spending_limit.remaining_amount = spending_limit
            .remaining_amount
            .checked_sub(amount)
            .ok_or(MsError::SpendingLimitExceeded)?;

        // Determine transfer type based on mint
        if spending_limit.mint == Pubkey::default() {

            // Check if decimals match 9 for SOL
            require!(decimals == 9, MsError::InvalidDecimals);

            // Ensure system program is provided for SOL transfer
            let system_program = ctx.accounts.system_program.as_ref().ok_or(MsError::MissingAccount)?;

            anchor_lang::system_program::transfer(CpiContext::new_with_signer(
                system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(), // Vault associated with the authority seeds
                    to: destination.clone(),
                },
                &[&[
                    b"squad",
                    multisig_key.as_ref(),
                    &ctx.accounts.spending_limit.authority_index.to_le_bytes(),
                    b"authority",
                    &[vault_bump],
                ]],
            ), amount)?;
        } else {

            // Transfer SPL tokens from the vault to the destination account.
            // Ensure destination token account is provided for SPL transfer
            let destination_token_account = ctx.accounts.destination_token_account.as_ref().ok_or(MsError::MissingAccount)?;

            // Ensure vault token account is provided for SPL transfer
            let vault_token_account = ctx.accounts.vault_token_account.as_ref().ok_or(MsError::MissingAccount)?;
            // Ensure mint is provided for SPL transfer
            let mint = ctx.accounts.mint.as_ref().ok_or(MsError::MissingAccount)?;
            // Ensure token program is provided for SPL transfer
            let token_program = ctx.accounts.token_program.as_ref().ok_or(MsError::MissingAccount)?;

            // Add logging for SPL token transfer
            msg!(
                "token_program {} mint {} vault {} destination {} amount {} decimals {}",
                token_program.key,
                mint.key(),
                &ctx.accounts.vault.key,
                destination.key(),
                amount,
                decimals
            );

            let cpi_accounts = anchor_spl::token::TransferChecked {
                from: vault_token_account.to_account_info(), // PDA representing the SPL token vault
                to: destination_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
                mint: mint.to_account_info(),
            };

            let seeds = &[
                b"squad",
                multisig_key.as_ref(),
                &ctx.accounts.spending_limit.authority_index.to_le_bytes(),
                b"authority",
                &[vault_bump],
            ];

            let signer_seeds = &[&seeds[..]];

            anchor_spl::token::transfer_checked(
                CpiContext::new_with_signer(
                    token_program.to_account_info(),
                    cpi_accounts,
                    signer_seeds,
                ),
                amount,
                decimals,
            )?;
        }

        Ok(())
    }

}