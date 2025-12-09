#![allow(unexpected_cfgs, deprecated)]
use anchor_lang::prelude::*;

mod structs;
mod errors;

use structs::*;
use errors::MagicElectionError;

declare_id!("54LBqwXyuyXR5BsvHsGqX2jwyhdUjujU2deiKiNEKjA");

#[program]
pub mod magice {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.election_counter.count = 1;
        Ok(())
    }

    pub fn create_election(ctx: Context<CreateElection>, name: String, candidate_names: Vec<String>) -> Result<()> {
        require!(name.len() <= 31, MagicElectionError::ElectionNameTooLong);
        require!(candidate_names.len() <= 10, MagicElectionError::CandidateLimitExceeded);
        
        let candidate_names_correct_size = candidate_names.iter().all(|name| name.len() <= 31);
        require!(candidate_names_correct_size, MagicElectionError::CandidateNameTooLong);

        let election = &mut ctx.accounts.election;
        let counter = &mut ctx.accounts.counter;

        let candidates = candidate_names
            .iter()
            .map(|name| {
                Candidate {
                    name: name.to_string().to_lowercase(),
                    votes: 0,
                }
            })
            .collect();
        election.id = counter.count;
        election.name = name;
        election.candidates = candidates;
        election.total_votes = 0;
        election.winner = None;
        
        counter.count = counter.count.checked_add(1).ok_or(MagicElectionError::CounterOverflow)?;
        
        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, name: String) -> Result<()> {
        let election = &mut ctx.accounts.election;
        
        let candidate_pos = election.candidates
            .iter_mut()
            .position(|candidate| candidate.name == name.to_lowercase());
            
        require!(candidate_pos.is_some(), MagicElectionError::NoCandidateFound);
                
        election.candidates[candidate_pos.unwrap()].votes += 1;
        election.total_votes += 1;
        
        Ok(())
    }

    pub fn reveal(ctx: Context<RevealWinner>) -> Result<()> {
        let election = &mut ctx.accounts.election;

        require!(election.winner.is_none(), MagicElectionError::WinnerDeclared);
        require!(election.total_votes > 0, MagicElectionError::ZeroVotes);

        let winner = election.candidates
            .iter()
            .max_by_key(|candidate| candidate.votes);

        require!(winner.is_some(), MagicElectionError::NoCandidates);

        election.winner = winner.cloned();

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