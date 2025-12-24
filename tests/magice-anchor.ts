import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Magice } from "../target/types/magice"; // Adjust path to your types
import {
  PublicKey,
  Keypair,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount,
  getAuthToken,
  groupPdaFromId,
  PERMISSION_PROGRAM_ID,
  permissionPdaFromAccount,
  waitUntilPermissionActive,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import * as nacl from "tweetnacl";
import { decode } from "bs58";
import "dotenv/config";

const TEE_RPC = "https://tee.magicblock.app";
const TEE_WS = "wss://tee.magicblock.app";
const TEE_VALIDATOR_ADDRESS = new PublicKey(
  "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"
);

// Helper to load keypair from env or generate
const loadKeypair = (envVar: string): Keypair => {
  const secret = process.env[envVar];
  if (!secret) return Keypair.generate();
  try {
    // Attempt to parse as JSON array
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(secret)));
  } catch {
    // Fallback to base58 string
    return Keypair.fromSecretKey(decode(secret));
  }
};

describe("Election with magic", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Magice as Program<Magice>;

  let alice: Keypair;
  let bob: Keypair;
  let counterPDA: PublicKey;
  let electionPDA: PublicKey;

  // Ephemeral connection/program
  let ephemeralProvider: anchor.AnchorProvider;
  let ephemeralProgram: Program<Magice>;

  let groupId: PublicKey;
  const validator = TEE_VALIDATOR_ADDRESS;

  before(async () => {
    // 1. Setup Wallets
    alice = loadKeypair("ALICE");
    bob = loadKeypair("BOB");

    // Airdrop if on localnet/devnet and wallets are empty
    if (
      (await provider.connection.getBalance(alice.publicKey)) < LAMPORTS_PER_SOL
    ) {
      await provider.connection.requestAirdrop(
        alice.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.requestAirdrop(
        bob.publicKey,
        2 * LAMPORTS_PER_SOL
      );
    }

    groupId = Keypair.generate().publicKey;

    // 2. Setup MagicBlock / Ephemeral Connection
    // In v1/Anchor, we sign directly with the keypair using nacl
    const signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
      return nacl.sign.detached(message, alice.secretKey);
    };

    const token = await getAuthToken(TEE_RPC, alice.publicKey, signMessage);

    // Create connection to TEE with Auth Token
    const ephemeralConnection = new Connection(`${TEE_RPC}/?token=${token}`, {
      wsEndpoint: TEE_WS,
      commitment: "confirmed",
    });

    // Create a provider for the ephemeral chain using Alice's wallet
    const aliceWallet = new anchor.Wallet(alice);
    ephemeralProvider = new anchor.AnchorProvider(
      ephemeralConnection,
      aliceWallet,
      { commitment: "confirmed" }
    );

    // Create a program instance attached to the Ephemeral Provider
    ephemeralProgram = new Program(
      program.idl,
      program.programId,
      ephemeralProvider
    );

    // 3. Derive PDAs
    [counterPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      program.programId
    );
  });

  it("Alice inits and holds authority of the program", async () => {
    try {
      const tx = await program.methods
        .initialize()
        .accounts({
          programOwner: alice.publicKey,
          electionCounter: counterPDA,
          //   systemProgram: anchor.web3.SystemProgram.programId, // Anchor usually infers this
        })
        .signers([alice])
        .rpc();
      console.log("Program initialized with signature", tx);
    } catch (error) {
      console.log("MOST PROBABLY already initted if on devnet");
    }
  });

  it("Alice creates an election", async () => {
    const candidateNames = ["Virat Kohli", "Rohit Sharma"];

    // Derive Election PDA
    [electionPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("election"), alice.publicKey.toBuffer()],
      program.programId
    );

    try {
      const tx = await program.methods
        .createElection("Who wins superbowl", candidateNames)
        .accounts({
          organiser: alice.publicKey,
          election: electionPDA,
          counter: counterPDA,
        })
        .signers([alice])
        .rpc();
      console.log("Alice created an election with sig", tx);
    } catch (error) {
      console.log(
        "one organiser can only create one election, most probably already created"
      );
    }
  });

  it("Create permission", async () => {
    const permission = await permissionPdaFromAccount(electionPDA);
    const group = await groupPdaFromId(groupId);

    const tx = await program.methods
      .createPermission(groupId) // Assuming `id` argument corresponds to groupId
      .accounts({
        organiser: alice.publicKey,
        election: electionPDA,
        permission: permission,
        group: group,
        permissionProgram: PERMISSION_PROGRAM_ID,
        // systemProgram inferred
      })
      .signers([alice])
      .rpc();

    console.log("permission created with sig", tx);

    // The kit usually requires the connection to check active status
    await waitUntilPermissionActive(TEE_RPC, electionPDA);
  });

  it("Delegate election", async () => {
    const bufferElection = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
      electionPDA,
      program.programId
    );
    const delegationRecordElection =
      delegationRecordPdaFromDelegatedAccount(electionPDA);
    const delegationMetadataElection =
      delegationMetadataPdaFromDelegatedAccount(electionPDA);

    const tx = await program.methods
      .delegate()
      .accounts({
        organiser: alice.publicKey,
        validator: validator,
        election: electionPDA,
        bufferElection: bufferElection,
        delegationRecord: delegationRecordElection,
        delegationMetadata: delegationMetadataElection,
        // delegationProgram: ... (If your instruction expects the magicblock program ID, add it here)
      })
      .signers([alice])
      .rpc();

    console.log("Delegate election program with sig", tx);
  });

  it("Alice and Bob vote on delegated election (Ephemeral)", async () => {
    // Wait for state sync
    await new Promise((r) => setTimeout(r, 5000));

    try {
      // Bob votes
      // Note: We use the ephemeralProgram here
      const txBob = await ephemeralProgram.methods
        .castVote("Virat Kohli", alice.publicKey) // Arguments match instruction args
        .accounts({
          voter: bob.publicKey,
          election: electionPDA,
        })
        .signers([bob]) // Bob must sign
        .rpc();

      console.log("Bob voted on ephemeral:", txBob);

      // Alice votes
      const txAlice = await ephemeralProgram.methods
        .castVote("Virat Kohli", alice.publicKey)
        .accounts({
          voter: alice.publicKey,
          election: electionPDA,
        })
        .signers([alice])
        .rpc();

      console.log("Alice voted on ephemeral:", txAlice);
    } catch (e) {
      console.error("Voting failed:", e);
      throw e;
    }
  });

  it("You cannot access and read the election data on Base Layer", async () => {
    try {
      // Fetch using base provider
      const electionAccount = await program.account.election.fetch(electionPDA);
      console.log(
        "Retrieved base info (should be stale or empty):",
        electionAccount.totalVotes.toString()
      );
      // Depending on your logic, you might want to assert failure here if the account is closed/moved
    } catch (e) {
      console.log(
        "We werent able to read data on base (Expected if strictly delegated)"
      );
    }
  });

  it("You can access on ER if you have permission", async () => {
    // Fetch using ephemeral program instance
    const electionAccount = await ephemeralProgram.account.election.fetch(
      electionPDA
    );
    assert.ok(electionAccount, "Account should exist on ER");
    console.log("ED from ER with permission:", electionAccount);
  });

  it("Commit and see if it can now be seen on base layer", async () => {
    // Commit must be sent to Ephemeral chain (usually) to trigger the state diff propagation
    // Check your specific MR/ER logic. Usually, `commit` is an instruction on the ER that pushes state down.

    const tx = await ephemeralProgram.methods
      .commit()
      .accounts({
        organiser: alice.publicKey,
        election: electionPDA,
      })
      .signers([alice])
      .rpc();

    console.log("Committed with sig:", tx);

    // Give it a moment to settle on Base
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const electionAccount = await program.account.election.fetch(electionPDA);
      console.log("ED from base after commit:", electionAccount);
    } catch (e) {
      console.log("Failed to read data on base after commit");
    }
  });

  it("Undelegate", async () => {
    // Undelegate is usually called on the EPHEMERAL chain to close the session
    const tx = await ephemeralProgram.methods
      .undelegate()
      .accounts({
        organiser: alice.publicKey,
        election: electionPDA,
      })
      .signers([alice])
      .rpc();

    console.log("Successfully undelegated with sig:", tx);
  });

  it("Alice reveals the winner", async () => {
    // Back on Base layer
    const tx = await program.methods
      .reveal()
      .accounts({
        organiser: alice.publicKey,
        election: electionPDA,
      })
      .signers([alice])
      .rpc();

    console.log("Alice reveals winner with sig", tx);
  });
});
