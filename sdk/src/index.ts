import {
  Connection,
  PublicKey,
  Commitment,
  ConnectionConfig,
  TransactionInstruction,
  Signer,
} from "@solana/web3.js";

import { TOKEN_PROGRAM_ID } from "@solana/spl-token"; // Ensure you have the correct import for TOKEN_PROGRAM_ID
import {
  DEFAULT_MULTISIG_PROGRAM_ID,
  DEFAULT_PROGRAM_MANAGER_PROGRAM_ID,
} from "./constants";
import squadsMplJSON from "../../target/idl/squads_mpl.json";
import {SquadsMpl} from "../../idl/squads_mpl";
import {Wallet} from "@coral-xyz/anchor";
import {AnchorProvider, Program} from "@coral-xyz/anchor";
import {
  InstructionAccount,
  MultisigAccount,
  SquadsMethods,
  TransactionAccount,
  ApprovalMode,
  SpendingLimitAccount
} from "./types";
import {
  getAuthorityPDA,
  getIxPDA,
  getMsPDA,
  getTxPDA,
  getSpendingLimitPDA
} from "./address";
import BN from "bn.js";
import * as anchor from "@coral-xyz/anchor";
import {TransactionBuilder} from "./tx_builder";
import { program } from "@coral-xyz/anchor/dist/cjs/native/system";
import { createTestTransferTransaction } from "../../helpers/transactions";

class Squads {
  readonly connection: Connection;
  readonly wallet: Wallet;
  private readonly provider: AnchorProvider;
  readonly multisigProgramId: PublicKey;
  private readonly multisig: Program<SquadsMpl>;

  constructor({
                connection,
                wallet,
                multisigProgramId,
              }: {
    connection: Connection;
    wallet: Wallet;
    multisigProgramId?: PublicKey;
  }) {
    this.connection = connection;
    this.wallet = wallet;
    this.multisigProgramId = multisigProgramId ?? DEFAULT_MULTISIG_PROGRAM_ID;
    this.provider = new AnchorProvider(
        this.connection,
        this.wallet,
        {...AnchorProvider.defaultOptions(), commitment: "confirmed", preflightCommitment: "confirmed"}
    );
    this.multisig = new Program<SquadsMpl>(
        squadsMplJSON as SquadsMpl,
        this.multisigProgramId,
        this.provider
    );
  }

  static endpoint(
      endpoint: string,
      wallet: Wallet,
      options?: {
        commitmentOrConfig?: Commitment | ConnectionConfig;
        multisigProgramId?: PublicKey;
      }
  ) {
    return new Squads({
      connection: new Connection(endpoint, options?.commitmentOrConfig),
      wallet,
      ...options,
    });
  }

  static mainnet(
      wallet: Wallet,
      options?: {
        commitmentOrConfig?: Commitment | ConnectionConfig;
        multisigProgramId?: PublicKey;
      }
  ) {
    return new Squads({
      connection: new Connection(
          "https://api.mainnet-beta.solana.com",
          options?.commitmentOrConfig
      ),
      wallet,
      ...options,
    });
  }

  static devnet(
      wallet: Wallet,
      options?: {
        commitmentOrConfig?: Commitment | ConnectionConfig;
        multisigProgramId?: PublicKey;
      }
  ) {
    return new Squads({
      connection: new Connection(
          "https://api.devnet.solana.com",
          options?.commitmentOrConfig
      ),
      wallet,
      ...options,
    });
  }

  static localnet(
      wallet: Wallet,
      options?: {
        commitmentOrConfig?: Commitment | ConnectionConfig;
        multisigProgramId?: PublicKey;
      }
  ) {
    return new Squads({
      connection: new Connection(
          "http://localhost:8899",
          options?.commitmentOrConfig
      ),
      wallet,
      ...options,
    });
  }

  private _addPublicKeys(items: any[], addresses: PublicKey[]): (any | null)[] {
    return items.map((item, index) =>
        item ? {...item, publicKey: addresses[index]} : null
    );
  }

  async getTransactionBuilder(
      multisigPDA: PublicKey,
      authorityIndex: number
  ): Promise<TransactionBuilder> {
    const multisig = await this.getMultisig(multisigPDA);
    return new TransactionBuilder(
        this.multisig.methods,
        this.provider,
        multisig,
        authorityIndex,
        this.multisigProgramId
    );
  }

