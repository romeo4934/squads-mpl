/*
    Squads Multisig Program - State accounts
    https://github.com/squads-protocol/squads-mpl
*/


use anchor_lang::{prelude::*, solana_program::instruction::Instruction};
use anchor_lang::solana_program::borsh0_10::get_instance_packed_len;
use crate::errors::*;

pub const MAX_TIME_LOCK: u32 = 3 * 30 * 24 * 60 * 60; // 3 months

/// Ms is the basic state account for a multisig.
#[account]
pub struct Ms {
    pub threshold: u16,                 // threshold for signatures to execute.

    pub authority_index: u16,           // luxury field to help track how many authorities are currently used.

    pub transaction_index: u32,         // look up and seed reference for transactions.

    pub ms_change_index: u32,           // the last executed/closed transaction
                                        // this is needed to deprecate any active transactions
                                        // if the multisig is changed, helps prevent gaming.
                                        // this will automatically be increased when the multisig
                                        // is changed, ie. change of members or threshold.

    pub bump: u8,                       // bump for the multisig seed.

    pub create_key: Pubkey,             // random key(or not) used to seed the multisig pda.

    pub keys: Vec<Member>,              // keys of the members/owners of the multisig.
    pub time_lock: u32,                 // time lock duration in seconds before a transaction can be executed
    pub spending_limit_enabled: bool,   // Spending limit enabled
    pub guardian: Option<Pubkey>,       // Guardian authority can disable spending limit and remove some members without a multisig vote 
}

impl Ms {
    pub const SIZE_WITHOUT_MEMBERS: usize = 8 + // Anchor disriminator
    2 +         // threshold value
    2 +         // authority index
    4 +         // transaction index
    4 +         // processed internal transaction index
    1 +         // PDA bump
    32 +        // creator
    4 +          // for vec length
    4 +         // time lock
    1 +         // spending limit enabled
    33;         // guardian authority (one byte for option + 32 for Pubkey)


    /// Initializes the new multisig account
    pub fn init (&mut self, threshold: u16, create_key: Pubkey, members: Vec<Member>, bump: u8, time_lock: u32) -> Result<()> {
        self.threshold = threshold;
        self.keys = members;
        self.authority_index = 1;   // default vault is the first authority
        self.transaction_index = 0;
        self.ms_change_index= 0;
        self.bump = bump;
        self.create_key = create_key;
        self.time_lock = time_lock; // Initialize with the time_lock
        self.spending_limit_enabled = true;
        self.guardian = None;
        Ok(())
    }

        /// Checks the invariants of the multisig state.
    /// Returns an error if any invariant is violated.
    pub fn check_invariants(&self) -> Result<()> {
        // Check that the number of members is within the valid range
        if self.keys.len() <= 1 {
            return err!(MsError::CannotRemoveSoloMember);
        }

        if self.keys.len() > usize::from(u16::MAX) {
            return err!(MsError::MaxMembersReached);
        }

        // Ensure the threshold is within the valid range
        if usize::from(self.threshold) < 1 || usize::from(self.threshold) > self.keys.len() {
            return err!(MsError::InvalidThreshold);
        }

        // Ensure the time lock duration is within the maximum allowable duration
        if self.time_lock > MAX_TIME_LOCK {
            return err!(MsError::TimeLockExceedsMaximum);
        }

        // Ensure there are no duplicate members
        let mut keys = self.keys.iter().map(|m| m.key).collect::<Vec<_>>();
        keys.sort();
        if keys.windows(2).any(|w| w[0] == w[1]) {
            return err!(MsError::DuplicateMembers);
        }

        // Ensure ms_change_index is less than or equal to transaction_index
        if self.ms_change_index > self.transaction_index {
            return err!(MsError::ChangeIndexExceedsTransactionIndex);
        }

        // Additional custom invariants can be added here if needed

        Ok(())
    }

    /// Checks to see if the key is a member of the multisig
    pub fn is_member(&self, member_key: Pubkey) -> Option<usize> {
        self.keys.binary_search_by_key(&member_key, |m| m.key).ok()
    }

