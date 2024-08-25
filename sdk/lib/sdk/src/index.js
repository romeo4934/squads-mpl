"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Wallet = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token"); // Ensure you have the correct import for TOKEN_PROGRAM_ID
const constants_1 = require("./constants");
const squads_mpl_json_1 = __importDefault(require("../../target/idl/squads_mpl.json"));
const anchor_1 = require("@coral-xyz/anchor");
Object.defineProperty(exports, "Wallet", { enumerable: true, get: function () { return anchor_1.Wallet; } });
const anchor_2 = require("@coral-xyz/anchor");
const address_1 = require("./address");
const bn_js_1 = __importDefault(require("bn.js"));
const anchor = __importStar(require("@coral-xyz/anchor"));
const tx_builder_1 = require("./tx_builder");
const transactions_1 = require("../../helpers/transactions");
class Squads {
    constructor({ connection, wallet, multisigProgramId, }) {
        this.connection = connection;
        this.wallet = wallet;
        this.multisigProgramId = multisigProgramId !== null && multisigProgramId !== void 0 ? multisigProgramId : constants_1.DEFAULT_MULTISIG_PROGRAM_ID;
        this.provider = new anchor_2.AnchorProvider(this.connection, this.wallet, Object.assign(Object.assign({}, anchor_2.AnchorProvider.defaultOptions()), { commitment: "confirmed", preflightCommitment: "confirmed" }));
        this.multisig = new anchor_2.Program(squads_mpl_json_1.default, this.multisigProgramId, this.provider);
    }
    static endpoint(endpoint, wallet, options) {
        return new Squads(Object.assign({ connection: new web3_js_1.Connection(endpoint, options === null || options === void 0 ? void 0 : options.commitmentOrConfig), wallet }, options));
    }
    static mainnet(wallet, options) {
        return new Squads(Object.assign({ connection: new web3_js_1.Connection("https://api.mainnet-beta.solana.com", options === null || options === void 0 ? void 0 : options.commitmentOrConfig), wallet }, options));
    }
    static devnet(wallet, options) {
        return new Squads(Object.assign({ connection: new web3_js_1.Connection("https://api.devnet.solana.com", options === null || options === void 0 ? void 0 : options.commitmentOrConfig), wallet }, options));
    }
    static localnet(wallet, options) {
        return new Squads(Object.assign({ connection: new web3_js_1.Connection("http://localhost:8899", options === null || options === void 0 ? void 0 : options.commitmentOrConfig), wallet }, options));
    }
    _addPublicKeys(items, addresses) {
        return items.map((item, index) => item ? Object.assign(Object.assign({}, item), { publicKey: addresses[index] }) : null);
    }
    getTransactionBuilder(multisigPDA, authorityIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            const multisig = yield this.getMultisig(multisigPDA);
            return new tx_builder_1.TransactionBuilder(this.multisig.methods, this.provider, multisig, authorityIndex, this.multisigProgramId);
        });
    }
    getMultisig(address, commitment = "processed") {
        return __awaiter(this, void 0, void 0, function* () {
            const accountData = yield this.multisig.account.ms.fetch(address, commitment);
            return Object.assign(Object.assign({}, accountData), { publicKey: address });
        });
    }
    getMultisigs(addresses, commitment = "processed") {
        return __awaiter(this, void 0, void 0, function* () {
            const accountData = yield this.multisig.account.ms.fetchMultiple(addresses, commitment);
            return this._addPublicKeys(accountData, addresses);
        });
    }
    getTransaction(address, commitment = "processed") {
        return __awaiter(this, void 0, void 0, function* () {
            const accountData = yield this.multisig.account.msTransaction.fetch(address, commitment);
            return Object.assign(Object.assign({}, accountData), { publicKey: address });
        });
    }
    getTransactions(addresses) {
        return __awaiter(this, void 0, void 0, function* () {
            const accountData = yield this.multisig.account.msTransaction.fetchMultiple(addresses, "processed");
            return this._addPublicKeys(accountData, addresses);
        });
    }
    getInstruction(address) {
        return __awaiter(this, void 0, void 0, function* () {
            const accountData = yield this.multisig.account.msInstruction.fetch(address, "processed");
            return Object.assign(Object.assign({}, accountData), { publicKey: address });
        });
    }
    getInstructions(addresses) {
        return __awaiter(this, void 0, void 0, function* () {
            const accountData = yield this.multisig.account.msInstruction.fetchMultiple(addresses, "processed");
            return this._addPublicKeys(accountData, addresses);
        });
    }
    getNextTransactionIndex(multisigPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const multisig = yield this.getMultisig(multisigPDA);
            return multisig.transactionIndex + 1;
        });
    }
    getNextInstructionIndex(transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const transaction = yield this.getTransaction(transactionPDA);
            return transaction.instructionIndex + 1;
        });
    }
    getAuthorityPDA(multisigPDA, authorityIndex) {
        return (0, address_1.getAuthorityPDA)(multisigPDA, new bn_js_1.default(authorityIndex, 10), this.multisigProgramId)[0];
    }
    getSpendingLimitPDA(multisigPDA, createKey) {
        return (0, address_1.getSpendingLimitPDA)(multisigPDA, createKey, this.multisigProgramId)[0];
    }
    getSpendingLimit(multisig, createKey, commitment = "processed") {
        return __awaiter(this, void 0, void 0, function* () {
            const [spendingLimitPDA] = (0, address_1.getSpendingLimitPDA)(multisig, createKey, this.multisigProgramId);
            const accountData = yield this.multisig.account.spendingLimit.fetch(spendingLimitPDA, commitment);
            return Object.assign(Object.assign({}, accountData), { publicKey: spendingLimitPDA });
        });
    }
    _createMultisig(threshold, createKey, initialMembers, metadata, primaryMember, // Add primaryMember
    timeLock, // Add timeLock
    adminRevoker) {
        if (!initialMembers.find((member) => member.equals(this.wallet.publicKey))) {
            initialMembers.push(this.wallet.publicKey);
        }
        const [multisigPDA] = (0, address_1.getMsPDA)(createKey, this.multisigProgramId);
        return [
            this.multisig.methods
                .create(threshold, createKey, initialMembers, metadata, primaryMember, timeLock, adminRevoker)
                .accounts({ multisig: multisigPDA, creator: this.wallet.publicKey }),
            multisigPDA,
        ];
    }
    createMultisig(threshold, createKey, initialMembers, name = "", description = "", image = "", primaryMember = null, timeLock = 0, adminRevoker = null) {
        return __awaiter(this, void 0, void 0, function* () {
            const [methods, multisigPDA] = this._createMultisig(threshold, createKey, initialMembers, JSON.stringify({ name, description, image }), primaryMember, timeLock, adminRevoker);
            yield methods.rpc();
            return yield this.getMultisig(multisigPDA);
        });
    }
    buildCreateMultisig(threshold, createKey, initialMembers, name = "", description = "", image = "", primaryMember = null, timeLock = 0, adminRevoker = null) {
        return __awaiter(this, void 0, void 0, function* () {
            const [methods] = this._createMultisig(threshold, createKey, initialMembers, JSON.stringify({ name, description, image }), primaryMember, timeLock, adminRevoker);
            return yield methods.instruction();
        });
    }
    _createTransaction(multisigPDA, authorityIndex, transactionIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            const [transactionPDA] = (0, address_1.getTxPDA)(multisigPDA, new bn_js_1.default(transactionIndex, 10), this.multisigProgramId);
            return [
                this.multisig.methods.createTransaction(authorityIndex).accounts({
                    multisig: multisigPDA,
                    transaction: transactionPDA,
                    creator: this.wallet.publicKey,
                }),
                transactionPDA,
            ];
        });
    }
    createTransaction(multisigPDA, authorityIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            const nextTransactionIndex = yield this.getNextTransactionIndex(multisigPDA);
            const [methods, transactionPDA] = yield this._createTransaction(multisigPDA, authorityIndex, nextTransactionIndex);
            yield methods.rpc();
            return yield this.getTransaction(transactionPDA);
        });
    }
    buildCreateTransaction(multisigPDA, authorityIndex, transactionIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            const [methods] = yield this._createTransaction(multisigPDA, authorityIndex, transactionIndex);
            return yield methods.instruction();
        });
    }
    _addInstruction(multisigPDA, transactionPDA, instruction, instructionIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            const [instructionPDA] = (0, address_1.getIxPDA)(transactionPDA, new bn_js_1.default(instructionIndex, 10), this.multisigProgramId);
            return [
                this.multisig.methods.addInstruction(instruction).accounts({
                    multisig: multisigPDA,
                    transaction: transactionPDA,
                    instruction: instructionPDA,
                    creator: this.wallet.publicKey,
                }),
                instructionPDA,
            ];
        });
    }
    addInstruction(transactionPDA, instruction) {
        return __awaiter(this, void 0, void 0, function* () {
            const transaction = yield this.getTransaction(transactionPDA);
            const [methods, instructionPDA] = yield this._addInstruction(transaction.ms, transactionPDA, instruction, transaction.instructionIndex + 1);
            yield methods.rpc();
            return yield this.getInstruction(instructionPDA);
        });
    }
    buildAddInstruction(multisigPDA, transactionPDA, instruction, instructionIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            const [methods] = yield this._addInstruction(multisigPDA, transactionPDA, instruction, instructionIndex);
            return yield methods.instruction();
        });
    }
    _activateTransaction(multisigPDA, transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.multisig.methods.activateTransaction().accounts({
                multisig: multisigPDA,
                transaction: transactionPDA,
                creator: this.wallet.publicKey,
            });
        });
    }
    activateTransaction(transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const transaction = yield this.getTransaction(transactionPDA);
            const methods = yield this._activateTransaction(transaction.ms, transactionPDA);
            yield methods.rpc();
            return yield this.getTransaction(transactionPDA);
        });
    }
    buildActivateTransaction(multisigPDA, transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const methods = yield this._activateTransaction(multisigPDA, transactionPDA);
            return yield methods.instruction();
        });
    }
    _approveTransaction(multisigPDA, transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.multisig.methods.approveTransaction().accounts({
                multisig: multisigPDA,
                transaction: transactionPDA,
                member: this.wallet.publicKey,
            });
        });
    }
    approveTransaction(transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const transaction = yield this.getTransaction(transactionPDA);
            const methods = yield this._approveTransaction(transaction.ms, transactionPDA);
            yield methods.rpc();
            return yield this.getTransaction(transactionPDA);
        });
    }
    buildApproveTransaction(multisigPDA, transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const methods = yield this._approveTransaction(multisigPDA, transactionPDA);
            return yield methods.instruction();
        });
    }
    _rejectTransaction(multisigPDA, transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.multisig.methods.rejectTransaction().accounts({
                multisig: multisigPDA,
                transaction: transactionPDA,
                member: this.wallet.publicKey,
            });
        });
    }
    rejectTransaction(transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const transaction = yield this.getTransaction(transactionPDA);
            const methods = yield this._rejectTransaction(transaction.ms, transactionPDA);
            yield methods.rpc();
            return yield this.getTransaction(transactionPDA);
        });
    }
    buildRejectTransaction(multisigPDA, transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const methods = yield this._rejectTransaction(multisigPDA, transactionPDA);
            return yield methods.instruction();
        });
    }
    _cancelTransaction(multisigPDA, transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.multisig.methods.cancelTransaction().accounts({
                multisig: multisigPDA,
                transaction: transactionPDA,
                member: this.wallet.publicKey,
            });
        });
    }
    cancelTransaction(transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const transaction = yield this.getTransaction(transactionPDA);
            const methods = yield this._cancelTransaction(transaction.ms, transactionPDA);
            yield methods.rpc();
            return yield this.getTransaction(transactionPDA);
        });
    }
    buildCancelTransaction(multisigPDA, transactionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const methods = yield this._cancelTransaction(multisigPDA, transactionPDA);
            return yield methods.instruction();
        });
    }
    _executeTransaction(transactionPDA, feePayer) {
        return __awaiter(this, void 0, void 0, function* () {
            const transaction = yield this.getTransaction(transactionPDA);
            const ixList = yield Promise.all([...new Array(transaction.instructionIndex)].map((a, i) => __awaiter(this, void 0, void 0, function* () {
                const ixIndexBN = new anchor.BN(i + 1, 10);
                const [ixKey] = (0, address_1.getIxPDA)(transactionPDA, ixIndexBN, this.multisigProgramId);
                const ixAccount = yield this.getInstruction(ixKey);
                return { pubkey: ixKey, ixItem: ixAccount };
            })));
            const ixKeysList = ixList
                .map(({ pubkey, ixItem }) => {
                const ixKeys = ixItem.keys;
                const formattedKeys = ixKeys.map((ixKey, keyInd) => {
                    return {
                        pubkey: ixKey.pubkey,
                        isSigner: false,
                        isWritable: ixKey.isWritable,
                    };
                });
                return [
                    { pubkey, isSigner: false, isWritable: false },
                    { pubkey: ixItem.programId, isSigner: false, isWritable: false },
                    ...formattedKeys,
                ];
            })
                .reduce((p, c) => p.concat(c), []);
            //  [ix ix_account, ix program_id, key1, key2 ...]
            const keysUnique = ixKeysList.reduce((prev, curr) => {
                const inList = prev.findIndex((a) => a.pubkey.toBase58() === curr.pubkey.toBase58());
                // if its already in the list, and has same write flag
                if (inList >= 0 && prev[inList].isWritable === curr.isWritable) {
                    return prev;
                }
                else {
                    prev.push({
                        pubkey: curr.pubkey,
                        isWritable: curr.isWritable,
                        isSigner: curr.isSigner,
                    });
                    return prev;
                }
            }, []);
            const keyIndexMap = ixKeysList.map((a) => {
                return keysUnique.findIndex((k) => k.pubkey.toBase58() === a.pubkey.toBase58() &&
                    k.isWritable === a.isWritable);
            });
            const executeIx = yield this.multisig.methods
                .executeTransaction(Buffer.from(keyIndexMap))
                .accounts({
                multisig: transaction.ms,
                transaction: transactionPDA,
                member: feePayer,
            })
                .instruction();
            executeIx.keys = executeIx.keys.concat(keysUnique);
            return executeIx;
        });
    }
    executeTransaction(transactionPDA, feePayer, signers) {
        return __awaiter(this, void 0, void 0, function* () {
            const payer = feePayer !== null && feePayer !== void 0 ? feePayer : this.wallet.publicKey;
            const executeIx = yield this._executeTransaction(transactionPDA, payer);
            const { blockhash } = yield this.connection.getLatestBlockhash();
            const lastValidBlockHeight = yield this.connection.getBlockHeight();
            const executeTx = new anchor.web3.Transaction({
                blockhash,
                lastValidBlockHeight,
                feePayer: payer,
            });
            executeTx.add(executeIx);
            yield this.provider.sendAndConfirm(executeTx, signers);
            return yield this.getTransaction(transactionPDA);
        });
    }
    buildExecuteTransaction(transactionPDA, feePayer) {
        return __awaiter(this, void 0, void 0, function* () {
            const payer = feePayer !== null && feePayer !== void 0 ? feePayer : this.wallet.publicKey;
            return yield this._executeTransaction(transactionPDA, payer);
        });
    }
    _executeInstruction(transactionPDA, instructionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const transaction = yield this.getTransaction(transactionPDA);
            const instruction = yield this.getInstruction(instructionPDA);
            const remainingAccountKeys = [
                { pubkey: instruction.programId, isSigner: false, isWritable: false },
            ].concat(instruction.keys.map((key) => (Object.assign(Object.assign({}, key), { isSigner: false }))));
            return this.multisig.methods
                .executeInstruction()
                .accounts({
                multisig: transaction.ms,
                transaction: transactionPDA,
                instruction: instructionPDA,
                member: this.wallet.publicKey,
            })
                .remainingAccounts(remainingAccountKeys);
        });
    }
    executeInstruction(transactionPDA, instructionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const methods = yield this._executeInstruction(transactionPDA, instructionPDA);
            yield methods.rpc();
            return yield this.getInstruction(instructionPDA);
        });
    }
    buildExecuteInstruction(transactionPDA, instructionPDA) {
        return __awaiter(this, void 0, void 0, function* () {
            const methods = yield this._executeInstruction(transactionPDA, instructionPDA);
            return yield methods.instruction();
        });
    }
    _removePrimaryMember(multisigPDA, removerSigner) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.multisig.methods.removePrimaryMember().accounts({
                multisig: multisigPDA,
                remover: removerSigner.publicKey,
            })
                .signers([removerSigner]);
            ;
        });
    }
    removePrimaryMember(multisigPDA, removerSigner) {
        return __awaiter(this, void 0, void 0, function* () {
            const methods = yield this._removePrimaryMember(multisigPDA, removerSigner);
            yield methods.rpc();
            return yield this.getMultisig(multisigPDA);
        });
    }
    buildRemovePrimaryMember(multisigPDA, removerSigner) {
        return __awaiter(this, void 0, void 0, function* () {
            const methods = yield this._removePrimaryMember(multisigPDA, removerSigner);
            return yield methods.instruction();
        });
    }
    _spendingLimitUse(multisig, createKey, mint, vaultIndex, amount, decimals, destination, destinationTokenAccount, vaultTokenAccount, member) {
        return __awaiter(this, void 0, void 0, function* () {
            const authorityIndexBN = new bn_js_1.default(vaultIndex, 10);
            const spendingLimitPDA = this.getSpendingLimitPDA(multisig, createKey);
            const [vaultPDA] = (0, address_1.getAuthorityPDA)(multisig, authorityIndexBN, this.multisigProgramId);
            // Determine if this is for SOL or SPL based on mint
            const isSol = mint.equals(web3_js_1.PublicKey.default);
            return this.multisig.methods.spendingLimitUse(amount, decimals).accounts({
                multisig,
                spendingLimit: spendingLimitPDA,
                destination: destination,
                destinationTokenAccount: !isSol ? destinationTokenAccount : null,
                vault: vaultPDA,
                vaultTokenAccount: !isSol ? vaultTokenAccount : null,
                member,
                mint: !isSol ? mint : null,
                tokenProgram: !isSol ? spl_token_1.TOKEN_PROGRAM_ID : null,
                systemProgram: isSol ? anchor.web3.SystemProgram.programId : null,
            });
        });
    }
    spendingLimitUse(multisig, createKey, mint, vaultIndex, amount, decimals, destination, destinationTokenAccount, vaultTokenAccount, primaryMember) {
        return __awaiter(this, void 0, void 0, function* () {
            const methods = yield this._spendingLimitUse(multisig, createKey, mint, vaultIndex, amount, decimals, destination, destinationTokenAccount, vaultTokenAccount, primaryMember);
            yield methods.rpc();
        });
    }
    // this will check to see if the multisig needs to be reallocated for
    // more members, and return the instruction if necessary (or null)
    checkGetTopUpInstruction(publicKey) {
        return __awaiter(this, void 0, void 0, function* () {
            let msAccount = yield this.provider.connection.getParsedAccountInfo(publicKey);
            const ms = yield this.getMultisig(publicKey);
            const currDataSize = msAccount.value.data.length;
            const currNumKeys = ms.keys.length;
            const SIZE_WITHOUT_MEMBERS = 8 + // Anchor discriminator
                2 + // threshold value
                2 + // authority index
                4 + // transaction index
                4 + // processed internal transaction index
                1 + // PDA bump
                32 + // creator
                4 + // for vec length
                33 + // primary member (one byte for option + 32 for Pubkey)
                4 + // time lock
                4 + // for guardians vec length
                (5 * 32); // each guardian is a public key (32 bytes) and there are 5 guardians cf. MAX_GUARDIANS
            const spotsLeft = ((currDataSize - SIZE_WITHOUT_MEMBERS) / 32) - currNumKeys;
            if (spotsLeft < 1) {
                const neededLen = currDataSize + (10 * 32);
                const rentExemptLamports = yield this.provider.connection.getMinimumBalanceForRentExemption(neededLen);
                const topUpLamports = rentExemptLamports - msAccount.value.lamports;
                if (topUpLamports > 0) {
                    const topUpIx = yield (0, transactions_1.createTestTransferTransaction)(this.provider.wallet.publicKey, publicKey, topUpLamports);
                    return topUpIx;
                }
                return null;
            }
            return null;
        });
    }
}
exports.default = Squads;
__exportStar(require("./constants"), exports);
__exportStar(require("./address"), exports);
__exportStar(require("./types"), exports);
