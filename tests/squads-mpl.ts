import { expect } from "chai";
import fs from "fs";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SquadsMpl } from "../idl/squads_mpl";
import { ProgramManager } from "../idl/program_manager";
import { Roles } from "../idl/roles";
import { setTimeout } from "timers/promises";

import {
  createBlankTransaction,
  createTestTransferTransaction,
} from "../helpers/transactions";
import { execSync } from "child_process";
import { LAMPORTS_PER_SOL, ParsedAccountData, SystemProgram } from "@solana/web3.js";
import Squads, {
  getMsPDA,
  getIxPDA,
  getProgramManagerPDA,
  getAuthorityPDA,
  getTxPDA,
} from "../sdk/src/index";
import BN from "bn.js";
import { getExecuteProxyInstruction, getUserRolePDA, getUserDelegatePDA, getRolesManager } from "../helpers/roles";
import { agnosticExecute } from "../helpers/sdkExecute";

import {memberListApprove} from "../helpers/approve";

const BPF_UPGRADE_ID = new anchor.web3.PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

const deploySmpl = () => {
  const deployCmd = `solana program deploy --url localhost -v --program-id $(pwd)/target/deploy/squads_mpl-keypair.json $(pwd)/target/deploy/squads_mpl.so`;
  execSync(deployCmd);
};

const deployPm = () => {
  const deployCmd = `solana program deploy --url localhost -v --program-id $(pwd)/target/deploy/program_manager-keypair.json $(pwd)/target/deploy/program_manager.so`;
  execSync(deployCmd);
};

const deployRoles = () => {
  const deployCmd = `solana program deploy --url localhost -v --program-id $(pwd)/target/deploy/roles-keypair.json $(pwd)/target/deploy/roles.so`;
  execSync(deployCmd);
};

// will deploy a buffer for the program manager program
const writeBuffer = (bufferKeypair: string) => {
  const writeCmd = `solana program write-buffer --buffer ${bufferKeypair} --url localhost -v $(pwd)/target/deploy/program_manager.so`;
  execSync(writeCmd);
};

const setBufferAuthority = (
  bufferAddress: anchor.web3.PublicKey,
  authority: anchor.web3.PublicKey
) => {
  const authCmd = `solana program set-buffer-authority --url localhost ${bufferAddress.toBase58()} --new-buffer-authority ${authority.toBase58()}`;
  execSync(authCmd);
};

const setProgramAuthority = (
  programAddress: anchor.web3.PublicKey,
  authority: anchor.web3.PublicKey
) => {
  try {
    const logsCmd = `solana program show --url localhost --programs`;
    execSync(logsCmd, { stdio: "inherit" });
    const authCmd = `solana program set-upgrade-authority --url localhost ${programAddress.toBase58()} --new-upgrade-authority ${authority.toBase58()}`;
    execSync(authCmd, { stdio: "inherit" });
  } catch (e) {
    console.log(e);
    throw new Error(e);
  }
};

const getIxAuthority = async (txPda: anchor.web3.PublicKey, index: anchor.BN, programId: anchor.web3.PublicKey) => {
  return anchor.web3.PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode("squad"),
      txPda.toBuffer(),
      index.toArrayLike(Buffer, "le", 4),
      anchor.utils.bytes.utf8.encode("ix_authority")],
      programId
  );
};

let provider;