  async getMultisig(address: PublicKey, commitment = "processed"): Promise<MultisigAccount> {
    const accountData = await this.multisig.account.ms.fetch(address, commitment as Commitment);
    return {...accountData, publicKey: address} as MultisigAccount;
  }

  async getMultisigs(
      addresses: PublicKey[],
      commitment = "processed"
  ): Promise<(MultisigAccount | null)[]> {
    const accountData = await this.multisig.account.ms.fetchMultiple(addresses, commitment as Commitment);
    return this._addPublicKeys(
        accountData,
        addresses
    ) as (MultisigAccount | null)[];
  }

  async getTransaction(address: PublicKey, commitment = "processed"): Promise<TransactionAccount> {
    const accountData = await this.multisig.account.msTransaction.fetch(
        address,
        commitment as Commitment
    );
    return {...accountData, publicKey: address};
  }

  async getTransactions(
      addresses: PublicKey[]
  ): Promise<(TransactionAccount | null)[]> {
    const accountData = await this.multisig.account.msTransaction.fetchMultiple(
        addresses,
        "processed"
    );
    return this._addPublicKeys(
        accountData,
        addresses
    ) as (TransactionAccount | null)[];
  }

  async getInstruction(address: PublicKey): Promise<InstructionAccount> {
    const accountData = await this.multisig.account.msInstruction.fetch(
        address,
        "processed"
    );
    return {...accountData, publicKey: address} as unknown as InstructionAccount;
  }

  async getInstructions(
      addresses: PublicKey[]
  ): Promise<(InstructionAccount | null)[]> {
    const accountData = await this.multisig.account.msInstruction.fetchMultiple(
        addresses,
        "processed"
    );
    return this._addPublicKeys(
        accountData,
        addresses
    ) as (InstructionAccount | null)[];
  }

 
  async getNextTransactionIndex(multisigPDA: PublicKey): Promise<number> {
    const multisig = await this.getMultisig(multisigPDA);
    return multisig.transactionIndex + 1;
  }

  async getNextInstructionIndex(transactionPDA: PublicKey): Promise<number> {
    const transaction = await this.getTransaction(transactionPDA);
    return transaction.instructionIndex + 1;
  }



  getAuthorityPDA(multisigPDA: PublicKey, authorityIndex: number): PublicKey {
    return getAuthorityPDA(
        multisigPDA,
        new BN(authorityIndex, 10),
        this.multisigProgramId
    )[0];
  }

  getSpendingLimitPDA(multisigPDA: PublicKey, mint: PublicKey, vaultIndex: number): PublicKey {
    return getSpendingLimitPDA(
        multisigPDA,
        mint,
        new BN(vaultIndex,10),
        this.multisigProgramId
    )[0];
  }

  async getSpendingLimit(
    multisig: PublicKey,
    mint: PublicKey,
    vaultIndex: number,
    commitment: Commitment = "processed"
  ): Promise<SpendingLimitAccount> {
    const [spendingLimitPDA] = getSpendingLimitPDA(multisig, mint, new BN(vaultIndex,10), this.multisigProgramId);

    const accountData = await this.multisig.account.spendingLimit.fetch(spendingLimitPDA, commitment);
    return {...accountData, publicKey: spendingLimitPDA} as SpendingLimitAccount;
  }

  private _createMultisig(
      threshold: number,
      createKey: PublicKey,
      initialMembers: PublicKey[],
      metadata: string,
      primaryMember: PublicKey | null, // Add primaryMember
      timeLock: number, // Add timeLock
      guardians: PublicKey[] // Add guardians
  ): [SquadsMethods, PublicKey] {
    if (
        !initialMembers.find((member) => member.equals(this.wallet.publicKey))
    ) {
      initialMembers.push(this.wallet.publicKey);
    }
    const [multisigPDA] = getMsPDA(createKey, this.multisigProgramId);
    return [
      this.multisig.methods
          .create(threshold, createKey, initialMembers, metadata, primaryMember, timeLock, guardians)
          .accounts({multisig: multisigPDA, creator: this.wallet.publicKey}),
      multisigPDA,
    ];
  }

