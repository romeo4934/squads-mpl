use std::convert::TryInto;

use anchor_lang::{prelude::*, solana_program::instruction::Instruction};
use anchor_lang::solana_program::borsh::get_instance_packed_len;

#[account]
pub struct Ms {
    pub threshold: u16,                 // threshold for signatures
    pub authority_index: u16,           // index to seed other authorities under this multisig
    pub transaction_index: u32,         // look up and seed reference for transactions
    pub ms_change_index: u32,           // the last executed/closed transaction
    pub bump: u8,                       // bump for the multisig seed
    pub create_key: Pubkey,             // random key(or not) used to seed the multisig pda
    pub allow_external_execute: bool,   // allow non-member keys to execute txs
    pub keys: Vec<Pubkey>,              // keys of the members
}

impl Ms {
    pub const SIZE_WITHOUT_MEMBERS: usize = 8 + // Anchor disriminator
    2 +         // threshold value
    2 +         // authority index
    4 +         // transaction index
    4 +         // processed internal transaction index
    1 +         // PDA bump
    32 +        // creator
    1 +         // allow external execute
    4;          // for vec length

    pub fn init (&mut self, threshold: u16, create_key: Pubkey, members: Vec<Pubkey>, bump: u8) -> Result<()> {
        self.threshold = threshold;
        self.keys = members;
        self.authority_index = 1;   // default vault is the first authority
        self.transaction_index = 0;
        self.ms_change_index= 0;
        self.bump = bump;
        self.create_key = create_key;
        self.allow_external_execute = false;
        Ok(())
    }

    pub fn is_member(&self, member: Pubkey) -> Option<usize> {
        match self.keys.binary_search(&member) {
            Ok(ind)=> Some(ind),
            _ => None
        }
    }

    pub fn set_change_index(&mut self, index: u32) -> Result<()>{
        self.ms_change_index = index;
        Ok(())
    }

    // bumps up the authority tracking index for easy use
    pub fn add_authority(&mut self) -> Result<()>{
        self.authority_index = self.authority_index.checked_add(1).unwrap();
        Ok(())
    }

    pub fn add_member(&mut self, member: Pubkey) -> Result<()>{
        if matches!(self.is_member(member), None) {
            self.keys.push(member);
            self.keys.sort();
        }
        Ok(())
    }

    pub fn remove_member(&mut self, member: Pubkey) -> Result<()>{
        if let Some(ind) = self.is_member(member) {
            self.keys.remove(ind);
            if self.keys.len() < usize::from(self.threshold) {
                self.threshold = self.keys.len().try_into().unwrap();
            }
        }
        Ok(())
    }

    pub fn change_threshold(&mut self, threshold: u16) -> Result<()>{
        self.threshold = threshold;
        Ok(())
    }

}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum MsTransactionStatus {
    Draft,          // Transaction default state
    Active,         // Transaction is live and ready
    ExecuteReady,   // Transaction has been approved and is pending execution
    Executed,       // Transaction has been executed
    Rejected,       // Transaction has been rejected
    Cancelled,      // Transaction has been cancelled
}

#[account]
pub struct MsTransaction {
    pub creator: Pubkey,                // creator, used to seed pda
    pub ms: Pubkey,                     // the multisig this belongs to
    pub transaction_index: u32,         // used for seed
    pub authority_index: u32,           // index to use for other pdas (?)
    pub authority_bump: u8,             // the bump corresponding to the bespoke authority
    pub status: MsTransactionStatus,    // the status of the transaction
    pub instruction_index: u8,          // index of this instruction
    pub bump: u8,                       // bump for the seed
    pub approved: Vec<Pubkey>,          // keys that have approved/signed
    pub rejected: Vec<Pubkey>,          // keys that have rejected
    pub cancelled: Vec<Pubkey>,         // keys that have cancelled (ExecuteReady only)
    pub executed_index: u8              // if Tx is executed sequentially, track latest
}

impl MsTransaction {
    // the minimum size without the approved/rejected vecs
    pub const MINIMUM_SIZE: usize = 32 +    // the creator pubkey
        32 +                                // the multisig key
        4 +                                 // the transaction index
        4 +                                 // the authority index (for this proposal)
        1 +                                 // the authority bump
        (1 + 12) +                          // the enum size
        1 +                                 // the number of instructions (attached)
        1 +                                 // space for tx bump
        1;                                  // track index if executed sequentially

