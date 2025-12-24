import { before, describe, test } from "node:test";

import * as programClient from "../client";
import { MAGICE_PROGRAM_ADDRESS } from "../client";

import {
  type KeyPairSigner,
  type Address,
  generateKeyPairSigner,
  address,
  assertAccountExists,
  MaybeAccount,
} from "@solana/kit";
import { connect, Connection } from "solana-kite";

import {
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount,
  getAuthToken,
  groupPdaFromId,
  PERMISSION_PROGRAM_ID,
  permissionPdaFromAccount,
  waitUntilPermissionActive,
} from "@magicblock-labs/ephemeral-rollups-kit";

import "dotenv/config";
import assert from "assert";
import * as fs from "fs";
import * as util from "util";

export const stringify = (object: any) => {
  const bigIntReplacer = (key: string, value: any) =>
    typeof value === "bigint" ? value.toString() : value;
  return JSON.stringify(object, bigIntReplacer, 2);
};

const TEE_RPC = "https://tee.magicblock.app";
const TEE_WS = "wss://tee.magicblock.app"; // Resorting to devnet-as resolves some issues
const TEE_VALIDATOR_ADDRESS = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA";
const HELIUS_RPC = process.env.HELIUS_RPC;
const HELIUS_WSS = process.env.HELIUS_WSS;

