import { SquadsMpl } from "../../target/types/squads_mpl";
import { ProgramManager } from "../../target/types/program_manager";
import { Idl, IdlTypes, MethodsNamespace } from "@coral-xyz/anchor";
import { IdlTypeDef } from "@coral-xyz/anchor/dist/cjs/idl";
import {
  AllInstructions,
  TypeDef,
} from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import { PublicKey } from "@solana/web3.js";
import { MethodsBuilder } from "@coral-xyz/anchor/dist/cjs/program/namespace/methods";

// Copied (with slight modification) from @project-serum/anchor/src/program/namespace/types (not exported)
type TypeDefDictionary<T extends IdlTypeDef[], Defined> = {
  [K in T[number]["name"]]: TypeDef<T[number] & { name: K }, Defined> & {
    publicKey: PublicKey;
  };
};

type AccountDefDictionary<T extends Idl> = TypeDefDictionary<
  NonNullable<T["accounts"]>,
  IdlTypes<T>
>;

export type MultisigAccount = AccountDefDictionary<SquadsMpl>["ms"];
export type TransactionAccount =
  AccountDefDictionary<SquadsMpl>["msTransaction"];
export type InstructionAccount =
  AccountDefDictionary<SquadsMpl>["msInstruction"];

export type ProgramManagerAccount =
  AccountDefDictionary<ProgramManager>["programManager"];
export type ManagedProgramAccount =
  AccountDefDictionary<ProgramManager>["managedProgram"];
export type ProgramUpgradeAccount =
  AccountDefDictionary<ProgramManager>["programUpgrade"];

export type SquadsMethods = MethodsBuilder<
  SquadsMpl,
  AllInstructions<SquadsMpl>
>;
export type SquadsMethodsNamespace = MethodsNamespace<
  SquadsMpl,
  AllInstructions<SquadsMpl>
>;

export type ProgramManagerMethodsNamespace = MethodsNamespace<
  ProgramManager,
  AllInstructions<ProgramManager>
>;

export type ApprovalMode = IdlTypes<SquadsMpl>["ApprovalMode"];

export type Period = IdlTypes<SquadsMpl>["Period"];

export type SpendingLimitAccount = AccountDefDictionary<SquadsMpl>["spendingLimit"];
