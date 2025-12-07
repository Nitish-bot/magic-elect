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
        election.name = name;
        election.candidates = candidates;
        election.total_votes = 0;
        election.winner = None;
        
        counter.count = counter.count.checked_add(1).ok_or(MagicElectionError::CounterOverflow)?;
        
        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, name: String, id: u32) -> Result<()> {
        let election = &mut ctx.accounts.election;
        
        if let Some(candidate) = election.candidates
            .iter_mut()
            .find(|candidate| candidate.name == name.to_lowercase()) {
                candidate.votes += 1;
            }
        
        Ok(())
    }

    pub fn reveal(ctx: Context<RevealWinner>, id: u32) -> Result<()> {
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
pub struct RevealWinner<'info> {
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