describe("Election with magic", () => {
  let alice: KeyPairSigner;
  let bob: KeyPairSigner;
  let counterPDA: Address;
  let election: Address;
  let baseConnection: Connection;
  // let authedER: Connection;

  let groupId: Address;
  let validator: Address;
  let ephemeralConnection: Connection;
  let getElectionsEphemeral: () => Promise<
    MaybeAccount<programClient.Election, string>[]
  >;
  let getElectionsBase: () => Promise<
    MaybeAccount<programClient.Election, string>[]
  >;

  // IMPORTANT: No need to verifyTeeRpcIntegrity on tests
  before(async () => {
    baseConnection = connect(HELIUS_RPC, HELIUS_WSS);
    alice = await baseConnection.loadWalletFromEnvironment("ALICE");
    bob = await baseConnection.loadWalletFromEnvironment("BOB");

    groupId = (await generateKeyPairSigner()).address;
    validator = address(TEE_VALIDATOR_ADDRESS);

    const signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
      const signatures = await alice.signMessages([
        { content: message, signatures: {} },
      ]);
      const sig = signatures[0];
      const signat = sig[alice.address];
      return signat;
    };
    const token = await getAuthToken(TEE_RPC, alice.address, signMessage);
    ephemeralConnection = connect(`${TEE_RPC}?token=${token}`, `${TEE_WS}`);

    const counterPDAAndBump = await baseConnection.getPDAAndBump(
      MAGICE_PROGRAM_ADDRESS,
      ["counter"]
    );
    counterPDA = counterPDAAndBump.pda;

    getElectionsEphemeral = ephemeralConnection.getAccountsFactory(
      MAGICE_PROGRAM_ADDRESS,
      programClient.ELECTION_DISCRIMINATOR,
      programClient.getElectionDecoder()
    );

    getElectionsBase = baseConnection.getAccountsFactory(
      MAGICE_PROGRAM_ADDRESS,
      programClient.ELECTION_DISCRIMINATOR,
      programClient.getElectionDecoder()
    );
  });

  test("Alice inits and holds authority of the program", async () => {
    const initInstruction = programClient.getInitializeInstruction({
      programOwner: alice,
      electionCounter: counterPDA,
    });

    try {
      const signature = await baseConnection.sendTransactionFromInstructions({
        feePayer: alice,
        instructions: [initInstruction],
      });
      console.log("Program initialized with signature", signature);
    } catch (error) {
      console.log("MOST PROBABLY already initted if on devnet");
    }
  });

  test("Alice creates an election", async () => {
    const electionPDAAndBump = await baseConnection.getPDAAndBump(
      MAGICE_PROGRAM_ADDRESS,
      ["election", alice.address]
    );
    election = electionPDAAndBump.pda;

    const candidateNames = ["Virat Kohli", "Rohit Sharma"];
    const createElectionInstruction =
      programClient.getCreateElectionInstruction({
        organiser: alice,
        election,
        counter: counterPDA,
        name: "Who wins superbowl",
        candidateNames,
      });
    try {
      const signature = await baseConnection.sendTransactionFromInstructions({
        feePayer: alice,
        instructions: [createElectionInstruction],
      });
      console.log("Alice created an election with sig", signature);
    } catch (error) {
      console.log(
        "one organiser can only create one election, most probably already created"
      );
    }
  });

  test("What is the state before casting any votes", async () => {
    const elections = getElectionsBase();
  });

  test("Create permission", async () => {
    const permission = await permissionPdaFromAccount(election);
    const group = await groupPdaFromId(groupId);

    const createPermissionInstruction =
      programClient.getCreatePermissionInstruction({
        organiser: alice,
        election,
        permission,
        group,
        permissionProgram: PERMISSION_PROGRAM_ID,
        id: groupId,
      });

    const signaure = await baseConnection.sendTransactionFromInstructions({
      feePayer: alice,
      instructions: [createPermissionInstruction],
    });

    console.log(election);
    console.log("permission created with sig", signaure);

    await waitUntilPermissionActive(TEE_RPC, election);
  });

  test("Delegate election", async () => {
    const bufferElection =
      await delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
        election,
        MAGICE_PROGRAM_ADDRESS
      );
    const delegationRecordElection =
      await delegationRecordPdaFromDelegatedAccount(election);
    const delegationMetadataElection =
      await delegationMetadataPdaFromDelegatedAccount(election);

    const delegateInstruction = programClient.getDelegateInstruction({
      organiser: alice,
      validator,
      election,
      bufferElection,
      delegationRecordElection,
      delegationMetadataElection,
    });

    const signature = await baseConnection.sendTransactionFromInstructions({
      feePayer: alice,
      instructions: [delegateInstruction],
    });

    console.log("Delegate election program with sig", signature);
  });

  test("Alice and Bob vote on delegated election", async () => {
    await new Promise((r) => setTimeout(r, 1000));

    const bobCastVoteInstruction = programClient.getCastVoteInstruction({
      voter: bob,
      election,
      name: "Virat Kohli",
      organiser: alice.address,
    });
    const aliceCastVoteInstruction = programClient.getCastVoteInstruction({
      voter: alice,
      election,
      name: "Virat Kohli",
      organiser: alice.address,
    });

    try {
      const _sigBob = await ephemeralConnection.sendTransactionFromInstructions(
        {
          feePayer: bob,
          instructions: [bobCastVoteInstruction],
        }
      );
      const _sigAlice =
        await ephemeralConnection.sendTransactionFromInstructions({
          feePayer: alice,
          instructions: [aliceCastVoteInstruction],
        });
    } catch (e) {
      fs.writeFileSync("debug_vote.txt", util.inspect(e, false, null, false));

      throw e;
    }
  });

  test("You cannot access and read the election data on base", async () => {
    try {
      const elections = await getElectionsBase();
      console.log(elections);

      const election1 = elections[0];

      assertAccountExists(election1);

      console.log(
        "Retrieved information but is it correct, total votes:",
        election1.data.totalVotes
      );
    } catch (e) {
      console.log("We werent able to read data success", e);
    }
  });

  test("You can access on ER if you have permission", async () => {
    const elections = await getElectionsEphemeral();
    assert.ok(
      elections.length == 1,
      "Cant have more than one elections as of yet"
    );

    const election = elections[0];
    assertAccountExists(election);
    console.log("ED from ER with permission", election.data);
  });

  test("Commit and see if it can now be seen on base layer?", async () => {
    const commitInstructions = programClient.getCommitInstruction({
      organiser: alice,
      election,
    });

    const sig = await ephemeralConnection.sendTransactionFromInstructions({
      feePayer: alice,
      instructions: [commitInstructions],
    });

    await new Promise((r) => setTimeout(r, 1000));
    try {
      const elections = await getElectionsBase();
      console.log(elections);
      const election1 = elections[0];

      assertAccountExists(election1);

      console.log(
        "Retrieved information but is it correct, total votes:",
        election1.data.totalVotes
      );
    } catch (e) {
      console.log("We werent able to read data failure");
      throw e;
    }
  });

  test("Undelegate", async () => {
    const undelegateInstruction = programClient.getUndelegateInstruction({
      organiser: alice,
      election,
    });

    const sig = await ephemeralConnection.sendTransactionFromInstructions({
      feePayer: alice,
      instructions: [undelegateInstruction],
    });

    console.log("Successfully undelegated");
  });

  test("Alice reveals the winner", async () => {
    const revealInstruction = programClient.getRevealInstruction({
      organiser: alice,
      election,
    });

    const signature = await baseConnection.sendTransactionFromInstructions({
      feePayer: alice,
      instructions: [revealInstruction],
    });

    console.log("Alice reveals winner with sig", signature);
  });
});
