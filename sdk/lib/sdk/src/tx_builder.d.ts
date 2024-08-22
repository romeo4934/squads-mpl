import { MultisigAccount, SquadsMethodsNamespace, ApprovalMode, Period } from "./types";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
export declare class TransactionBuilder {
    multisig: MultisigAccount;
    authorityIndex: number;
    private readonly methods;
    private readonly provider;
    readonly programId: PublicKey;
    private instructions;
    constructor(methods: SquadsMethodsNamespace, provider: AnchorProvider, multisig: MultisigAccount, authorityIndex: number, programId: PublicKey, instructions?: TransactionInstruction[]);
    private _buildAddInstruction;
    private _cloneWithInstructions;
    transactionPDA(): PublicKey;
    withInstruction(instruction: TransactionInstruction): TransactionBuilder;
    withInstructions(instructions: TransactionInstruction[]): TransactionBuilder;
    withAddMember(member: PublicKey): Promise<TransactionBuilder>;
    withAddMemberAndChangeThreshold(member: PublicKey, threshold: number): Promise<TransactionBuilder>;
    withRemoveMember(member: PublicKey): Promise<TransactionBuilder>;
    withRemoveMemberAndChangeThreshold(member: PublicKey, threshold: number): Promise<TransactionBuilder>;
    withChangeThreshold(threshold: number): Promise<TransactionBuilder>;
    withUpdateAdminSettings(newPrimaryMember: PublicKey | null, newTimeLock: number, adminRevoker: PublicKey | null): Promise<TransactionBuilder>;
    withAddSpendingLimit(mint: PublicKey, vaultIndex: number, amount: number, period: Period): Promise<TransactionBuilder>;
    withRemoveSpendingLimit(mint: PublicKey, vaultIndex: number): Promise<TransactionBuilder>;
    getInstructions(approvalMode: ApprovalMode): Promise<[TransactionInstruction[], PublicKey]>;
    executeInstructions(approvalMode: ApprovalMode): Promise<[TransactionInstruction[], PublicKey]>;
}
