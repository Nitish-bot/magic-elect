#![allow(unexpected_cfgs, deprecated)]
use anchor_lang::prelude::*;

declare_id!("54LBqwXyuyXR5BsvHsGqX2jwyhdUjujU2deiKiNEKjA");

#[program]
pub mod magice {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.election_counter.count = 0;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub program_owner: Signer<'info>,
    #[account(
        init,
        payer = program_owner,
        space = 8 + Counter::INIT_SPACE,
        seeds = [ b"counter" ],
        bump,
    )]
    pub election_counter: Account<'info, Counter>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateElection<'info> {
    #[account(mut)]
    pub organiser: Signer<'info>,
    #[account(
        init,
        payer = organiser,
        space = 8 + Election::INIT_SPACE,
        seeds=[
            b"elecction",
            counter.count.to_be_bytes().as_ref(),
        ],
        bump,
    )]
    pub election: Account<'info, Election>,
    #[account(
        seeds = [ b"counter" ],
        bump,
    )]
    pub counter: Account<'info, Counter>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: u32)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(
        seeds=[
            b"election",
            id.to_be_bytes().as_ref(),
        ],
        bump,
    )]
    pub election: Account<'info, Election>,
}

#[derive(Accounts)]
#[instruction(id: u32)]
pub struct Reveal<'info> {
    #[account(mut)]
    pub organiser: Signer<'info>,
    #[account(
        seeds=[
            b"election",
            id.to_be_bytes().as_ref(),
        ],
        bump,
    )]
    pub election: Account<'info, Election>,
}


#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub count: u32,
}

#[account]
#[derive(InitSpace)]
pub struct Election {
    #[max_len(31)]
    pub name: String,
    #[max_len(10)]
    pub candidates: Vec<Candidate>,
    pub total_votes: u32,
    pub winner: Option<Candidate>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Candidate {
    #[max_len(31)]
    pub name: String,
    pub votes: u32,
}