    /// Updates the change index, deprecating any active/draft transactions
    /// that have an index lower than the change index
    pub fn set_change_index(&mut self, index: u32) -> Result<()>{
        self.ms_change_index = index;
        Ok(())
    }

    /// bumps up the authority tracking index for the multisig.
    /// This has no effect on the multisig functionality, but is used
    /// to track authorities for clients to use (ie, vault 1, vault 2, program authority 3, etc).
    pub fn add_authority(&mut self) -> Result<()>{
        self.authority_index = self.authority_index.checked_add(1).unwrap();
        Ok(())
    }

    /// Adds a member to the multisig. Is a no-op if the member is already in the multisig.
    pub fn add_member(&mut self, member: Member) -> Result<()>{
        self.keys.push(member);
        self.keys.sort_by_key(|m| m.key);
        Ok(())
    }

    /// Removes a member from the multisig. Is a no-op if the member is not in the multisig.
    pub fn remove_member(&mut self, member_pubkey: Pubkey) -> Result<()>{
        let old_member_index = match self.is_member(member_pubkey) {
            Some(old_member_index) => old_member_index,
            None => return err!(MsError::MemberNotFound),
        };
        self.keys.remove(old_member_index);
        
        Ok(())
    }

    /// sets the threshold for the multisig.
    pub fn change_threshold(&mut self, threshold: u16) -> Result<()>{
        self.threshold = threshold;
        Ok(())
    }

}

#[derive(AnchorDeserialize, AnchorSerialize, InitSpace, Eq, PartialEq, Clone)]
pub struct Member {
    pub key: Pubkey,
    pub guardian_can_remove: bool,
}

/// MsTransactionStatus enum of the current status of the Multisig Transaction.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MsTransactionStatus {
    Draft { timestamp: i64 },          // Transaction default state
    Active { timestamp: i64 },         // Transaction is live and ready
    ExecuteReady { timestamp: i64 },   // Transaction has been approved and is pending execution
    Executed { timestamp: i64 },       // Transaction has been executed
    Rejected { timestamp: i64 },       // Transaction has been rejected
    Cancelled { timestamp: i64 },      // Transaction has been cancelled
}

/// The MsTransaction is the state account for a multisig transaction
#[account]
pub struct MsTransaction {
    pub creator: Pubkey,                // creator, used to seed pda
    pub ms: Pubkey,                     // the multisig this belongs to
    pub transaction_index: u32,         // used for seed
    pub authority_index: u32,           // index to use for the cpi signing PDA (authority)
    pub authority_bump: u8,             // the bump corresponding to the PDA (authority)
    pub status: MsTransactionStatus,    // the status of the transaction
    pub instruction_index: u8,          // index of this instruction
    pub bump: u8,                       // bump for the seed
    pub approved: Vec<Pubkey>,          // keys that have approved/signed
    pub rejected: Vec<Pubkey>,          // keys that have rejected
    pub cancelled: Vec<Pubkey>,         // keys that have cancelled (ExecuteReady only)
    pub executed_index: u8              // if Tx is executed sequentially, tracks which ix
                                        // has been executed so far.
}

impl MsTransaction {
    // the minimum size without the approved/rejected vecs
    pub const MINIMUM_SIZE: usize = 32 +    // the creator pubkey
        32 +                                // the multisig key
        4 +                                 // the transaction index
        4 +                                 // the authority index (for this proposal)
        1 +                                 // the authority bump
        (8 * 6) +                           // the timestamp for each status variant
        1 +                                 // the number of instructions (attached)
        1 +                                 // space for tx bump
        1;                                  // track index if executed sequentially

    pub fn initial_size_with_members(members_len: usize) -> usize {
        MsTransaction::MINIMUM_SIZE + (3 * (4 + (members_len * 32) ) )
    }

    /// initializes the transaction account
    pub fn init(&mut self, creator: Pubkey, multisig: Pubkey, transaction_index: u32, bump: u8, authority_index: u32, authority_bump: u8) -> Result<()>{
        self.creator = creator;
        self.ms = multisig;
        self.transaction_index = transaction_index;
        self.authority_index = authority_index;
        self.authority_bump = authority_bump;
        self.status = MsTransactionStatus::Draft { timestamp: Clock::get()?.unix_timestamp };
        self.instruction_index = 0;
        self.approved = Vec::new();
        self.rejected = Vec::new();
        self.cancelled = Vec::new();
        self.bump = bump;
        self.executed_index = 0;
        Ok(())
    }

