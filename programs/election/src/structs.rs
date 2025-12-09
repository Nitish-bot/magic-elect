use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub count: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Election {
    pub id: u64,
    #[max_len(31)]
    pub name: String,
    #[max_len(10)]
    pub candidates: Vec<Candidate>,
    pub total_votes: u64,
    pub winner: Option<Candidate>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Candidate {
    #[max_len(31)]
    pub name: String,
    pub votes: u64,
}