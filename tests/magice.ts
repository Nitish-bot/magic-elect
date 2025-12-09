import { before, describe, test } from "node:test";

import * as programClient from "../client";
import {
  MAGICE_PROGRAM_ADDRESS,
} from "../client";

import {
  type KeyPairSigner,
  type Address,
} from "@solana/kit";
import { connect, Connection } from "solana-kite";

export const stringify = (object: any) => {
  const bigIntReplacer = (key: string, value: any) =>
    typeof value === "bigint" ? value.toString() : value;
  return JSON.stringify(object, bigIntReplacer, 2);
};

describe("Election with no magic", () => {
  let alice: KeyPairSigner;
  let bob: KeyPairSigner;
  let charlie: KeyPairSigner;
  let counterPDA: Address;
  let election: Address;
  let connection: Connection;

  before(async () => {
    connection = connect();
    [alice, bob, charlie] = await connection.createWallets(3);

    const counterPDAAndBump = await connection.getPDAAndBump(
      MAGICE_PROGRAM_ADDRESS,
      ["counter"]
    );
    counterPDA = counterPDAAndBump.pda;
  });

  test("Alice inits and owns the program", async () => {
    const initInstruction = programClient.getInitializeInstruction({
      programOwner: alice,
      electionCounter: counterPDA,
    });

    const signature = await connection.sendTransactionFromInstructions({
      feePayer: alice,
      instructions: [initInstruction],
    });

    console.log("Program initialized with signature", signature);
  });

  test("Alice creates an election", async () => {
    const electionPDAAndBump = await connection.getPDAAndBump(
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

    const signature = await connection.sendTransactionFromInstructions({
      feePayer: alice,
      instructions: [createElectionInstruction],
    });

    console.log("Alice created an election with sig", signature);
  });

  test("Bob and Charlie vote on it", async () => {
    const bobCastVoteInstruction = programClient.getCastVoteInstruction({
      voter: bob,
      election,
      name: "Virat Kohli",
      organiser: alice,
    });
    const charlieCastVoteInstruction = programClient.getCastVoteInstruction({
      voter: charlie,
      election,
      name: "Virat Kohli",
      organiser: alice,
    });

    const bobSignature = await connection.sendTransactionFromInstructions({
      feePayer: bob,
      instructions: [bobCastVoteInstruction],
    });
    const charlieSignature = await connection.sendTransactionFromInstructions({
      feePayer: charlie,
      instructions: [charlieCastVoteInstruction],
    });

    console.log("Bob and Charlie cast votes for Kohli with sig");
  });

  test("Alice reveals the winner", async () => {
    const revealInstruction = programClient.getRevealInstruction({
      organiser: alice,
      election,
    });

    const signature = await connection.sendTransactionFromInstructions({
      feePayer: alice,
      instructions: [revealInstruction],
    });

    console.log("Alice reveals winner with sig", signature);
  });
});
