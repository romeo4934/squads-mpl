import { Connection, PublicKey, Commitment, ConnectionConfig, TransactionInstruction, Signer } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { InstructionAccount, MultisigAccount, TransactionAccount, ApprovalMode, SpendingLimitAccount } from "./types";
import BN from "bn.js";
import * as anchor from "@coral-xyz/anchor";
import { TransactionBuilder } from "./tx_builder";
declare class Squads {
    readonly connection: Connection;
    readonly wallet: Wallet;
    private readonly provider;
    readonly multisigProgramId: PublicKey;
    private readonly multisig;
    constructor({ connection, wallet, multisigProgramId, }: {
        connection: Connection;
        wallet: Wallet;
        multisigProgramId?: PublicKey;
    });
    static endpoint(endpoint: string, wallet: Wallet, options?: {
        commitmentOrConfig?: Commitment | ConnectionConfig;
        multisigProgramId?: PublicKey;
    }): Squads;
    static mainnet(wallet: Wallet, options?: {
        commitmentOrConfig?: Commitment | ConnectionConfig;
        multisigProgramId?: PublicKey;
    }): Squads;
    static devnet(wallet: Wallet, options?: {
        commitmentOrConfig?: Commitment | ConnectionConfig;
        multisigProgramId?: PublicKey;
    }): Squads;
    static localnet(wallet: Wallet, options?: {
        commitmentOrConfig?: Commitment | ConnectionConfig;
        multisigProgramId?: PublicKey;
    }): Squads;
    private _addPublicKeys;
    getTransactionBuilder(multisigPDA: PublicKey, authorityIndex: number): Promise<TransactionBuilder>;
    getMultisig(address: PublicKey, commitment?: string): Promise<MultisigAccount>;
    getMultisigs(addresses: PublicKey[], commitment?: string): Promise<(MultisigAccount | null)[]>;
    getTransaction(address: PublicKey, commitment?: string): Promise<TransactionAccount>;
    getTransactions(addresses: PublicKey[]): Promise<(TransactionAccount | null)[]>;
    getInstruction(address: PublicKey): Promise<InstructionAccount>;
    getInstructions(addresses: PublicKey[]): Promise<(InstructionAccount | null)[]>;
    getNextTransactionIndex(multisigPDA: PublicKey): Promise<number>;
    getNextInstructionIndex(transactionPDA: PublicKey): Promise<number>;
    getAuthorityPDA(multisigPDA: PublicKey, authorityIndex: number): PublicKey;
    getSpendingLimitPDA(multisigPDA: PublicKey, mint: PublicKey, vaultIndex: number): PublicKey;
    getSpendingLimit(multisig: PublicKey, mint: PublicKey, vaultIndex: number, commitment?: Commitment): Promise<SpendingLimitAccount>;
    private _createMultisig;
    createMultisig(threshold: number, createKey: PublicKey, initialMembers: PublicKey[], name?: string, description?: string, image?: string, primaryMember?: PublicKey | null, timeLock?: number, guardians?: PublicKey[]): Promise<MultisigAccount>;
    buildCreateMultisig(threshold: number, createKey: PublicKey, initialMembers: PublicKey[], name?: string, description?: string, image?: string, primaryMember?: PublicKey | null, timeLock?: number, guardians?: PublicKey[]): Promise<TransactionInstruction>;
    private _createTransaction;
    createTransaction(multisigPDA: PublicKey, authorityIndex: number, approvalMode: ApprovalMode): Promise<TransactionAccount>;
    buildCreateTransaction(multisigPDA: PublicKey, authorityIndex: number, transactionIndex: number, approvalMode: ApprovalMode): Promise<TransactionInstruction>;
    private _addInstruction;
    addInstruction(transactionPDA: PublicKey, instruction: TransactionInstruction): Promise<InstructionAccount>;
    buildAddInstruction(multisigPDA: PublicKey, transactionPDA: PublicKey, instruction: TransactionInstruction, instructionIndex: number): Promise<TransactionInstruction>;
    private _activateTransaction;
    activateTransaction(transactionPDA: PublicKey): Promise<TransactionAccount>;
    buildActivateTransaction(multisigPDA: PublicKey, transactionPDA: PublicKey): Promise<TransactionInstruction>;
    private _approveTransaction;
    approveTransaction(transactionPDA: PublicKey): Promise<TransactionAccount>;
    buildApproveTransaction(multisigPDA: PublicKey, transactionPDA: PublicKey): Promise<TransactionInstruction>;
    private _rejectTransaction;
    rejectTransaction(transactionPDA: PublicKey): Promise<TransactionAccount>;
    buildRejectTransaction(multisigPDA: PublicKey, transactionPDA: PublicKey): Promise<TransactionInstruction>;
    private _cancelTransaction;
    cancelTransaction(transactionPDA: PublicKey): Promise<TransactionAccount>;
    buildCancelTransaction(multisigPDA: PublicKey, transactionPDA: PublicKey): Promise<TransactionInstruction>;
    private _executeTransaction;
    executeTransaction(transactionPDA: PublicKey, feePayer?: PublicKey, signers?: Signer[]): Promise<TransactionAccount>;
    buildExecuteTransaction(transactionPDA: PublicKey, feePayer?: PublicKey): Promise<TransactionInstruction>;
    private _executeInstruction;
    executeInstruction(transactionPDA: PublicKey, instructionPDA: PublicKey): Promise<InstructionAccount>;
    buildExecuteInstruction(transactionPDA: PublicKey, instructionPDA: PublicKey): Promise<TransactionInstruction>;
    private _removePrimaryMember;
    removePrimaryMember(multisigPDA: PublicKey, removerSigner: anchor.web3.Keypair): Promise<MultisigAccount>;
    buildRemovePrimaryMember(multisigPDA: PublicKey, removerSigner: anchor.web3.Keypair): Promise<TransactionInstruction>;
    private _spendingLimitUse;
    spendingLimitUse(multisig: PublicKey, mint: PublicKey, vaultIndex: number, amount: BN, decimals: number, destination: PublicKey, destinationTokenAccount: PublicKey | null, vaultTokenAccount: PublicKey | null, primaryMember: PublicKey): Promise<void>;
    checkGetTopUpInstruction(publicKey: PublicKey): Promise<TransactionInstruction | null>;
}
export default Squads;
export { Wallet };
export * from "./constants";
export * from "./address";
export * from "./types";
