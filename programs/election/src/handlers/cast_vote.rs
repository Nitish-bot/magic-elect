use crate::{errors::MagicElectionError, state::Election};
use anchor_lang::prelude::*;

pub fn cast_vote(ctx: Context<CastVote>, name: String) -> Result<()> {
    let election = &mut ctx.accounts.election;

    let candidate_pos = election
        .candidates
        .iter_mut()
        .position(|candidate| candidate.name == name.to_lowercase());

    require!(
        candidate_pos.is_some(),
        MagicElectionError::NoCandidateFound
    );

    election.candidates[candidate_pos.unwrap()].votes += 1;
    election.total_votes += 1;

    Ok(())
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(
        mut,
        seeds=[
            b"election",
            organiser.key().as_ref(),
        ],
        bump,
    )]
    pub election: Account<'info, Election>,
    /// CHECK: needless
    pub organiser: UncheckedAccount<'info>,
}