describe("Programs", function(){

  this.beforeAll(function(){
    // Configure the client to use the local cluster.
    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
  });

  describe("SMPL, Program Manager, & Roles", function(){

    let program;
    let squads;
    let creator;
    let programManagerProgram;
    let randomCreateKey;
    let msPDA;
    let pmPDA;
    let member2;
    let rolesProgram;

    const numberOfMembersTotal = 10;
    const memberList = [...new Array(numberOfMembersTotal - 1)].map(() => {
      return anchor.web3.Keypair.generate();
    });

    let threshold = 1;
    let timeLock = 0; // Set the time lock to 0 for no delay
    const initialGuardians = Array.from({ length: 10 }).map(() => anchor.web3.Keypair.generate().publicKey);

    // test suite
    describe("SMPL Basic functionality", function(){
      this.beforeAll(async function(){
        console.log("Deploying SMPL Program...");
        deploySmpl();
        console.log("✔ SMPL Program deployed.");

        program = anchor.workspace.SquadsMpl as Program<SquadsMpl>;
        squads = Squads.localnet(provider.wallet, {
          commitmentOrConfig: "processed",
          multisigProgramId: anchor.workspace.SquadsMpl.programId,
          programManagerProgramId: anchor.workspace.ProgramManager.programId,
        });
        // the program-manager program / provider
        programManagerProgram = anchor.workspace
          .ProgramManager as Program<ProgramManager>;
      
        creator = (program.provider as anchor.AnchorProvider).wallet;
  
        // the Multisig PDA to use for the test run
        randomCreateKey = anchor.web3.Keypair.generate().publicKey;
        [msPDA] = getMsPDA(randomCreateKey, squads.multisigProgramId);
        [pmPDA] = getProgramManagerPDA(msPDA, squads.programManagerProgramId);
      
        member2 = anchor.web3.Keypair.generate();
      });

      it(`Create Multisig`, async function(){
        try {
          await squads.createMultisig(
            threshold,
            randomCreateKey,
            memberList.map((m) => m.publicKey),
            "Test Multisig",
            "Description for testing",
            "https://example.com/image.png",
            creator.publicKey, // primary member
            0,              // time lock (1 hour)
            initialGuardians               // 10 guardians
          );
        }catch(e){
          console.log("Error in createMultisig tx");
          throw e;
        }
        const vaultPDA = squads.getAuthorityPDA(msPDA, 1);

        const fundingTx = await createBlankTransaction(
          squads.connection,
          creator.publicKey
        );
        const fundingIx = await createTestTransferTransaction(
          creator.publicKey,
          vaultPDA,
          0.001 * 1000000000
        );

        fundingTx.add(fundingIx);
        try {
          await provider.sendAndConfirm(fundingTx);
        } catch (e) {
          console.log("Error in funding tx");
          throw e;
        }
        let msState = await squads.getMultisig(msPDA);
        expect(msState.threshold).to.equal(1);
        expect(msState.transactionIndex).to.equal(0);
        expect((msState.keys as any[]).length).to.equal(numberOfMembersTotal);

        const vaultAccount = await squads.connection.getParsedAccountInfo(
          vaultPDA,
          "processed"
        );
        expect(vaultAccount.value.lamports).to.equal(0.001 * 1000000000);
      });

      it(`Create Tx draft`,  async function(){
        // create a transaction draft
        const txState = await squads.createTransaction(msPDA, 1, {approvalByMultisig: {}});
        expect(txState.instructionIndex).to.equal(0);
        expect(txState.creator.toBase58()).to.equal(creator.publicKey.toBase58());

        // check the transaction indexes match
        const msState = await squads.getMultisig(msPDA);
        expect(txState.transactionIndex).to.equal(msState.transactionIndex);
      });

      it(`Add Ix to Tx`,  async function(){
        // create a transaction draft
        let txState = await squads.createTransaction(msPDA, 1,  {approvalByMultisig: {}});
        // check the transaction indexes match
        expect(txState.instructionIndex).to.equal(0);
        expect(txState.status).to.have.property("draft");

        const testIx = await createTestTransferTransaction(
          msPDA,
          creator.publicKey
        );
        const ixState = await squads.addInstruction(txState.publicKey, testIx);
        txState = await squads.getTransaction(txState.publicKey);
        expect(ixState.instructionIndex).to.equal(1);
        expect(txState.instructionIndex).to.equal(1);
      });

      it(`Tx Activate`,  async function(){
        // create a transaction draft
        let txState = await squads.createTransaction(msPDA, 1,  {approvalByMultisig: {}});
        const testIx = await createTestTransferTransaction(
          msPDA,
          creator.publicKey
        );
        let ixState = await squads.addInstruction(txState.publicKey, testIx);
        await squads.activateTransaction(txState.publicKey);

        txState = await squads.getTransaction(txState.publicKey);
        expect(txState.status).to.have.property("active");
        ixState = await squads.getInstruction(ixState.publicKey);
        expect(ixState.programId.toBase58()).to.equal(
          testIx.programId.toBase58()
        );
      });

      it(`Tx Sign`,  async function(){
        // create a transaction draft
        let txState = await squads.createTransaction(msPDA, 1,  {approvalByMultisig: {}});
        const testIx = await createTestTransferTransaction(
          msPDA,
          creator.publicKey
        );
        await squads.addInstruction(txState.publicKey, testIx);
        await squads.activateTransaction(txState.publicKey);
        await squads.approveTransaction(txState.publicKey);

        txState = await squads.getTransaction(txState.publicKey);
        expect(txState.approved.length).to.equal(1);
        expect(txState.status).to.have.property("executeReady");
      });

      it(`Transfer Tx Execute`,  async function(){
        // create authority to use (Vault, index 1)
        const authorityPDA = squads.getAuthorityPDA(msPDA, 1);

        // the test transfer instruction
        const testPayee = anchor.web3.Keypair.generate();
        const testIx = await createTestTransferTransaction(
          authorityPDA,
          testPayee.publicKey
        );

        let txState = await squads.createTransaction(msPDA, 1,  {approvalByMultisig: {}});
        await squads.addInstruction(txState.publicKey, testIx);
        await squads.activateTransaction(txState.publicKey);
        await squads.approveTransaction(txState.publicKey);
        txState = await squads.getTransaction(txState.publicKey);
        expect(txState.status).to.have.property("executeReady");

        // move funds to auth/vault
        const moveFundsToMsPDATx = await createBlankTransaction(
          squads.connection,
          creator.publicKey
        );
        const moveFundsToMsPDAIx = await createTestTransferTransaction(
          creator.publicKey,
          authorityPDA
        );
        moveFundsToMsPDATx.add(moveFundsToMsPDAIx);
        await provider.sendAndConfirm(moveFundsToMsPDATx);
        const authorityPDAFunded = await squads.connection.getAccountInfo(
          authorityPDA
        );
        expect(authorityPDAFunded.lamports).to.equal(2000000);

        await squads.executeTransaction(txState.publicKey);

        txState = await squads.getTransaction(txState.publicKey);

        expect(txState.status).to.have.property("executed");
        const testPayeeAccount = await squads.connection.getParsedAccountInfo(
          testPayee.publicKey
        );
        expect(testPayeeAccount.value.lamports).to.equal(1000000);
      });

      it(`2X Transfer Tx Execute`, async function() {
        // create authority to use (Vault, index 1)
        const authorityPDA = squads.getAuthorityPDA(msPDA, 1);

        // the test transfer instruction (2x)
        const testPayee = anchor.web3.Keypair.generate();
        const testIx = await createTestTransferTransaction(
          authorityPDA,
          testPayee.publicKey
        );
        const testIx2x = await createTestTransferTransaction(
          authorityPDA,
          testPayee.publicKey
        );

        let txState = await squads.createTransaction(msPDA, 1,  {approvalByMultisig: {}});
        await squads.addInstruction(txState.publicKey, testIx);
        await squads.addInstruction(txState.publicKey, testIx2x);
        await squads.activateTransaction(txState.publicKey);
        await squads.approveTransaction(txState.publicKey);

        // move funds to auth/vault
        const moveFundsToMsPDAIx = await createTestTransferTransaction(
          creator.publicKey,
          authorityPDA,
          3000000
        );

        const moveFundsToMsPDATx = await createBlankTransaction(
          squads.connection,
          creator.publicKey
        );
        moveFundsToMsPDATx.add(moveFundsToMsPDAIx);
        await provider.sendAndConfirm(moveFundsToMsPDATx);
        const msPDAFunded = await squads.connection.getAccountInfo(authorityPDA);
        expect(msPDAFunded.lamports).to.equal(4000000);

        await squads.executeTransaction(txState.publicKey);

        txState = await squads.getTransaction(txState.publicKey);
        expect(txState.status).to.have.property("executed");
        let testPayeeAccount = await squads.connection.getParsedAccountInfo(
          testPayee.publicKey
        );
        expect(testPayeeAccount.value.lamports).to.equal(2000000);
      });

      it(`2X Transfer Tx Sequential execute`, async function(){
        // create authority to use (Vault, index 1)
        const authorityPDA = squads.getAuthorityPDA(msPDA, 1);

        let txState = await squads.createTransaction(msPDA, 1,  {approvalByMultisig: {}});

        // person/entity who gets paid
        const testPayee = anchor.web3.Keypair.generate();

        ////////////////////////////////////////////////////////
        // add the first transfer

        // the test transfer instruction
        const testIx = await createTestTransferTransaction(
          authorityPDA,
          testPayee.publicKey
        );

        let ixState = await squads.addInstruction(txState.publicKey, testIx);

        //////////////////////////////////////////////////////////
        // add the second transfer ix

        const testIx2x = await createTestTransferTransaction(
          authorityPDA,
          testPayee.publicKey
        );
        let ix2State = await squads.addInstruction(txState.publicKey, testIx2x);
        await squads.activateTransaction(txState.publicKey);
        await squads.approveTransaction(txState.publicKey);

        // move funds to auth/vault
        const moveFundsToMsPDAIx = await createTestTransferTransaction(
          creator.publicKey,
          authorityPDA,
          3000000
        );
        const moveFundsToMsPDATx = await createBlankTransaction(
          squads.connection,
          creator.publicKey
        );
        moveFundsToMsPDATx.add(moveFundsToMsPDAIx);
        await provider.sendAndConfirm(moveFundsToMsPDATx);
        const msPDAFunded = await squads.connection.getAccountInfo(authorityPDA);
        // expect the vault to be correct:
        expect(msPDAFunded.lamports).to.equal(5000000);
        // lead with the expected program account, follow with the other accounts for the ix
        await squads.executeInstruction(txState.publicKey, ixState.publicKey);
        ixState = await squads.getInstruction(ixState.publicKey);
        txState = await squads.getTransaction(txState.publicKey);

        expect(txState.executedIndex).to.equal(1);

        await squads.executeInstruction(txState.publicKey, ix2State.publicKey);

        ix2State = await squads.getInstruction(ix2State.publicKey);
        txState = await squads.getTransaction(txState.publicKey);

        expect(txState.executedIndex).to.equal(2);
        expect(txState.status).to.have.property("executed");
      });

      it(`Change ms size with realloc`, async function(){
        let msAccount = await squads.connection.getParsedAccountInfo(msPDA);
        let msStateCheck = await squads.getMultisig(msPDA, "confirmed");
        const startKeys = msStateCheck.keys.length;
        const startRentLamports = msAccount.value.lamports;
        // get the current data size of the msAccount
        const currDataSize = msAccount.value.data.length;
        // get the current number of keys
        const currNumKeys = msStateCheck.keys.length;
        const currNumGuardians = msStateCheck.guardians.length;
        // get the number of spots left
        const SIZE_WITHOUT_MEMBERS = 8 + // Anchor discriminator
        2 +         // threshold value
        2 +         // authority index
        4 +         // transaction index
        4 +         // processed internal transaction index
        1 +         // PDA bump
        32 +        // creator
        1 +         // allow external execute
        4 +         // for vec length
        33 +        // primary member (one byte for option + 32 for Pubkey)
        4 +         // time lock
        4 +         // for guardians vec length
        32;         // padding alignment - base guardians length

        const spotsLeft = ((currDataSize - SIZE_WITHOUT_MEMBERS) / 32) - currNumKeys - currNumGuardians;

        // if there is less than 1 spot left, calculate rent needed for realloc of 10 more keys
        if(spotsLeft < 1){
          console.log("            MS needs more space")
          // add space for 10 more keys
          const neededLen = currDataSize + (10 * 32);
          // rent exempt lamports
          const rentExemptLamports = await squads.connection.getMinimumBalanceForRentExemption(neededLen);
          // top up lamports
          const topUpLamports = rentExemptLamports - msAccount.value.lamports;
          if(topUpLamports > 0){
            console.log("            MS needs more lamports, topping up ", topUpLamports);
            const topUpTx = await createBlankTransaction(squads.connection, creator.publicKey);
            const topUpIx = await createTestTransferTransaction(creator.publicKey, msPDA, topUpLamports);
            topUpTx.add(topUpIx);
            await provider.sendAndConfirm(topUpTx, undefined, {commitment: "confirmed"});
          }
        }
        // 1 get the instruction to create a transction
        // 2 get the instruction to add a member
        // 3 get the instruction to 'activate' the tx
        // 4 send over the transaction to the ms program with 1 - 3
        // use 0 as authority index
        const txBuilder = await squads.getTransactionBuilder(msPDA, 0);
        const [txInstructions, txPDA] = await (
          await txBuilder.withAddMember(member2.publicKey)
        ).getInstructions();
        const activateIx = await squads.buildActivateTransaction(msPDA, txPDA);

        let addMemberTx = await createBlankTransaction(
          squads.connection,
          creator.publicKey
        );
        addMemberTx.add(...txInstructions);
        addMemberTx.add(activateIx);

        try {
          await provider.sendAndConfirm(addMemberTx, undefined, {commitment: "confirmed"});
        } catch (e) {
          console.log("Error creating addMember transaction", e);
          throw e;
        }
        let txState = await squads.getTransaction(txPDA);
        try {
          await squads.approveTransaction(txPDA);
        }catch(e){
          console.log("error approving transaction", e);
          throw e;
        }

        txState = await squads.getTransaction(txPDA);
        expect(txState.status).has.property("executeReady");

        await squads.executeTransaction(txPDA);

        const msState = await squads.getMultisig(msPDA);
        msAccount = await program.provider.connection.getParsedAccountInfo(msPDA);
        const endRentLamports = msAccount.value.lamports;
        expect((msState.keys as any[]).length).to.equal(startKeys + 1);
        txState = await squads.getTransaction(txPDA);
        expect(txState.status).has.property("executed");
        expect(endRentLamports).to.be.greaterThan(startRentLamports);
      });

      // somewhat deprecated now as signAndSend falls back to wallet - needs to
      // be refactored to use a pure raw tx
      it(`Add a new member but creator is not executor`, async function(){
        // 1 get the instruction to create a transaction
        // 2 get the instruction to add a member
        // 3 get the instruction to 'activate' the tx
        // 4 send over the transaction to the ms program with 1 - 3
        // use 0 as authority index
        const newMember = anchor.web3.Keypair.generate().publicKey;
        const txBuilder = await squads.getTransactionBuilder(msPDA, 0);
        let msState = await squads.getMultisig(msPDA);
        const startKeys = msState.keys.length;
        const [txInstructions, txPDA] = await (
          await txBuilder.withAddMember(newMember)
        ).getInstructions();
        const activateIx = await squads.buildActivateTransaction(msPDA, txPDA);

        let addMemberTx = await createBlankTransaction(
          squads.connection,
          creator.publicKey
        );
        addMemberTx.add(...txInstructions);
        addMemberTx.add(activateIx);
        try {
          await provider.sendAndConfirm(addMemberTx, undefined, {commitment: "confirmed"});
        } catch (e) {
          console.log("unable to send add member tx");
          throw e;
        }
        let txState = await squads.getTransaction(txPDA);
        try {
          await squads.approveTransaction(txPDA);
        } catch (e) {
          console.log("unable to approve add member tx");
          throw e;
        }
        txState = await squads.getTransaction(txPDA);
        expect(txState.status).has.property("executeReady");
        await agnosticExecute(squads, txPDA, member2);

        txState = await squads.getTransaction(txPDA, "processed");
        expect(txState.status).has.property("executed");
        msState = await squads.getMultisig(msPDA, "confirmed");

        expect((msState.keys as any[]).length).to.equal(startKeys + 1);
      });

      it(`Transaction instruction failure`, async function(){
        // create authority to use (Vault, index 1)
        const authorityPDA = squads.getAuthorityPDA(msPDA, 1);
        let txState = await squads.createTransaction(msPDA, 1,  {approvalByMultisig: {}});

        // the test transfer instruction
        const testPayee = anchor.web3.Keypair.generate();
        const testIx = await createTestTransferTransaction(
          authorityPDA,
          testPayee.publicKey,
          anchor.web3.LAMPORTS_PER_SOL * 100
        );

        // add the instruction to the transaction
        await squads.addInstruction(txState.publicKey, testIx);
        await squads.activateTransaction(txState.publicKey);
        await squads.approveTransaction(txState.publicKey);

        try {
          await squads.executeTransaction(txState.publicKey);
        } catch (e) {
          // :(
          expect(e.message).to.include("failed");
        }

        txState = await squads.getTransaction(txState.publicKey);
        expect(txState.status).to.have.property("executeReady");
      });

      it(`Change threshold test`, async function(){
        const txBuilder = await squads.getTransactionBuilder(msPDA, 0);
        const [txInstructions, txPDA] = await (
          await txBuilder.withChangeThreshold(2)
        ).getInstructions();
        const emptyTx = await createBlankTransaction(
          squads.connection,
          creator.publicKey
        );
        emptyTx.add(...txInstructions);
        await provider.sendAndConfirm(emptyTx);
        await setTimeout(2000);
        // get the ix
        let ixState = await squads.getInstruction(
          getIxPDA(txPDA, new BN(1, 10), squads.multisigProgramId)[0]
        );
        expect(ixState.instructionIndex).to.equal(1);

        // activate the tx
        let txState = await squads.activateTransaction(txPDA);
        await setTimeout(2000);
        expect(txState.status).to.have.property("active");

        // approve the tx
        await squads.approveTransaction(txPDA);

        // get the TX
        txState = await squads.getTransaction(txPDA);
        expect(txState.status).to.have.property("executeReady");

        // execute the tx
        txState = await squads.executeTransaction(txPDA);
        const msState = await squads.getMultisig(msPDA);

        expect(msState.threshold).to.equal(2);
        expect(txState.status).to.have.property("executed");
        threshold = msState.threshold;
      });

      it(`Insufficient approval failure`, async function(){
        const txBuilder = await squads.getTransactionBuilder(msPDA, 0);
        const [txInstructions, txPDA] = await (
          await txBuilder.withChangeThreshold(2)
        ).executeInstructions();

        // get the ix
        let ixState = await squads.getInstruction(
          getIxPDA(txPDA, new BN(1, 10), squads.multisigProgramId)[0]
        );
        expect(ixState.instructionIndex).to.equal(1);

        // activate the tx
        let txState = await squads.activateTransaction(txPDA);
        expect(txState.status).to.have.property("active");

        // approve the tx
        await squads.approveTransaction(txPDA);

        // execute the tx
        try {
          await squads.executeTransaction(txPDA);
        } catch (e) {
          expect(e.message).to.contain("Error processing Instruction");
        }
      });

      it(`Change vote from approved to rejected`, async function(){
        const txBuilder = await squads.getTransactionBuilder(msPDA, 0);
        const [txInstructions, txPDA] = await (
          await txBuilder.withChangeThreshold(2)
        ).executeInstructions();

        // get the ix
        let ixState = await squads.getInstruction(
          getIxPDA(txPDA, new BN(1, 10), squads.multisigProgramId)[0]
        );
        expect(ixState.instructionIndex).to.equal(1);

        // activate the tx
        let txState = await squads.activateTransaction(txPDA);
        expect(txState.status).to.have.property("active");

        // approve the tx
        txState = await squads.approveTransaction(txPDA);

        // check that state is "approved"
        expect(txState.status).to.have.property("active");
        expect(
          txState.approved
            .map((k) => k.toBase58())
            .indexOf(creator.publicKey.toBase58())
        ).is.greaterThanOrEqual(0);

        // now reject
        txState = await squads.rejectTransaction(txPDA);
        expect(txState.status).to.have.property("active");
        expect(
          txState.rejected
            .map((k) => k.toBase58())
            .indexOf(creator.publicKey.toBase58())
        ).is.greaterThanOrEqual(0);
        expect(
          txState.approved
            .map((k) => k.toBase58())
            .indexOf(creator.publicKey.toBase58())
        ).is.lessThan(0);
      });

      it(`Add a new member & change threshold (conjoined)`, async function(){
        const newMember = anchor.web3.Keypair.generate().publicKey;
        const txBuilder = await squads.getTransactionBuilder(msPDA, 0);
        let msState =  await squads.getMultisig(msPDA);
        const startKeys = msState.keys.length;
        const startTxIndex = msState.transactionIndex;
        const [txInstructions, txPDA] = await (
          await txBuilder.withAddMemberAndChangeThreshold(newMember, 1)
        ).getInstructions();
        const activateIx = await squads.buildActivateTransaction(msPDA, txPDA);

        let addMemberTx = await createBlankTransaction(
          squads.connection,
          creator.publicKey
        );
        addMemberTx.add(...txInstructions);
        addMemberTx.add(activateIx);
        try {
          await provider.sendAndConfirm(addMemberTx), undefined, {commitment: "confirmed"};
        } catch (e) {
          console.log("Failed to send add member tx");
          throw e;
        }
        msState = await squads.getMultisig(msPDA);
        expect(startTxIndex + 1).to.equal(msState.transactionIndex);
        // get necessary signers
        // if the threshold has changed, use the other members to approve as well
        for (let i = 0; i < memberList.length; i++) {
          // check to see if we need more signers
          const approvalState = await squads.getTransaction(txPDA);
          if (Object.keys(approvalState.status).indexOf("active") < 0) {
            break;
          }

          const inMultisig = (msState.keys as anchor.web3.PublicKey[]).findIndex(
            (k) => {
              return k.toBase58() == memberList[i].publicKey.toBase58();
            }
          );
          if (inMultisig < 0) {
            continue;
          }
          try {
            await provider.connection.requestAirdrop(
              memberList[i].publicKey,
              anchor.web3.LAMPORTS_PER_SOL
            );
            const approveTx = await program.methods
              .approveTransaction()
              .accounts({
                multisig: msPDA,
                transaction: txPDA,
                member: memberList[i].publicKey,
              })
              .signers([memberList[i]])
              .transaction();
            try {
              await provider.sendAndConfirm(approveTx, [memberList[i]]);
            } catch (e) {
              console.log(memberList[i].publicKey.toBase58(), " signing error");
            }
          } catch (e) {
            console.log(e);
          }
        }

        let txState = await squads.getTransaction(txPDA);
        expect(txState.status).has.property("executeReady");

        const payer = memberList[4];
        await provider.connection.requestAirdrop(
          payer.publicKey,
          anchor.web3.LAMPORTS_PER_SOL
        );

        await agnosticExecute(squads, txPDA, payer);

        txState = await squads.getTransaction(txPDA);
        expect(txState.status).has.property("executed");
        msState = await squads.getMultisig(msPDA);
        threshold = msState.threshold;
        expect((msState.keys as any[]).length).to.equal(startKeys + 1);
        expect(msState.threshold).to.equal(1);
      });
    });

  });

});
