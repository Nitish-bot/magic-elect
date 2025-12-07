use anchor_lang::prelude::*;

#[error_code]
pub enum MagicElectionError {
  #[msg("Election counter overflow")]
  CounterOverflow,

  #[msg("More than 10 candidates supplied")]
  CandidateLimitExceeded,

  #[msg("Name of election is more than 31 characters")]
  ElectionNameTooLong,
  
  #[msg("Name of candidate in the election is more than 31 characters")]
  CandidateNameTooLong,

  #[msg("Winner has already been declared")]
  WinnerDeclared,

  #[msg("Can't declare winner with no candidates in the election")]
  NoCandidates,

  #[msg("Can't declare winner with 0 votes")]
  ZeroVotes,
}