    /// change status to Active
    pub fn activate(&mut self)-> Result<()>{
        self.status = MsTransactionStatus::Active { timestamp: Clock::get()?.unix_timestamp };
        Ok(())
    }

    /// change status to ExecuteReady
    pub fn ready_to_execute(&mut self)-> Result<()>{
        self.status = MsTransactionStatus::ExecuteReady { timestamp: Clock::get()?.unix_timestamp };
        Ok(())
    }

    /// set status to Rejected
    pub fn set_rejected(&mut self) -> Result<()>{
        self.status = MsTransactionStatus::Rejected { timestamp: Clock::get()?.unix_timestamp };
        Ok(())
    }

    /// set status to Cancelled
    pub fn set_cancelled(&mut self) -> Result<()>{
        self.status = MsTransactionStatus::Cancelled { timestamp: Clock::get()?.unix_timestamp };
        Ok(())
    }

    /// set status to executed
    pub fn set_executed(&mut self) -> Result<()>{
        self.status = MsTransactionStatus::Executed { timestamp: Clock::get()?.unix_timestamp };
        Ok(())
    }

    /// sign to approve a transaction
    pub fn sign(&mut self, member: Pubkey) -> Result<()>{
        self.approved.push(member);
        self.approved.sort();
        Ok(())
    }

    /// sign to reject the transaction
    pub fn reject(&mut self, member: Pubkey) -> Result<()> {
        self.rejected.push(member);
        self.rejected.sort();
        Ok(())
    }

    /// sign to cancel the transaction if execute_ready
    pub fn cancel(&mut self, member: Pubkey) -> Result<()> {
        self.cancelled.push(member);
        self.cancelled.sort();
        Ok(())
    }


    /// check if a user has voted already
    pub fn has_voted(&self, member: Pubkey) -> bool {
        let approved = self.approved.binary_search(&member).is_ok();
        let rejected = self.rejected.binary_search(&member).is_ok();
        approved || rejected
    }

    /// check if a user has signed to approve
    pub fn has_voted_approve(&self, member: Pubkey) -> Option<usize> {
        self.approved.binary_search(&member).ok()
    }

    /// check if a use has signed to reject
    pub fn has_voted_reject(&self, member: Pubkey) -> Option<usize> {
        self.rejected.binary_search(&member).ok()
    }

    /// check if a user has signed to cancel
    pub fn has_cancelled(&self, member: Pubkey) -> Option<usize> {
        self.cancelled.binary_search(&member).ok()
    }

    /// removes the key from the rejected vec based on index.
    /// used when changing from rejected to approved
    pub fn remove_reject(&mut self, index: usize) -> Result<()>{
        self.rejected.remove(index);
        Ok(())
    }

    /// removes the key from the approved vec based on index
    /// used when changing from approved to rejected
    pub fn remove_approve(&mut self, index: usize) -> Result<()>{
        self.approved.remove(index);
        Ok(())
    }

}

/// The state account for an instruction that is attached to a transaction.
/// Almost analagous to the native Instruction struct for solana, but with an extra
/// field for the bump.
#[account]
pub struct MsInstruction {
    pub program_id: Pubkey,
    pub keys: Vec<MsAccountMeta>,
    pub data: Vec<u8>,
    pub instruction_index: u8,
    pub bump: u8,
}

impl MsInstruction {
    
    /// Initializes the instruction account
    pub fn init(&mut self, instruction_index: u8, incoming_instruction: IncomingInstruction, bump: u8) -> Result<()> {
        self.bump = bump;
        self.instruction_index = instruction_index;
        self.program_id = incoming_instruction.program_id;
        self.keys = incoming_instruction.keys;
        self.data = incoming_instruction.data;
        Ok(())
    }
}

