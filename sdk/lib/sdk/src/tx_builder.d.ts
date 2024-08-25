import { MultisigAccount, SquadsMethodsNamespace, Member, Period } from "./types";
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
    withAddMember(member: Member): Promise<TransactionBuilder>;
    withRemoveMember(member: PublicKey): Promise<TransactionBuilder>;
    withChangeThreshold(threshold: number): Promise<TransactionBuilder>;
    withUpdateMultisigSettings(newTimeLock: number): Promise<TransactionBuilder>;
    withAddSpendingLimit(createKey: PublicKey, mint: PublicKey, vaultIndex: number, amount: number, member: PublicKey, period: Period): Promise<TransactionBuilder>;
    withRemoveSpendingLimit(createKey: PublicKey): Promise<TransactionBuilder>;
    getInstructions(): Promise<[TransactionInstruction[], PublicKey]>;
    executeInstructions(): Promise<[TransactionInstruction[], PublicKey]>;
}
