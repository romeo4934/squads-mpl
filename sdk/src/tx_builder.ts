import {
  MultisigAccount,
  SquadsMethodsNamespace,
  ApprovalMode,
  Period
} from "./types";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { getAuthorityPDA, getIxPDA, getTxPDA, getSpendingLimitPDA } from "./address";
import BN from "bn.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import {createBlankTransaction, createTestTransferTransaction} from "../../helpers/transactions";

export class TransactionBuilder {
  multisig: MultisigAccount;
  authorityIndex: number;
  private readonly methods: SquadsMethodsNamespace;
  private readonly provider: AnchorProvider;
  readonly programId: PublicKey;
  private instructions: TransactionInstruction[];
  constructor(
    methods: SquadsMethodsNamespace,
    provider: AnchorProvider,
    multisig: MultisigAccount,
    authorityIndex: number,
    programId: PublicKey,
    instructions?: TransactionInstruction[]
  ) {
    this.methods = methods;
    this.provider = provider;
    this.multisig = multisig;
    this.authorityIndex = authorityIndex;
    this.programId = programId;
    this.instructions = instructions ?? [];
  }

  private async _buildAddInstruction(
    transactionPDA: PublicKey,
    instruction: TransactionInstruction,
    instructionIndex: number
  ): Promise<TransactionInstruction> {
    const [instructionPDA] = getIxPDA(
      transactionPDA,
      new BN(instructionIndex, 10),
      this.programId
    );
    return await this.methods
      .addInstruction(instruction)
      .accounts({
        multisig: this.multisig.publicKey,
        transaction: transactionPDA,
        instruction: instructionPDA,
        creator: this.provider.wallet.publicKey,
      })
      .instruction();
  }
  private _cloneWithInstructions(
    instructions: TransactionInstruction[]
  ): TransactionBuilder {
    return new TransactionBuilder(
      this.methods,
      this.provider,
      this.multisig,
      this.authorityIndex,
      this.programId,
      instructions
    );
  }
  transactionPDA() {
    const [transactionPDA] = getTxPDA(
      this.multisig.publicKey,
      new BN(this.multisig.transactionIndex + 1),
      this.programId
    );
    return transactionPDA;
  }
  withInstruction(instruction: TransactionInstruction): TransactionBuilder {
    return this._cloneWithInstructions(this.instructions.concat(instruction));
  }
  withInstructions(instructions: TransactionInstruction[]): TransactionBuilder {
    const newInstructions = [];
    for (let i = 0; i < instructions.length; i++) {
      newInstructions.push(instructions[i]);
    }
    return this._cloneWithInstructions(
      this.instructions.concat(newInstructions)
    );
  }
  async withAddMember(member: PublicKey): Promise<TransactionBuilder> {
    const instructions = []
    const instruction = await this.methods
      .addMember(member)
      .accounts({
        multisig: this.multisig.publicKey,
      })
      .instruction();
    instructions.push(instruction)
    return this._cloneWithInstructions(
        this.instructions.concat(instructions)
    );
  }
  async withRemoveMember(member: PublicKey): Promise<TransactionBuilder> {
    const instruction = await this.methods
      .removeMember(member)
      .accounts({
        multisig: this.multisig.publicKey,
      })
      .instruction();
    return this.withInstruction(instruction);
  }
  async withChangeThreshold(threshold: number): Promise<TransactionBuilder> {
    const instruction = await this.methods
      .changeThreshold(threshold)
      .accounts({
        multisig: this.multisig.publicKey,
      })
      .instruction();
    return this.withInstruction(instruction);
  }

  async withUpdateAdminSettings(
    newPrimaryMember: PublicKey | null,
    newTimeLock: number,
    adminRevoker: PublicKey | null
  ): Promise<TransactionBuilder> {
    const instruction = await this.methods
      .updateAdminSettings(newPrimaryMember,newTimeLock,adminRevoker)
      .accounts({
        multisig: this.multisig.publicKey,
      })
      .instruction();
    return this.withInstruction(instruction);
  }

  // Add this after other methods inside the TransactionBuilder class
  async withAddSpendingLimit(
    mint: PublicKey,
    vaultIndex: number,
    amount: number,
    period: Period
  ): Promise<TransactionBuilder> {
    const [spendingLimitPDA] = await getSpendingLimitPDA(this.multisig.publicKey, mint, new BN(vaultIndex,10), this.programId);

    const instruction = await this.methods
      .addSpendingLimit(mint, vaultIndex, new BN(amount), period)
      .accounts({
        multisig: this.multisig.publicKey,
        spendingLimit: spendingLimitPDA,
        rentPayer: this.provider.wallet.publicKey, // Ensure the correct signer
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    return this.withInstruction(instruction);
  }

  async withRemoveSpendingLimit(
    mint: PublicKey,
    vaultIndex: number
  ): Promise<TransactionBuilder> {
    const [spendingLimitPDA] = await getSpendingLimitPDA(this.multisig.publicKey, mint, new BN(vaultIndex,10), this.programId);

    const instruction = await this.methods
      .removeSpendingLimit()
      .accounts({
        multisig: this.multisig.publicKey,
        spendingLimit: spendingLimitPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    return this.withInstruction(instruction);
  }
  

  async getInstructions(): Promise<[TransactionInstruction[], PublicKey]> {
    const transactionPDA = this.transactionPDA();
    const wrappedAddInstructions = await Promise.all(
      this.instructions.map((rawInstruction, index) =>
        this._buildAddInstruction(transactionPDA, rawInstruction, index + 1)
      )
    );
    const createTxInstruction = await this.methods
      .createTransaction(this.authorityIndex)
      .accounts({
        multisig: this.multisig.publicKey,
        transaction: transactionPDA,
        creator: this.provider.wallet.publicKey,
      })
      .instruction();
    const instructions = [createTxInstruction, ...wrappedAddInstructions];
    this.instructions = [];
    return [instructions, transactionPDA];
  }
  async executeInstructions(): Promise<[TransactionInstruction[], PublicKey]> {
    const [instructions, transactionPDA] = await this.getInstructions();
    const { blockhash } = await this.provider.connection.getLatestBlockhash();
    const lastValidBlockHeight =
      await this.provider.connection.getBlockHeight();
    const transaction = new anchor.web3.Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: this.provider.wallet.publicKey,
    });
    transaction.add(...instructions);
    await this.provider.sendAndConfirm(transaction);
    return [instructions, transactionPDA];
  }
}
