export declare type SquadsMpl = {
    "version": "1.3.1";
    "name": "squads_mpl";
    "instructions": [
        {
            "name": "create";
            "docs": [
                "Creates a new multisig account"
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "creator";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "threshold";
                    "type": "u16";
                },
                {
                    "name": "createKey";
                    "type": "publicKey";
                },
                {
                    "name": "members";
                    "type": {
                        "vec": "publicKey";
                    };
                },
                {
                    "name": "meta";
                    "type": "string";
                },
                {
                    "name": "primaryMember";
                    "type": {
                        "option": "publicKey";
                    };
                },
                {
                    "name": "timeLock";
                    "type": "u32";
                },
                {
                    "name": "guardians";
                    "type": {
                        "vec": "publicKey";
                    };
                }
            ];
        },
        {
            "name": "addMember";
            "docs": [
                "The instruction to add a new member to the multisig.",
                "Adds member/key to the multisig and reallocates space if neccessary",
                "If the multisig needs to be reallocated, it must be prefunded with",
                "enough lamports to cover the new size."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "rent";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "newMember";
                    "type": "publicKey";
                }
            ];
        },
        {
            "name": "removeMember";
            "docs": [
                "The instruction to remove a member from the multisig"
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [
                {
                    "name": "oldMember";
                    "type": "publicKey";
                }
            ];
        },
        {
            "name": "removeMemberAndChangeThreshold";
            "docs": [
                "The instruction to change the threshold of the multisig and simultaneously remove a member"
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [
                {
                    "name": "oldMember";
                    "type": "publicKey";
                },
                {
                    "name": "newThreshold";
                    "type": "u16";
                }
            ];
        },
        {
            "name": "addMemberAndChangeThreshold";
            "docs": [
                "The instruction to change the threshold of the multisig and simultaneously add a member"
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "rent";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "newMember";
                    "type": "publicKey";
                },
                {
                    "name": "newThreshold";
                    "type": "u16";
                }
            ];
        },
        {
            "name": "changeThreshold";
            "docs": [
                "The instruction to change the threshold of the multisig"
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [
                {
                    "name": "newThreshold";
                    "type": "u16";
                }
            ];
        },
        {
            "name": "addAuthority";
            "docs": [
                "instruction to increase the authority value tracked in the multisig",
                "This is optional, as authorities are simply PDAs, however it may be helpful",
                "to keep track of commonly used authorities in a UI.",
                "This has no functional impact on the multisig or its functionality, but",
                "can be used to track commonly used authorities (ie, vault 1, vault 2, etc.)"
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [];
        },
        {
            "name": "createTransaction";
            "docs": [
                "Instruction to create a multisig transaction.",
                "Each transaction is tied to a single authority, and must be specified when",
                "creating the instruction below. authority 0 is reserved for internal",
                "instructions, whereas authorities 1 or greater refer to a vault,",
                "upgrade authority, or other."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "transaction";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "creator";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "authorityIndex";
                    "type": "u32";
                },
                {
                    "name": "mode";
                    "type": {
                        "defined": "ApprovalMode";
                    };
                }
            ];
        },
        {
            "name": "activateTransaction";
            "docs": [
                "Instruction to set the state of a transaction \"active\".",
                "\"active\" transactions can then be signed off by multisig members"
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "transaction";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "creator";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [];
        },
        {
            "name": "addInstruction";
            "docs": [
                "Instruction to attach an instruction to a transaction.",
                "Transactions must be in the \"draft\" status, and any",
                "signer (aside from execution payer) specified in an instruction",
                "must match the authority PDA specified during the transaction creation."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "transaction";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "instruction";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "creator";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "incomingInstruction";
                    "type": {
                        "defined": "IncomingInstruction";
                    };
                }
            ];
        },
        {
            "name": "approveTransaction";
            "docs": [
                "Instruction to approve a transaction on behalf of a member.",
                "The transaction must have an \"active\" status"
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "transaction";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "member";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [];
        },
        {
            "name": "rejectTransaction";
            "docs": [
                "Instruction to reject a transaction.",
                "The transaction must have an \"active\" status."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "transaction";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "member";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [];
        },
        {
            "name": "cancelTransaction";
            "docs": [
                "Instruction to cancel a transaction.",
                "Transactions must be in the \"executeReady\" status.",
                "Transaction will only be cancelled if the number of",
                "cancellations reaches the threshold. A cancelled",
                "transaction will no longer be able to be executed."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "transaction";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "member";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [];
        },
        {
            "name": "executeTransaction";
            "docs": [
                "Instruction to execute a transaction.",
                "Transaction status must be \"executeReady\", and the account list must match",
                "the unique indexed accounts in the following manner:",
                "[ix_1_account, ix_1_program_account, ix_1_remaining_account_1, ix_1_remaining_account_2, ...]",
                "",
                "Refer to the README for more information on how to construct the account list."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "transaction";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "member";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [
                {
                    "name": "accountList";
                    "type": "bytes";
                }
            ];
        },
        {
            "name": "executeInstruction";
            "docs": [
                "Instruction to sequentially execute attached instructions.",
                "Instructions executed in this matter must be executed in order,",
                "this may be helpful for processing large batch transfers.",
                "This instruction can only be used for transactions with an authority",
                "index of 1 or greater.",
                "",
                "NOTE - do not use this instruction if there is not total clarity around",
                "potential side effects, as this instruction implies that the approved",
                "transaction will be executed partially, and potentially spread out over",
                "a period of time. This could introduce problems with state and failed",
                "transactions. For example: a program invoked in one of these instructions",
                "may be upgraded between executions and potentially leave one of the",
                "necessary accounts in an invalid state."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "transaction";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "instruction";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "member";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [];
        },
        {
            "name": "updatePrimaryMember";
            "docs": [
                "The instruction to update the primary member of the multisig."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [
                {
                    "name": "newPrimaryMember";
                    "type": {
                        "option": "publicKey";
                    };
                }
            ];
        },
        {
            "name": "removePrimaryMember";
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "remover";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [];
        },
        {
            "name": "updateTimeLock";
            "docs": [
                "The instruction to update the time lock duration of the multisig."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [
                {
                    "name": "newTimeLock";
                    "type": "u32";
                }
            ];
        },
        {
            "name": "addGuardian";
            "docs": [
                "The instruction to add a new guardian to the multisig."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [
                {
                    "name": "newGuardian";
                    "type": "publicKey";
                }
            ];
        },
        {
            "name": "removeGuardian";
            "docs": [
                "The instruction to remove a guardian from the multisig."
            ];
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                }
            ];
            "args": [
                {
                    "name": "oldGuardian";
                    "type": "publicKey";
                }
            ];
        },
        {
            "name": "addSpendingLimit";
            "accounts": [
                {
                    "name": "spendingLimit";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "rentPayer";
                    "isMut": true;
                    "isSigner": true;
                    "docs": [
                        "This is usually the same as `config_authority`, but can be a different account if needed."
                    ];
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "mint";
                    "type": "publicKey";
                },
                {
                    "name": "authorityIndex";
                    "type": "u32";
                },
                {
                    "name": "amount";
                    "type": "u64";
                },
                {
                    "name": "period";
                    "type": {
                        "defined": "Period";
                    };
                }
            ];
        },
        {
            "name": "removeSpendingLimit";
            "docs": [
                "Method to remove a spending limit"
            ];
            "accounts": [
                {
                    "name": "spendingLimit";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [];
        },
        {
            "name": "spendingLimitSolUse";
            "accounts": [
                {
                    "name": "multisig";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "spendingLimit";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "destination";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "vault";
                    "isMut": true;
                    "isSigner": false;
                },
                {
                    "name": "primaryMember";
                    "isMut": true;
                    "isSigner": true;
                },
                {
                    "name": "systemProgram";
                    "isMut": false;
                    "isSigner": false;
                },
                {
                    "name": "rent";
                    "isMut": false;
                    "isSigner": false;
                }
            ];
            "args": [
                {
                    "name": "amount";
                    "type": "u64";
                }
            ];
        }
    ];
    "accounts": [
        {
            "name": "ms";
            "docs": [
                "Ms is the basic state account for a multisig."
            ];
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "threshold";
                        "type": "u16";
                    },
                    {
                        "name": "authorityIndex";
                        "type": "u16";
                    },
                    {
                        "name": "transactionIndex";
                        "type": "u32";
                    },
                    {
                        "name": "msChangeIndex";
                        "type": "u32";
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    },
                    {
                        "name": "createKey";
                        "type": "publicKey";
                    },
                    {
                        "name": "allowExternalExecute";
                        "type": "bool";
                    },
                    {
                        "name": "keys";
                        "type": {
                            "vec": "publicKey";
                        };
                    },
                    {
                        "name": "primaryMember";
                        "type": {
                            "option": "publicKey";
                        };
                    },
                    {
                        "name": "timeLock";
                        "type": "u32";
                    },
                    {
                        "name": "guardians";
                        "type": {
                            "vec": "publicKey";
                        };
                    }
                ];
            };
        },
        {
            "name": "msTransaction";
            "docs": [
                "The MsTransaction is the state account for a multisig transaction"
            ];
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "creator";
                        "type": "publicKey";
                    },
                    {
                        "name": "ms";
                        "type": "publicKey";
                    },
                    {
                        "name": "transactionIndex";
                        "type": "u32";
                    },
                    {
                        "name": "authorityIndex";
                        "type": "u32";
                    },
                    {
                        "name": "authorityBump";
                        "type": "u8";
                    },
                    {
                        "name": "status";
                        "type": {
                            "defined": "MsTransactionStatus";
                        };
                    },
                    {
                        "name": "instructionIndex";
                        "type": "u8";
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    },
                    {
                        "name": "approved";
                        "type": {
                            "vec": "publicKey";
                        };
                    },
                    {
                        "name": "rejected";
                        "type": {
                            "vec": "publicKey";
                        };
                    },
                    {
                        "name": "cancelled";
                        "type": {
                            "vec": "publicKey";
                        };
                    },
                    {
                        "name": "executedIndex";
                        "type": "u8";
                    },
                    {
                        "name": "mode";
                        "type": {
                            "defined": "ApprovalMode";
                        };
                    }
                ];
            };
        },
        {
            "name": "msInstruction";
            "docs": [
                "The state account for an instruction that is attached to a transaction.",
                "Almost analagous to the native Instruction struct for solana, but with an extra",
                "field for the bump."
            ];
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "programId";
                        "type": "publicKey";
                    },
                    {
                        "name": "keys";
                        "type": {
                            "vec": {
                                "defined": "MsAccountMeta";
                            };
                        };
                    },
                    {
                        "name": "data";
                        "type": "bytes";
                    },
                    {
                        "name": "instructionIndex";
                        "type": "u8";
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    },
                    {
                        "name": "executed";
                        "type": "bool";
                    }
                ];
            };
        },
        {
            "name": "spendingLimit";
            "docs": [
                "Spending Limit struct"
            ];
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "multisig";
                        "docs": [
                            "The multisig this belongs to."
                        ];
                        "type": "publicKey";
                    },
                    {
                        "name": "authorityIndex";
                        "docs": [
                            "The index of the vault that the spending limit is for."
                        ];
                        "type": "u32";
                    },
                    {
                        "name": "authorityBump";
                        "docs": [
                            "Authority bump"
                        ];
                        "type": "u8";
                    },
                    {
                        "name": "mint";
                        "docs": [
                            "The token mint the spending limit is for.",
                            "Pubkey::default() means SOL.",
                            "use NATIVE_MINT for Wrapped SOL."
                        ];
                        "type": "publicKey";
                    },
                    {
                        "name": "amount";
                        "docs": [
                            "The amount of tokens that can be spent in a period.",
                            "This amount is in decimals of the mint,",
                            "so 1 SOL would be `1_000_000_000` and 1 USDC would be `1_000_000`."
                        ];
                        "type": "u64";
                    },
                    {
                        "name": "period";
                        "docs": [
                            "The reset period of the spending limit.",
                            "When it passes, the remaining amount is reset, unless it's `Period::OneTime`."
                        ];
                        "type": {
                            "defined": "Period";
                        };
                    },
                    {
                        "name": "remainingAmount";
                        "docs": [
                            "The remaining amount of tokens that can be spent in the current period.",
                            "When reaches 0, the spending limit cannot be used anymore until the period reset."
                        ];
                        "type": "u64";
                    },
                    {
                        "name": "lastReset";
                        "docs": [
                            "Unix timestamp marking the last time the spending limit was reset (or created)."
                        ];
                        "type": "i64";
                    },
                    {
                        "name": "bump";
                        "docs": [
                            "PDA bump."
                        ];
                        "type": "u8";
                    }
                ];
            };
        }
    ];
    "types": [
        {
            "name": "MsAccountMeta";
            "docs": [
                "Wrapper for our internal MsInstruction key serialization schema",
                "MsAccount meta is identical to the AccountMeta struct, but defined",
                "here for serialization purposes."
            ];
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "pubkey";
                        "type": "publicKey";
                    },
                    {
                        "name": "isSigner";
                        "type": "bool";
                    },
                    {
                        "name": "isWritable";
                        "type": "bool";
                    }
                ];
            };
        },
        {
            "name": "IncomingInstruction";
            "docs": [
                "Incoming instruction schema, used as an argument in the attach_instruction.",
                "Identical to the solana struct for Instruction, but uses the MsAccountMeta.",
                "Provided for de/serialization purposes."
            ];
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "programId";
                        "type": "publicKey";
                    },
                    {
                        "name": "keys";
                        "type": {
                            "vec": {
                                "defined": "MsAccountMeta";
                            };
                        };
                    },
                    {
                        "name": "data";
                        "type": "bytes";
                    }
                ];
            };
        },
        {
            "name": "MsTransactionStatus";
            "docs": [
                "MsTransactionStatus enum of the current status of the Multisig Transaction."
            ];
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Draft";
                        "fields": [
                            {
                                "name": "timestamp";
                                "type": "i64";
                            }
                        ];
                    },
                    {
                        "name": "Active";
                        "fields": [
                            {
                                "name": "timestamp";
                                "type": "i64";
                            }
                        ];
                    },
                    {
                        "name": "ExecuteReady";
                        "fields": [
                            {
                                "name": "timestamp";
                                "type": "i64";
                            }
                        ];
                    },
                    {
                        "name": "Executed";
                        "fields": [
                            {
                                "name": "timestamp";
                                "type": "i64";
                            }
                        ];
                    },
                    {
                        "name": "Rejected";
                        "fields": [
                            {
                                "name": "timestamp";
                                "type": "i64";
                            }
                        ];
                    },
                    {
                        "name": "Cancelled";
                        "fields": [
                            {
                                "name": "timestamp";
                                "type": "i64";
                            }
                        ];
                    }
                ];
            };
        },
        {
            "name": "ApprovalMode";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "ApprovalByPrimaryMember";
                    },
                    {
                        "name": "ApprovalByMultisig";
                    }
                ];
            };
        },
        {
            "name": "Period";
            "docs": [
                "Period enum"
            ];
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "Daily";
                    },
                    {
                        "name": "Weekly";
                    },
                    {
                        "name": "Monthly";
                    }
                ];
            };
        }
    ];
    "errors": [
        {
            "code": 6000;
            "name": "KeyNotInMultisig";
        },
        {
            "code": 6001;
            "name": "InvalidTransactionState";
        },
        {
            "code": 6002;
            "name": "InvalidNumberOfAccounts";
        },
        {
            "code": 6003;
            "name": "InvalidInstructionAccount";
        },
        {
            "code": 6004;
            "name": "InvalidAuthorityIndex";
        },
        {
            "code": 6005;
            "name": "TransactionAlreadyExecuted";
        },
        {
            "code": 6006;
            "name": "CannotRemoveSoloMember";
        },
        {
            "code": 6007;
            "name": "InvalidThreshold";
        },
        {
            "code": 6008;
            "name": "DeprecatedTransaction";
        },
        {
            "code": 6009;
            "name": "InstructionFailed";
        },
        {
            "code": 6010;
            "name": "MaxMembersReached";
        },
        {
            "code": 6011;
            "name": "EmptyMembers";
        },
        {
            "code": 6012;
            "name": "PartialExecution";
        },
        {
            "code": 6013;
            "name": "NotEnoughLamports";
        },
        {
            "code": 6014;
            "name": "TimeLockNotSatisfied";
        },
        {
            "code": 6015;
            "name": "NoPrimaryMemberSpecified";
        },
        {
            "code": 6016;
            "name": "PrimaryMemberNotInMultisig";
        },
        {
            "code": 6017;
            "name": "UnauthorizedMember";
        },
        {
            "code": 6018;
            "name": "TimeLockExceedsMaximum";
        },
        {
            "code": 6019;
            "name": "GuardianAlreadyExists";
        },
        {
            "code": 6020;
            "name": "GuardianNotFound";
        },
        {
            "code": 6021;
            "name": "MaxGuardiansReached";
        },
        {
            "code": 6022;
            "name": "InvalidApprovalModeForExecution";
        },
        {
            "code": 6023;
            "name": "TimeError";
        },
        {
            "code": 6024;
            "name": "MissingAccount";
        },
        {
            "code": 6025;
            "name": "SpendingLimitNotFound";
        },
        {
            "code": 6026;
            "name": "SpendingLimitExceeded";
        },
        {
            "code": 6027;
            "name": "SpendingLimitMustBeForSol";
        }
    ];
};
export declare const IDL: SquadsMpl;