    pub fn initial_size_with_members(members_len: usize) -> usize {
        MsTransaction::MINIMUM_SIZE + (3 * (4 + (members_len * 32) ) )
    }

    pub fn init(&mut self, creator: Pubkey, multisig: Pubkey, transaction_index: u32, bump: u8, authority_index: u32, authority_bump: u8) -> Result<()>{
        self.creator = creator;
        self.ms = multisig;
        self.transaction_index = transaction_index;
        self.authority_index = authority_index;
        self.authority_bump = authority_bump;
        self.status = MsTransactionStatus::Draft;
        self.instruction_index = 0;
        self.approved = Vec::new();
        self.rejected = Vec::new();
        self.cancelled = Vec::new();
        self.bump = bump;
        self.executed_index = 0;
        Ok(())
    }

    // change status to Active
    pub fn activate(&mut self)-> Result<()>{
        self.status = MsTransactionStatus::Active;
        Ok(())
    }

    // change status to ExecuteReady
    pub fn ready_to_execute(&mut self)-> Result<()>{
        self.status = MsTransactionStatus::ExecuteReady;
        Ok(())
    }

    // set status to Rejected
    pub fn set_rejected(&mut self) -> Result<()>{
        self.status = MsTransactionStatus::Rejected;
        Ok(())
    }

    pub fn set_cancelled(&mut self) -> Result<()>{
        self.status = MsTransactionStatus::Cancelled;
        Ok(())
    }

    // set status to executed
    pub fn set_executed(&mut self) -> Result<()>{
        self.status = MsTransactionStatus::Executed;
        Ok(())
    }

    // sign to approve a transaction
    pub fn sign(&mut self, member: Pubkey) -> Result<()>{
        self.approved.push(member);
        self.approved.sort();
        Ok(())
    }

    // sign to reject the transaction
    pub fn reject(&mut self, member: Pubkey) -> Result<()> {
        self.rejected.push(member);
        self.rejected.sort();
        Ok(())
    }

    // sign to cancel the transaction if execute_ready
    pub fn cancel(&mut self, member: Pubkey) -> Result<()> {
        self.cancelled.push(member);
        self.cancelled.sort();
        Ok(())
    }


    // check if a user has voted already
    pub fn has_voted(&self, member: Pubkey) -> bool {
        let approved = self.approved.binary_search(&member).is_ok();
        let rejected = self.rejected.binary_search(&member).is_ok();
        approved || rejected
    }

    // check if a user has signed to approve
    pub fn has_voted_approve(&self, member: Pubkey) -> Option<usize> {
        self.approved.binary_search(&member).ok()
    }

    // check if a use has signed to reject
    pub fn has_voted_reject(&self, member: Pubkey) -> Option<usize> {
        self.rejected.binary_search(&member).ok()
    }

    // check if a user has signed to cancel
    pub fn has_cancelled(&self, member: Pubkey) -> Option<usize> {
        self.cancelled.binary_search(&member).ok()
    }

    pub fn remove_reject(&mut self, index: usize) -> Result<()>{
        self.rejected.remove(index);
        Ok(())
    }

    pub fn remove_approve(&mut self, index: usize) -> Result<()>{
        self.approved.remove(index);
        Ok(())
    }

}

// the internal instruction schema, similar to Instruction but with extra metadata
#[account]
#[derive(Debug)]
pub struct MsInstruction {
    pub program_id: Pubkey,
    pub keys: Vec<MsAccountMeta>,
    pub data: Vec<u8>,
    pub instruction_index: u8,
    pub bump: u8,
    pub executed: bool,
}

// map the incoming instruction to internal instruction schema
impl MsInstruction {
    pub const MAXIMUM_SIZE: usize = 1280;

    pub fn init(&mut self, instruction_index: u8, incoming_instruction: IncomingInstruction, bump: u8) -> Result<()> {
        self.bump = bump;
        self.instruction_index = instruction_index;
        self.program_id = incoming_instruction.program_id;
        self.keys = incoming_instruction.keys;
        self.data = incoming_instruction.data;
        self.executed = false;
        Ok(())
    }

    pub fn set_executed(&mut self) -> Result<()> {
        self.executed = true;
        Ok(())
    }
}

impl IncomingInstruction {
    pub fn get_max_size(&self) -> usize {
        // add three the size to correlate with the saved instruction account
        // there are 3 extra bytes in a saved instruction account: index, bump, executed
        // this is used to determine how much space the incoming instruction
        // will used when saved
        return get_instance_packed_len(&self).unwrap_or_default().checked_add(3).unwrap_or_default();
    }
}