  async createMultisig(
      threshold: number,
      createKey: PublicKey,
      initialMembers: PublicKey[],
      name = "",
      description = "",
      image = "",
      primaryMember: PublicKey | null = null,
      timeLock = 0,
      guardians: PublicKey[] = []
  ): Promise<MultisigAccount> {
    const [methods, multisigPDA] = this._createMultisig(
        threshold,
        createKey,
        initialMembers,
        JSON.stringify({name, description, image}),
        primaryMember,
        timeLock,
        guardians
    );
    await methods.rpc();
    return await this.getMultisig(multisigPDA);
  }

  async buildCreateMultisig(
      threshold: number,
      createKey: PublicKey,
      initialMembers: PublicKey[],
      name = "",
      description = "",
      image = "",
      primaryMember: PublicKey | null = null,
      timeLock = 0,
      guardians: PublicKey[] = []
  ): Promise<TransactionInstruction> {
    const [methods] = this._createMultisig(
        threshold,
        createKey,
        initialMembers,
        JSON.stringify({name, description, image}),
        primaryMember,
        timeLock,
        guardians
    );
    return await methods.instruction();
  }

  private async _createTransaction(
      multisigPDA: PublicKey,
      authorityIndex: number,
      transactionIndex: number,
      approvalMode: ApprovalMode
  ): Promise<[SquadsMethods, PublicKey]> {
    const [transactionPDA] = getTxPDA(
        multisigPDA,
        new BN(transactionIndex, 10),
        this.multisigProgramId
    );
    return [
      this.multisig.methods.createTransaction(authorityIndex, approvalMode).accounts({
        multisig: multisigPDA,
        transaction: transactionPDA,
        creator: this.wallet.publicKey,
      }),
      transactionPDA,
    ];
  }

  async createTransaction(
      multisigPDA: PublicKey,
      authorityIndex: number,
      approvalMode: ApprovalMode
  ): Promise<TransactionAccount> {
    const nextTransactionIndex = await this.getNextTransactionIndex(
        multisigPDA
    );
    const [methods, transactionPDA] = await this._createTransaction(
        multisigPDA,
        authorityIndex,
        nextTransactionIndex,
        approvalMode
    );
    await methods.rpc();
    return await this.getTransaction(transactionPDA);
  }

  async buildCreateTransaction(
      multisigPDA: PublicKey,
      authorityIndex: number,
      transactionIndex: number,
      approvalMode: ApprovalMode
  ): Promise<TransactionInstruction> {
    const [methods] = await this._createTransaction(
        multisigPDA,
        authorityIndex,
        transactionIndex,
        approvalMode
    );
    return await methods.instruction();
  }

  private async _addInstruction(
      multisigPDA: PublicKey,
      transactionPDA: PublicKey,
      instruction: TransactionInstruction,
      instructionIndex: number
  ): Promise<[SquadsMethods, PublicKey]> {
    const [instructionPDA] = getIxPDA(
        transactionPDA,
        new BN(instructionIndex, 10),
        this.multisigProgramId
    );
    return [
      this.multisig.methods.addInstruction(instruction).accounts({
        multisig: multisigPDA,
        transaction: transactionPDA,
        instruction: instructionPDA,
        creator: this.wallet.publicKey,
      }),
      instructionPDA,
    ];
  }

  async addInstruction(
      transactionPDA: PublicKey,
      instruction: TransactionInstruction
  ): Promise<InstructionAccount> {
    const transaction = await this.getTransaction(transactionPDA);
    const [methods, instructionPDA] = await this._addInstruction(
        transaction.ms,
        transactionPDA,
        instruction,
        transaction.instructionIndex + 1
    );
    await methods.rpc();
    return await this.getInstruction(instructionPDA);
  }

  async buildAddInstruction(
      multisigPDA: PublicKey,
      transactionPDA: PublicKey,
      instruction: TransactionInstruction,
      instructionIndex: number
  ): Promise<TransactionInstruction> {
    const [methods] = await this._addInstruction(
        multisigPDA,
        transactionPDA,
        instruction,
        instructionIndex
    );
    return await methods.instruction();
  }

  private async _activateTransaction(
      multisigPDA: PublicKey,
      transactionPDA: PublicKey
  ): Promise<SquadsMethods> {
    return this.multisig.methods.activateTransaction().accounts({
      multisig: multisigPDA,
      transaction: transactionPDA,
      creator: this.wallet.publicKey,
    });
  }

