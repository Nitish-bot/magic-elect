use anchor_lang::prelude::*;

use crate::{
    errors::MagicElectionError,
    state::{Candidate, Counter, Election},
};

pub fn create_election(
    ctx: Context<CreateElection>,
    name: String,
    candidate_names: Vec<String>,
) -> Result<()> {
    require!(name.len() <= 31, MagicElectionError::ElectionNameTooLong);
    require!(
        candidate_names.len() <= 10,
        MagicElectionError::CandidateLimitExceeded
    );

    let candidate_names_correct_size = candidate_names.iter().all(|name| name.len() <= 31);
    require!(
        candidate_names_correct_size,
        MagicElectionError::CandidateNameTooLong
    );

    let election = &mut ctx.accounts.election;
    let counter = &mut ctx.accounts.counter;

    let candidates = candidate_names
        .iter()
        .map(|name| Candidate {
            name: name.to_string().to_lowercase(),
            votes: 0,
        })
        .collect();
    election.id = counter.count;
    election.name = name;
    election.candidates = candidates;
    election.total_votes = 0;
    election.winner = None;

    counter.count = counter
        .count
        .checked_add(1)
        .ok_or(MagicElectionError::CounterOverflow)?;

    Ok(())
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
            b"election",
            organiser.key().as_ref(),
        ],
        bump,
    )]
    pub election: Account<'info, Election>,
    #[account(
        mut,
        seeds = [ b"counter" ],
        bump,
    )]
    pub counter: Account<'info, Counter>,
    pub system_program: Program<'info, System>,
}