impl From<MsInstruction> for Instruction {
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

// internal AccountMeta serialization schema
#[derive(AnchorSerialize,AnchorDeserialize, Copy, Clone, Debug)]
pub struct MsAccountMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool
}

// serialization schema for incoming instructions to be attached to transaction
#[derive(AnchorSerialize,AnchorDeserialize, Clone, Debug)]
pub struct IncomingInstruction {
    pub program_id: Pubkey,
    pub keys: Vec<MsAccountMeta>,
    pub data: Vec<u8>
}

#[derive(AnchorSerialize,AnchorDeserialize,Clone)]
pub struct AddInstructionsArgs {
    /// The list of unique account public keys (including program IDs) that will be used in the provided instructions.
    pub account_keys: Vec<Pubkey>,
    pub instructions: Vec<CompressedInstruction>,
    /// Whether to also activate the transaction.
    pub activate: bool,
}

#[derive(AnchorSerialize,AnchorDeserialize,Clone)]
pub struct CompressedInstruction {
    pub program_id_index: u8,
    /// Indices into the account_keys list indicating which accounts to pass to the instruction.
    pub account_indexes: Vec<u8>,
    /// Indices into the account_keys list indicating which accounts are signers.
    pub signer_indexes: Vec<u8>,
    /// Indices into the account_keys list indicating which accounts are writable.
    pub writable_indexes: Vec<u8>,
    pub data: Vec<u8>
}

#[derive(AnchorSerialize,AnchorDeserialize,Clone)]
pub struct CreateTransactionV2Args {
    /// Authority `0` is reserved for internal instructions,
    /// whereas authorities 1 or greater refer to a vault, upgrade authority, or other.
    pub authority_index: u8,
    /// The number of signer pubkeys in the account_keys vec.
    pub num_signers: u8,
    /// The number of writable signer pubkeys in the account_keys vec.
    pub num_writable_signers: u8,
    /// The number of writable non-signer pubkeys in the account_keys vec.
    pub num_writable_non_signers: u8,
    /// The list of unique account public keys (including program IDs) that will be used in the provided instructions.
    /// The signer pubkeys appear at the beginning of the vec, with writable pubkeys first, and read-only pubkeys following.
    /// The non-signer pubkeys follow with writable pubkeys first and read-only ones following.
    /// Program IDs are also stored at the end of the vec along with other non-signer non-writable pubkeys:
    ///
    /// ```plaintext
    /// [pubkey1, pubkey2, pubkey3, pubkey4, pubkey5, pubkey6, pubkey7, pubkey8]
    ///  |---writable---|  |---readonly---|  |---writable---|  |---readonly---|
    ///  |------------signers-------------|  |----------non-singers-----------|
    /// ```
    pub account_keys: Vec<Pubkey>,
    pub instructions: Vec<CompiledInstruction>,
}

/// Account containing data required for tracking the voting status, and execution of multisig transaction.
#[account]
pub struct MsTransactionV2 {
    /// creator, used to seed pda.
    pub creator: Pubkey,
    /// the multisig this belongs to.
    pub ms: Pubkey,
    /// used for seed.
    pub transaction_index: u32,
    /// index to use for other pdas (?).
    pub authority_index: u32,
    /// the bump corresponding to the bespoke authority.
    pub authority_bump: u8,
    /// the status of the transaction.
    pub status: MsTransactionStatus,
    /// bump for the seed.
    pub bump: u8,
    /// keys that have approved/signed.
    pub approved: Vec<Pubkey>,
    /// keys that have rejected.
    pub rejected: Vec<Pubkey>,
    /// keys that have cancelled (ExecuteReady only).
    pub cancelled: Vec<Pubkey>,
    /// unique account pubkeys (including program IDs) required for execution of the tx.
    pub account_keys: Vec<Pubkey>,
    /// list of instructions making up the tx.
    pub instructions: Vec<CompiledInstruction>,
}

impl MsTransactionV2 {
    pub fn size_from_args(args: &CreateTransactionV2Args) -> usize {
        unimplemented!()
    }
}

// Concise serialization schema for instructions that make up transaction.
#[derive(AnchorSerialize,AnchorDeserialize,Clone)]
pub struct CompiledInstruction {
    pub program_id_index: u8,
    /// Indices into the tx's `account_keys` list indicating which accounts to pass to the instruction.
    pub account_indexes: Vec<u8>,
    /// Instruction data.
    pub data: Vec<u8>
}