  async activateTransaction(
      transactionPDA: PublicKey
  ): Promise<TransactionAccount> {
    const transaction = await this.getTransaction(transactionPDA);
    const methods = await this._activateTransaction(
        transaction.ms,
        transactionPDA
    );
    await methods.rpc();
    return await this.getTransaction(transactionPDA);
  }

  async buildActivateTransaction(
      multisigPDA: PublicKey,
      transactionPDA: PublicKey
  ): Promise<TransactionInstruction> {
    const methods = await this._activateTransaction(
        multisigPDA,
        transactionPDA
    );
    return await methods.instruction();
  }

  private async _approveTransaction(
      multisigPDA: PublicKey,
      transactionPDA: PublicKey
  ): Promise<SquadsMethods> {
    return this.multisig.methods.approveTransaction().accounts({
      multisig: multisigPDA,
      transaction: transactionPDA,
      member: this.wallet.publicKey,
    });
  }

  async approveTransaction(
      transactionPDA: PublicKey
  ): Promise<TransactionAccount> {
    const transaction = await this.getTransaction(transactionPDA);
    const methods = await this._approveTransaction(
        transaction.ms,
        transactionPDA
    );
    await methods.rpc();
    return await this.getTransaction(transactionPDA);
  }

  async buildApproveTransaction(
      multisigPDA: PublicKey,
      transactionPDA: PublicKey
  ): Promise<TransactionInstruction> {
    const methods = await this._approveTransaction(multisigPDA, transactionPDA);
    return await methods.instruction();
  }

  private async _rejectTransaction(
      multisigPDA: PublicKey,
      transactionPDA: PublicKey
  ): Promise<SquadsMethods> {
    return this.multisig.methods.rejectTransaction().accounts({
      multisig: multisigPDA,
      transaction: transactionPDA,
      member: this.wallet.publicKey,
    });
  }

  async rejectTransaction(
      transactionPDA: PublicKey
  ): Promise<TransactionAccount> {
    const transaction = await this.getTransaction(transactionPDA);
    const methods = await this._rejectTransaction(
        transaction.ms,
        transactionPDA
    );
    await methods.rpc();
    return await this.getTransaction(transactionPDA);
  }

  async buildRejectTransaction(
      multisigPDA: PublicKey,
      transactionPDA: PublicKey
  ): Promise<TransactionInstruction> {
    const methods = await this._rejectTransaction(multisigPDA, transactionPDA);
    return await methods.instruction();
  }

  private async _cancelTransaction(
      multisigPDA: PublicKey,
      transactionPDA: PublicKey
  ): Promise<SquadsMethods> {
    return this.multisig.methods.cancelTransaction().accounts({
      multisig: multisigPDA,
      transaction: transactionPDA,
      member: this.wallet.publicKey,
    });
  }

  async cancelTransaction(
      transactionPDA: PublicKey
  ): Promise<TransactionAccount> {
    const transaction = await this.getTransaction(transactionPDA);
    const methods = await this._cancelTransaction(
        transaction.ms,
        transactionPDA
    );
    await methods.rpc();
    return await this.getTransaction(transactionPDA);
  }

  async buildCancelTransaction(
      multisigPDA: PublicKey,
      transactionPDA: PublicKey
  ): Promise<TransactionInstruction> {
    const methods = await this._cancelTransaction(multisigPDA, transactionPDA);
    return await methods.instruction();
  }

