import { SquadsMpl } from "../../target/types/squads_mpl";
import { Idl, IdlTypes, MethodsNamespace } from "@coral-xyz/anchor";
import { IdlTypeDef } from "@coral-xyz/anchor/dist/cjs/idl";
import { AllInstructions, TypeDef } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import { PublicKey } from "@solana/web3.js";
import { MethodsBuilder } from "@coral-xyz/anchor/dist/cjs/program/namespace/methods";
declare type TypeDefDictionary<T extends IdlTypeDef[], Defined> = {
    [K in T[number]["name"]]: TypeDef<T[number] & {
        name: K;
    }, Defined> & {
        publicKey: PublicKey;
    };
};
declare type AccountDefDictionary<T extends Idl> = TypeDefDictionary<NonNullable<T["accounts"]>, IdlTypes<T>>;
export declare type MultisigAccount = AccountDefDictionary<SquadsMpl>["ms"];
export declare type TransactionAccount = AccountDefDictionary<SquadsMpl>["msTransaction"];
export declare type InstructionAccount = AccountDefDictionary<SquadsMpl>["msInstruction"];
export declare type SquadsMethods = MethodsBuilder<SquadsMpl, AllInstructions<SquadsMpl>>;
export declare type SquadsMethodsNamespace = MethodsNamespace<SquadsMpl, AllInstructions<SquadsMpl>>;
export declare type ApprovalMode = IdlTypes<SquadsMpl>["ApprovalMode"];
export declare type Member = IdlTypes<SquadsMpl>["Member"];
export declare type Period = IdlTypes<SquadsMpl>["Period"];
export declare type SpendingLimitAccount = AccountDefDictionary<SquadsMpl>["spendingLimit"];
export {};