impl From<MsInstruction> for Instruction {
    /// Converts the MsInstruction to a native Instruction
    fn from(instruction: MsInstruction) -> Self {
        Instruction {
            program_id: instruction.program_id,
            accounts: instruction
                .keys
                .iter()
                .map(|account| AccountMeta {
                    pubkey: account.pubkey,
                    is_signer: account.is_signer,
                    is_writable: account.is_writable,
                })
                .collect(),
            data: instruction.data.clone(),
        }
    }
}

/// Wrapper for our internal MsInstruction key serialization schema
/// MsAccount meta is identical to the AccountMeta struct, but defined
/// here for serialization purposes.
#[derive(AnchorSerialize,AnchorDeserialize, Copy, Clone)]
pub struct MsAccountMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool
}

/// Incoming instruction schema, used as an argument in the attach_instruction.
/// Identical to the solana struct for Instruction, but uses the MsAccountMeta.
/// Provided for de/serialization purposes.
#[derive(AnchorSerialize,AnchorDeserialize, Clone)]
pub struct IncomingInstruction {
    pub program_id: Pubkey,
    pub keys: Vec<MsAccountMeta>,
    pub data: Vec<u8>
}

impl IncomingInstruction {
    /// Calculates how much space will be needed to allocate to the instruction
    /// to be attached to the transaction.
    pub fn get_max_size(&self) -> usize {
        // add three the size to correlate with the saved instruction account
        // there are 3 extra bytes in a saved instruction account: index, bump, executed
        // this is used to determine how much space the incoming instruction
        // will used when saved
        get_instance_packed_len(&self).unwrap_or_default().checked_add(2).unwrap_or_default()
    }
}

/// Spending Limit struct
#[account]
pub struct SpendingLimit {
    
    /// create key used to seed the spending limit pda
    pub create_key: Pubkey,

    /// The multisig this belongs to.
    pub multisig: Pubkey,

    /// The index of the vault that the spending limit is for.
    pub authority_index: u32,

    /// The token mint the spending limit is for.
    /// Pubkey::default() means SOL.
    /// use NATIVE_MINT for Wrapped SOL.
    pub mint: Pubkey,

    /// The amount of tokens that can be spent in a period.
    /// This amount is in decimals of the mint,
    /// so 1 SOL would be `1_000_000_000` and 1 USDC would be `1_000_000`.
    pub amount: u64,

    // The member that can use the spending limit
    pub member: Pubkey,

    /// The reset period of the spending limit.
    /// When it passes, the remaining amount is reset, unless it's `Period::OneTime`.
    pub period: Period,

    /// The remaining amount of tokens that can be spent in the current period.
    /// When reaches 0, the spending limit cannot be used anymore until the period reset.
    pub remaining_amount: u64,

    /// Unix timestamp marking the last time the spending limit was reset (or created).
    pub last_reset: i64,

    /// PDA bump.
    pub bump: u8,
}

impl SpendingLimit {
    pub const LEN: usize = 8 + 32 + 32 + 4 + 32 + 8 + 32 + 1 + 8 + 8 + 1;

    pub fn init(
        &mut self,
        multisig: Pubkey,
        create_key: Pubkey,
        mint: Pubkey,
        authority_index: u32,
        amount: u64,
        member: Pubkey,
        period: Period,
        bump: u8,
    ) -> Result<()> {
        self.multisig = multisig;
        self.create_key = create_key;
        self.mint = mint;
        self.authority_index = authority_index;
        self.amount = amount;
        self.member = member;
        self.period = period;
        self.remaining_amount = amount;
        self.last_reset = Clock::get()?.unix_timestamp;
        self.bump = bump;
        Ok(())
    }

}


/// Period enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Period {
    Daily,
    Weekly,
    Monthly,
}

impl Period {
    pub fn to_seconds(&self) -> Option<i64> {
        match self {
            Period::Daily => Some(24 * 60 * 60),     // 1 day in seconds
            Period::Weekly => Some(7 * 24 * 60 * 60), // 1 week in seconds
            Period::Monthly => Some(30 * 24 * 60 * 60), // 1 month (assuming 30 days) in seconds
        }
    }
}