  private async _executeTransaction(
      transactionPDA: PublicKey,
      feePayer: PublicKey
  ): Promise<TransactionInstruction> {
    const transaction = await this.getTransaction(transactionPDA);
    const ixList = await Promise.all(
        [...new Array(transaction.instructionIndex)].map(async (a, i) => {
          const ixIndexBN = new anchor.BN(i + 1, 10);
          const [ixKey] = getIxPDA(
              transactionPDA,
              ixIndexBN,
              this.multisigProgramId
          );
          const ixAccount = await this.getInstruction(ixKey);
          return {pubkey: ixKey, ixItem: ixAccount};
        })
    );

    const ixKeysList: anchor.web3.AccountMeta[] = ixList
        .map(({pubkey, ixItem}) => {
          const ixKeys: anchor.web3.AccountMeta[] =
              ixItem.keys as anchor.web3.AccountMeta[];

          const formattedKeys = ixKeys.map((ixKey, keyInd) => {
            return {
              pubkey: ixKey.pubkey,
              isSigner: false,
              isWritable: ixKey.isWritable,
            };
          });

          return [
            {pubkey, isSigner: false, isWritable: false},
            {pubkey: ixItem.programId, isSigner: false, isWritable: false},
            ...formattedKeys,
          ];
        })
        .reduce((p, c) => p.concat(c), []);

    //  [ix ix_account, ix program_id, key1, key2 ...]
    const keysUnique: anchor.web3.AccountMeta[] = ixKeysList.reduce(
        (prev, curr) => {
          const inList = prev.findIndex(
              (a) => a.pubkey.toBase58() === curr.pubkey.toBase58()
          );
          // if its already in the list, and has same write flag
          if (inList >= 0 && prev[inList].isWritable === curr.isWritable) {
            return prev;
          } else {
            prev.push({
              pubkey: curr.pubkey,
              isWritable: curr.isWritable,
              isSigner: curr.isSigner,
            });
            return prev;
          }
        },
        [] as anchor.web3.AccountMeta[]
    );

    const keyIndexMap = ixKeysList.map((a) => {
      return keysUnique.findIndex(
          (k) =>
              k.pubkey.toBase58() === a.pubkey.toBase58() &&
              k.isWritable === a.isWritable
      );
    });

    const executeIx = await this.multisig.methods
        .executeTransaction(Buffer.from(keyIndexMap))
        .accounts({
          multisig: transaction.ms,
          transaction: transactionPDA,
          member: feePayer,
        })
        .instruction();
    executeIx.keys = executeIx.keys.concat(keysUnique);
    return executeIx;
  }

