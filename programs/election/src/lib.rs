#![allow(unexpected_cfgs, deprecated)]
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};
use magicblock_permission_client::instructions::{
    CreateGroupCpiBuilder, CreatePermissionCpiBuilder,
};

mod errors;
mod handlers;
mod state;

use handlers::*;
use state::Election;

declare_id!("6bQk3gRYVTWG9rKXKcK9Qnj3a9kozXsAWgMixFXt1yKs");

#[ephemeral]
#[program]
pub mod magice {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        handlers::initialize(ctx)
    }

    pub fn create_election(
        ctx: Context<CreateElection>,
        name: String,
        candidate_names: Vec<String>,
    ) -> Result<()> {
        handlers::create_election(ctx, name, candidate_names)
    }

    pub fn cast_vote(ctx: Context<CastVote>, name: String) -> Result<()> {
        handlers::cast_vote(ctx, name)
    }

    pub fn reveal(ctx: Context<RevealWinner>) -> Result<()> {
        handlers::reveal_winner(ctx)
    }

    /// Creates a permission group and permission for a election account using the external permission program.
    /// Calls out to the permission program to create a group and permission for the election account.
    pub fn create_permission(ctx: Context<CreatePermission>, id: Pubkey) -> Result<()> {
        let CreatePermission {
            organiser,
            permission,
            permission_program,
            group,
            election,
            system_program,
        } = ctx.accounts;

        // Step 1: Create a permission group with the
        // organiser so only the organiser has permission
        CreateGroupCpiBuilder::new(&permission_program)
            .group(&group)
            .id(id)
            .members(vec![organiser.key()])
            .payer(&organiser)
            .system_program(system_program)
            .invoke()?;

        // Step 3: Delegate the election account to make it
        // private then grant read/write permission to the group
        // !MPORTANT : Signature by the seeds of the delegated pda
        CreatePermissionCpiBuilder::new(&permission_program)
            .permission(&permission)
            .delegated_account(&election.to_account_info())
            .group(&group)
            .payer(&organiser)
            .system_program(system_program)
            .invoke_signed(&[&[organiser.key().as_ref(), &[ctx.bumps.election]]])?;

        Ok(())
    }

    // Delegates the election pda to the ER delegate program
    pub fn delegate(ctx: Context<DelegateElection>) -> Result<()> {
        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
        ctx.accounts.delegate_election(
            &ctx.accounts.organiser,
            &[b"election", ctx.accounts.organiser.key().as_ref()],
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;

        Ok(())
    }

    // Commit changes to base layer without undelegating
    pub fn commit(ctx: Context<CommitElection>) -> Result<()> {
        commit_accounts(
            &ctx.accounts.organiser,
            vec![&ctx.accounts.election.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        Ok(())
    }

    pub fn undelegate(ctx: Context<UndelegateElection>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.organiser,
            vec![&ctx.accounts.election.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreatePermission<'info> {
    #[account(mut)]
    pub organiser: Signer<'info>,
    #[account(
        seeds = [b"election", organiser.key().as_ref()],
        bump
    )]
    pub election: Account<'info, Election>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub group: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    pub permission_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateElection<'info> {
    #[account(mut)]
    pub organiser: Signer<'info>,
    /// CHECK: Checked by delegation program
    pub validator: Option<UncheckedAccount<'info>>,
    /// CHECK: The pda to delegate
    #[account(
        mut,
        del,
        seeds = [b"election", organiser.key().as_ref()],
        bump
    )]
    pub election: Account<'info, Election>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitElection<'info> {
    #[account(mut)]
    pub organiser: Signer<'info>,
    #[account(
        mut,
        seeds = [b"election", organiser.key().as_ref()],
        bump
    )]
    pub election: Account<'info, Election>,
}

#[commit]
#[derive(Accounts)]
pub struct UndelegateElection<'info> {
    #[account(mut)]
    pub organiser: Signer<'info>,
    #[account(
        mut,
        seeds = [b"election", organiser.key().as_ref()],
        bump
    )]
    pub election: Account<'info, Election>,
}
