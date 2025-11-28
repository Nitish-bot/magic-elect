use anchor_lang::prelude::*;

declare_id!("54LBqwXyuyXR5BsvHsGqX2jwyhdUjujU2deiKiNEKjA");

#[program]
pub mod magice {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