  async executeTransaction(
      transactionPDA: PublicKey,
      feePayer?: PublicKey,
      signers?: Signer[]
  ): Promise<TransactionAccount> {
    const payer = feePayer ?? this.wallet.publicKey;
    const executeIx = await this._executeTransaction(transactionPDA, payer);

    const {blockhash} = await this.connection.getLatestBlockhash();
    const lastValidBlockHeight = await this.connection.getBlockHeight();
    const executeTx = new anchor.web3.Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: payer,
    });
    executeTx.add(executeIx);
    await this.provider.sendAndConfirm(executeTx, signers);
    return await this.getTransaction(transactionPDA);
  }

  async buildExecuteTransaction(
      transactionPDA: PublicKey,
      feePayer?: PublicKey
  ): Promise<TransactionInstruction> {
    const payer = feePayer ?? this.wallet.publicKey;
    return await this._executeTransaction(transactionPDA, payer);
  }

  private async _executeInstruction(
      transactionPDA: PublicKey,
      instructionPDA: PublicKey
  ): Promise<SquadsMethods> {
    const transaction = await this.getTransaction(transactionPDA);
    const instruction = await this.getInstruction(instructionPDA);
    const remainingAccountKeys: anchor.web3.AccountMeta[] = [
      {pubkey: instruction.programId, isSigner: false, isWritable: false},
    ].concat(
        (instruction.keys as anchor.web3.AccountMeta[]).map((key) => ({
          ...key,
          isSigner: false,
        }))
    );
    return this.multisig.methods
        .executeInstruction()
        .accounts({
          multisig: transaction.ms,
          transaction: transactionPDA,
          instruction: instructionPDA,
          member: this.wallet.publicKey,
        })
        .remainingAccounts(remainingAccountKeys);
  }

  async executeInstruction(
      transactionPDA: PublicKey,
      instructionPDA: PublicKey
  ): Promise<InstructionAccount> {
    const methods = await this._executeInstruction(
        transactionPDA,
        instructionPDA
    );
    await methods.rpc();
    return await this.getInstruction(instructionPDA);
  }

  async buildExecuteInstruction(
      transactionPDA: PublicKey,
      instructionPDA: PublicKey
  ): Promise<TransactionInstruction> {
    const methods = await this._executeInstruction(
        transactionPDA,
        instructionPDA
    );
    return await methods.instruction();
  }

  private async _removePrimaryMember(
    multisigPDA: PublicKey,
    removerSigner: anchor.web3.Keypair
  ): Promise<SquadsMethods> {
    return this.multisig.methods.removePrimaryMember().accounts({
      multisig: multisigPDA,
      remover: removerSigner.publicKey,
    })
    .signers([removerSigner]);
    ;
  }

  async removePrimaryMember(
    multisigPDA: PublicKey,
    removerSigner: anchor.web3.Keypair
  ): Promise<MultisigAccount> {
    const methods = await this._removePrimaryMember(multisigPDA,removerSigner);
    await methods.rpc();
    return await this.getMultisig(multisigPDA);
  }

  async buildRemovePrimaryMember(
    multisigPDA: PublicKey,
    removerSigner: anchor.web3.Keypair
  ): Promise<TransactionInstruction> {
    const methods = await this._removePrimaryMember(multisigPDA,removerSigner);
    return await methods.instruction();
  }

  private async _spendingLimitUse(
    multisig: PublicKey,
    mint: PublicKey,
    vaultIndex: number,
    amount: BN,
    destination: PublicKey,
    destinationTokenAccount: PublicKey | null,
    vaultTokenAccount: PublicKey | null,
    primaryMember: PublicKey
  ): Promise<SquadsMethods> {
  const authorityIndexBN = new BN(vaultIndex, 10);
  const spendingLimitPDA = this.getSpendingLimitPDA(
    multisig,
    mint,
    vaultIndex
  );
      
  const [vaultPDA] = getAuthorityPDA(multisig, authorityIndexBN, this.multisigProgramId);

  // Determine if this is for SOL or SPL based on mint
  const isSol = mint.equals(PublicKey.default);

  return this.multisig.methods.spendingLimitUse(amount).accounts({
    multisig,
    spendingLimit: spendingLimitPDA,
    destination: isSol ? destination : null, // If SOL, provide destination account
    destinationTokenAccount: !isSol ? destinationTokenAccount : null, // If SPL, provide destination token account
    vault: vaultPDA, // Use the computed vault PDA
    vaultTokenAccount: !isSol ? vaultTokenAccount : null, // Vault token account for SPL
    primaryMember,
    mint: !isSol ? mint : null, // If SPL, provide the mint
    tokenProgram: !isSol ? TOKEN_PROGRAM_ID : null, // If SPL, provide the token program
    systemProgram: isSol ? anchor.web3.SystemProgram.programId : null,
  });
}

  async spendingLimitUse(
    multisig: PublicKey,
    mint: PublicKey,
    vaultIndex: number,
    amount: BN,
    destination: PublicKey,
    destinationTokenAccount: PublicKey | null,
    vaultTokenAccount: PublicKey | null,
    primaryMember: PublicKey
  ): Promise<void> {
    const methods = await this._spendingLimitUse(
      multisig,
      mint,
      vaultIndex,
      amount,
      destination,
      destinationTokenAccount,
      vaultTokenAccount,
      primaryMember
    );

    await methods.rpc();
  }

  // this will check to see if the multisig needs to be reallocated for
  // more members, and return the instruction if necessary (or null)
  async checkGetTopUpInstruction(publicKey: PublicKey): Promise<TransactionInstruction | null> {
    let msAccount = await this.provider.connection.getParsedAccountInfo(publicKey) as any;
    const ms = await this.getMultisig(publicKey);
    const currDataSize = msAccount.value.data.length;
    const currNumKeys = ms.keys.length;
    const SIZE_WITHOUT_MEMBERS = 8 + // Anchor disriminator
        2 +         // threshold value
        2 +         // authority index
        4 +         // transaction index
        4 +         // processed internal transaction index
        1 +         // PDA bump
        32 +        // creator
        1 +         // allow external execute
        4;          // for vec length

    const spotsLeft = ((currDataSize - SIZE_WITHOUT_MEMBERS) / 32) - currNumKeys;

    if(spotsLeft < 1){
      const neededLen = currDataSize + (10 * 32);
      const rentExemptLamports = await this.provider.connection.getMinimumBalanceForRentExemption(neededLen);
      const topUpLamports = rentExemptLamports - msAccount.value.lamports;
      if(topUpLamports > 0){
        const topUpIx = await createTestTransferTransaction(this.provider.wallet.publicKey, publicKey, topUpLamports);
        return topUpIx;
      }
      return null;
    }
    return null;
  }
}

export default Squads;

export {Wallet};
export * from "./constants";
export * from "./address";
export * from "./types";
