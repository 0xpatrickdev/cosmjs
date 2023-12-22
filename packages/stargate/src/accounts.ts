import { Pubkey } from "@cosmjs/amino";
import { Uint64 } from "@cosmjs/math";
import { decodeOptionalPubkey } from "@cosmjs/proto-signing";
import { assert } from "@cosmjs/utils";
import { BaseAccount, ModuleAccount } from "cosmjs-types/cosmos/auth/v1beta1/auth";
import {
  BaseVestingAccount,
  ContinuousVestingAccount,
  DelayedVestingAccount,
  PeriodicVestingAccount,
} from "cosmjs-types/cosmos/vesting/v1beta1/vesting";
import { Any } from "cosmjs-types/google/protobuf/any";

export interface Account {
  /** Bech32 account address */
  readonly address: string;
  readonly pubkey: Pubkey | null;
  readonly accountNumber: number;
  readonly sequence: number;
}

function uint64FromProto(input: number | bigint): Uint64 {
  return Uint64.fromString(input.toString());
}

function accountFromBaseAccount(input: BaseAccount): Account {
  const { address, pubKey, accountNumber, sequence } = input;
  const pubkey = decodeOptionalPubkey(pubKey);
  return {
    address: address,
    pubkey: pubkey,
    accountNumber: uint64FromProto(accountNumber).toNumber(),
    sequence: uint64FromProto(sequence).toNumber(),
  };
}

/**
 * Represents a generic function that takes an `Any` encoded account from the chain
 * and extracts some common `Account` information from it.
 */
export type AccountParser = (any: Any) => Account;

export type AccountParserRegistry = Map<Any["typeUrl"], AccountParser>;

export class AccountParserManager {
  private readonly registry = new Map<string, AccountParser>();

  public constructor(initialRegistry: AccountParserRegistry = new Map()) {
    this.registry = initialRegistry;
  }

  public register(typeUrl: string, parser: AccountParser): void {
    this.registry.set(typeUrl, parser);
  }

  public parseAccount(input: Any): Account {
    const parser = this.registry.get(input.typeUrl);
    if (!parser) {
      throw new Error(`Unsupported type: '${input.typeUrl}'`);
    }
    return parser(input);
  }
}

export function createAccountParserRegistry(): AccountParserRegistry {
  const parseBaseAccount: AccountParser = ({ value }: Any): Account => {
    return accountFromBaseAccount(BaseAccount.decode(value));
  };

  const parseModuleAccount: AccountParser = ({ value }: Any): Account => {
    const baseAccount = ModuleAccount.decode(value).baseAccount;
    assert(baseAccount);
    return accountFromBaseAccount(baseAccount);
  };

  const parseBaseVestingAccount: AccountParser = ({ value }: Any): Account => {
    const baseAccount = BaseVestingAccount.decode(value)?.baseAccount;
    assert(baseAccount);
    return accountFromBaseAccount(baseAccount);
  };

  const parseContinuousVestingAccount: AccountParser = ({ value }: Any): Account => {
    const baseAccount = ContinuousVestingAccount.decode(value)?.baseVestingAccount?.baseAccount;
    assert(baseAccount);
    return accountFromBaseAccount(baseAccount);
  };

  const parseDelayedVestingAccount: AccountParser = ({ value }: Any): Account => {
    const baseAccount = DelayedVestingAccount.decode(value)?.baseVestingAccount?.baseAccount;
    assert(baseAccount);
    return accountFromBaseAccount(baseAccount);
  };

  const parsePeriodicVestingAccount: AccountParser = ({ value }: Any): Account => {
    const baseAccount = PeriodicVestingAccount.decode(value)?.baseVestingAccount?.baseAccount;
    assert(baseAccount);
    return accountFromBaseAccount(baseAccount);
  };

  return new Map<Any["typeUrl"], AccountParser>([
    ["/cosmos.auth.v1beta1.BaseAccount", parseBaseAccount],
    ["/cosmos.auth.v1beta1.ModuleAccount", parseModuleAccount],
    ["/cosmos.vesting.v1beta1.BaseVestingAccount", parseBaseVestingAccount],
    ["/cosmos.vesting.v1beta1.ContinuousVestingAccount", parseContinuousVestingAccount],
    ["/cosmos.vesting.v1beta1.DelayedVestingAccount", parseDelayedVestingAccount],
    ["/cosmos.vesting.v1beta1.PeriodicVestingAccount", parsePeriodicVestingAccount],
  ]);
}

/**
 * Basic implementation of AccountParser. This is supposed to support the most relevant
 * common Cosmos SDK account types. If you need support for exotic account types,
 * you'll need to use `AccountParserManager` and `createAccountParserRegistry` directly.
 */
export function accountFromAny(input: Any): Account {
  const accountParser = new AccountParserManager(createAccountParserRegistry());
  return accountParser.parseAccount(input);
}
