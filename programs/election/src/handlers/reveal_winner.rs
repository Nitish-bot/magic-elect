use anchor_lang::prelude::*;

use crate::{errors::MagicElectionError, state::Election};

pub fn reveal_winner(ctx: Context<RevealWinner>) -> Result<()> {
    let election = &mut ctx.accounts.election;

    require!(
        election.winner.is_none(),
        MagicElectionError::WinnerDeclared
    );
    require!(election.total_votes > 0, MagicElectionError::ZeroVotes);

    let winner = election
        .candidates
        .iter()
        .max_by_key(|candidate| candidate.votes);

    require!(winner.is_some(), MagicElectionError::NoCandidates);

    election.winner = winner.cloned();

    Ok(())
}

#[derive(Accounts)]
pub struct RevealWinner<'info> {
    #[account(mut)]
    pub organiser: Signer<'info>,
    #[account(
        mut,
        seeds=[
            b"election",
            organiser.key().as_ref(),
        ],
        bump,
    )]
    pub election: Account<'info, Election>,
}
