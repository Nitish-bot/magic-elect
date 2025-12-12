use anchor_lang::prelude::*;

use crate::state::Counter;

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    ctx.accounts.election_counter.count = 1;
    Ok(())
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
